import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { load } from "cheerio";
import JSZip from "jszip";

import { DocumentIngestionError } from "./errors";
import type {
  DocumentSourceType,
  IngestionConfig,
  NormalizedBlock,
  NormalizedBlockKind,
  NormalizedDocument,
  NormalizedPage,
  ParserOutput,
  PdfPageClassification,
} from "./types";
import { NORMALIZED_DOCUMENT_SCHEMA_VERSION } from "./types";

const execFileAsync = promisify(execFile);
const MIN_PAGE_TEXT_LENGTH = 5;

function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInlineText(value: string) {
  return cleanText(value).replace(/\s*\n\s*/g, " ").trim();
}

function sourceTypeFromPath(filePath: string): DocumentSourceType {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".doc":
      return "doc";
    case ".html":
    case ".htm":
      return "html";
    case ".txt":
      return "txt";
    default:
      throw new DocumentIngestionError(
        `不支持的文档格式：${extension || "无扩展名"}`,
        "UNSUPPORTED_FORMAT",
      );
  }
}

function makeDocument(
  sourceType: DocumentSourceType,
  extractionMethod: "native" | "ocr",
  pages: NormalizedPage[],
  metadata: NormalizedDocument["metadata"] = {},
): NormalizedDocument {
  return {
    schemaVersion: NORMALIZED_DOCUMENT_SCHEMA_VERSION,
    sourceType,
    extractionMethod,
    pages,
    metadata,
  };
}

function makeSinglePage(
  text: string,
  blocks: NormalizedBlock[],
  pageNumber: number | null,
): NormalizedPage {
  return { pageNumber, text: cleanText(text), blocks };
}

interface StructureState {
  sections: Array<{ level: number; text: string }>;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(xml: string, name: string) {
  return new RegExp(`${name}=["']([^"']+)["']`).exec(xml)?.[1];
}

function extractXmlText(xml: string) {
  const tokens = xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\s*\/?\s*>|<w:br(?:\s[^>]*)?\/?\s*>/g) ?? [];
  return cleanText(tokens.map((token) => {
    if (token.startsWith("<w:tab")) return "\t";
    if (token.startsWith("<w:br")) return "\n";
    return decodeXml(token.replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, ""));
  }).join(""));
}

function articleNumberFromText(text: string) {
  return /^(第[零〇一二三四五六七八九十百千万\d]+条)/.exec(text)?.[1];
}

function looksLikeHeading(text: string) {
  const compact = text.replace(/\s+/g, "");
  return compact.length <= 80 && !/[。；！？]/.test(compact) && /^(第[零〇一二三四五六七八九十百千万\d]+[编章节部分]|[零〇一二三四五六七八九十]+、|[（(][零〇一二三四五六七八九十]+[)）])/.test(compact);
}

function headingLevel(text: string) {
  if (/^第[零〇一二三四五六七八九十百千万\d]+[编章节部分]/.test(text) || /^[零〇一二三四五六七八九十]+、/.test(text)) return 1;
  if (/^[（(][零〇一二三四五六七八九十]+[)）]/.test(text)) return 2;
  return 1;
}

function blockKindForText(text: string, fallback: NormalizedBlockKind = "paragraph", options: { isHeading?: boolean; isListItem?: boolean } = {}) {
  if (options.isHeading || looksLikeHeading(text)) return "heading" as const;
  if (options.isListItem) return "list-item" as const;
  return fallback;
}

function enrichBlock(block: NormalizedBlock, state: StructureState): NormalizedBlock {
  if (block.kind === "heading") {
    const level = headingLevel(block.text);
    state.sections = [...state.sections.filter((section) => section.level < level), { level, text: block.text }];
  }
  const articleNumber = articleNumberFromText(block.text);
  return {
    ...block,
    ...(state.sections.length ? { sectionPath: state.sections.map((section) => section.text) } : {}),
    ...(articleNumber ? { articleNumber } : {}),
  };
}

function normalizeHtmlDocument(
  html: string,
  sourceType: "html" | "docx",
  metadata: NormalizedDocument["metadata"] = {},
): NormalizedDocument {
  const $ = load(html);
  $("script, style, noscript, nav, footer, template").remove();
  const blocks: NormalizedBlock[] = [];
  const state: StructureState = { sections: [] };
  const counters: Record<string, number> = {};

  $("h1, h2, h3, h4, h5, h6, p, li, table").each((_, element) => {
    const node = $(element);
    const tagName = element.tagName.toLowerCase();
    if (tagName !== "table" && node.closest("table").length > 0) {
      return;
    }
    if (tagName === "table") {
      const rows: string[] = [];
      node.find("tr").each((__, row) => {
        const cells = $(row).find("th, td").map((___, cell) => cleanInlineText($(cell).text())).get().filter(Boolean);
        if (cells.length) rows.push(cells.join(" | "));
      });
      const text = rows.join("\n").trim();
      if (text) {
        counters.table = (counters.table ?? 0) + 1;
        blocks.push(enrichBlock({ kind: "table", text, locator: `table:${counters.table}` }, state));
      }
      return;
    }
    const text = cleanInlineText(node.text());
    if (!text) {
      return;
    }
    const kind = blockKindForText(text, "paragraph", { isHeading: tagName.startsWith("h"), isListItem: tagName === "li" });
    counters[kind] = (counters[kind] ?? 0) + 1;
    blocks.push(enrichBlock({ kind, text, locator: `${kind}:${counters[kind]}` }, state));
  });

  const bodyText = cleanInlineText($("body").text() || $.root().text());
  if (blocks.length === 0 && bodyText) {
    blocks.push({ kind: "text", text: bodyText });
  }

  return makeDocument(
    sourceType,
    "native",
    [makeSinglePage(bodyText, blocks, null)],
    metadata,
  );
}

export function parseTextDocument(
  contents: string,
  metadata: NormalizedDocument["metadata"] = {},
): NormalizedDocument {
  const normalized = contents.replace(/\r\n?/g, "\n").trim();
  const state: StructureState = { sections: [] };
  const blocks: NormalizedBlock[] = [];
  const lines = normalized.split("\n");
  let startLine = 1;
  let current: string[] = [];
  const flush = (endLine: number) => {
    const text = cleanText(current.join("\n"));
    if (text) {
      const kind = blockKindForText(text);
      blocks.push(enrichBlock({ kind, text, locator: `line:${startLine}-${endLine}` }, state));
    }
    current = [];
  };
  lines.forEach((line, index) => {
    if (line.trim()) current.push(line);
    else {
      flush(index);
      startLine = index + 2;
    }
  });
  flush(lines.length);
  if (blocks.length === 0 && normalized) {
    blocks.push({ kind: "text", text: normalized, locator: `line:1-${lines.length}` });
  }
  return makeDocument("txt", "native", [makeSinglePage(normalized, blocks, null)], metadata);
}

export function parseHtmlDocument(
  contents: string,
  sourceType: "html" | "docx" = "html",
  metadata: NormalizedDocument["metadata"] = {},
): NormalizedDocument {
  return normalizeHtmlDocument(contents, sourceType, metadata);
}

export async function parseDocxDocument(
  buffer: Buffer,
  metadata: NormalizedDocument["metadata"] = {},
): Promise<NormalizedDocument> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    const stylesXml = await zip.file("word/styles.xml")?.async("string");
    if (!documentXml) throw new Error("缺少 word/document.xml");

    const styleNames = new Map<string, string>();
    for (const style of stylesXml?.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? []) {
      const styleId = xmlAttribute(style, "w:styleId");
      const name = xmlAttribute(style.match(/<w:name\b[^>]*>/)?.[0] ?? "", "w:val");
      if (styleId && name) styleNames.set(styleId, name);
    }
    const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(documentXml)?.[1] ?? "";
    const nodes = body.match(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
    const blocks: NormalizedBlock[] = [];
    const state: StructureState = { sections: [] };
    let paragraphNumber = 0;
    let tableNumber = 0;
    for (const node of nodes) {
      if (node.startsWith("<w:tbl")) {
        const rows = (node.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []).map((row) =>
          (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map(extractXmlText).filter(Boolean).join(" | "),
        ).filter(Boolean);
        if (rows.length) {
          tableNumber += 1;
          blocks.push(enrichBlock({ kind: "table", text: rows.join("\n"), locator: `table:${tableNumber}` }, state));
        }
        continue;
      }
      const text = extractXmlText(node);
      if (!text) continue;
      paragraphNumber += 1;
      const styleId = xmlAttribute(node.match(/<w:pStyle\b[^>]*>/)?.[0] ?? "", "w:val");
      const styleName = styleId ? styleNames.get(styleId) ?? styleId : "";
      const kind = blockKindForText(text, "paragraph", {
        isHeading: /(^|\s)heading\s*[1-9]?|标题|title/i.test(styleName),
        isListItem: /<w:numPr\b/.test(node),
      });
      blocks.push(enrichBlock({ kind, text, locator: `paragraph:${paragraphNumber}` }, state));
    }
    return makeDocument("docx", "native", [makeSinglePage(blocks.map((block) => block.text).join("\n"), blocks, null)], metadata);
  } catch (error) {
    throw new DocumentIngestionError(
      `DOCX 解析失败：${error instanceof Error ? error.message : String(error)}`,
      "PARSER_FAILED",
      error,
    );
  }
}

interface PdfTextPage {
  pageNumber: number;
  text: string;
  blocks: NormalizedBlock[];
}

function classifyPdfPages(
  pages: PdfTextPage[],
  textCoverageThreshold = 0.05,
): PdfPageClassification {
  const hasText = pages.some((page) => page.text.length >= MIN_PAGE_TEXT_LENGTH);
  const hasImageOnly = pages.some((page) => page.text.length < MIN_PAGE_TEXT_LENGTH);
  const textPageCoverage =
    pages.length === 0
      ? 0
      : pages.filter((page) => page.text.length >= MIN_PAGE_TEXT_LENGTH).length /
        pages.length;
  if (hasText && textPageCoverage < textCoverageThreshold) {
    return "image_only";
  }
  if (hasText && hasImageOnly) {
    return "mixed";
  }
  return hasText ? "text" : "image_only";
}

export async function extractPdfPages(
  buffer: Buffer,
  textCoverageThreshold = 0.05,
): Promise<{
  pages: PdfTextPage[];
  classification: PdfPageClassification;
  imageOnlyPageNumbers: number[];
}> {
  try {
    installPdfJsNodePolyfills();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
    ).toString();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pages: PdfTextPage[] = [];
    const state: StructureState = { sections: [] };

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanText(
        content.items
          .filter((item) => "str" in item)
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
      const blocks = text
        ? [enrichBlock({
            kind: blockKindForText(text),
            text,
            locator: `page:${pageNumber}:block:1`,
            sourcePage: pageNumber,
          }, state)]
        : [];
      pages.push({ pageNumber, text, blocks });
      page.cleanup();
    }

    const classification = classifyPdfPages(pages, textCoverageThreshold);
    return {
      pages,
      classification,
      imageOnlyPageNumbers: pages
        .filter((page) => page.text.length < MIN_PAGE_TEXT_LENGTH)
        .map((page) => page.pageNumber),
    };
  } catch (error) {
    throw new DocumentIngestionError(
      `PDF 文本层解析失败：${error instanceof Error ? error.message : String(error)}`,
      "PARSER_FAILED",
      error,
    );
  }
}

function installPdfJsNodePolyfills() {
  const runtime = globalThis as typeof globalThis & {
    DOMMatrix?: typeof DOMMatrix;
    Path2D?: typeof Path2D;
  };

  if (!runtime.DOMMatrix) {
    class NodeDomMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      is2D = true;

      constructor(init?: number[]) {
        if (init && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }

      translate(x: number, y: number) {
        this.e += x;
        this.f += y;
        return this;
      }

      scale(x: number, y = x) {
        this.a *= x;
        this.d *= y;
        return this;
      }

      invertSelf() {
        const determinant = this.a * this.d - this.b * this.c;
        if (determinant === 0) {
          return this;
        }
        const [a, b, c, d, e, f] = [this.a, this.b, this.c, this.d, this.e, this.f];
        this.a = d / determinant;
        this.b = -b / determinant;
        this.c = -c / determinant;
        this.d = a / determinant;
        this.e = (c * f - d * e) / determinant;
        this.f = (b * e - a * f) / determinant;
        return this;
      }

      multiplySelf(other: NodeDomMatrix) {
        this.a = this.a * other.a + this.c * other.b;
        this.b = this.b * other.a + this.d * other.b;
        this.c = this.a * other.c + this.c * other.d;
        this.d = this.b * other.c + this.d * other.d;
        this.e = this.a * other.e + this.c * other.f + this.e;
        this.f = this.b * other.e + this.d * other.f + this.f;
        return this;
      }

      preMultiplySelf(other: NodeDomMatrix) {
        return other.multiplySelf(this);
      }
    }
    runtime.DOMMatrix = NodeDomMatrix as unknown as typeof DOMMatrix;
  }

  if (!runtime.Path2D) {
    class NodePath2D {
      addPath() {
        return this;
      }
    }
    runtime.Path2D = NodePath2D as unknown as typeof Path2D;
  }
}

export async function parsePdfDocument(
  buffer: Buffer,
  metadata: NormalizedDocument["metadata"] = {},
  textCoverageThreshold = 0.05,
): Promise<ParserOutput> {
  const extracted = await extractPdfPages(buffer, textCoverageThreshold);
  const normalized = makeDocument(
    "pdf",
    "native",
    extracted.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      blocks: page.blocks,
    })),
    { ...metadata, pdfPageClassification: extracted.classification },
  );
  return {
    normalized,
    pdfPageClassification: extracted.classification,
    imageOnlyPageNumbers: extracted.imageOnlyPageNumbers,
  };
}

async function convertDocToDocx(
  filePath: string,
  config: IngestionConfig,
): Promise<{ buffer: Buffer; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "legal-doc-convert-"));
  try {
    await execFileAsync(
      config.officeCommand,
      ["--headless", "--convert-to", "docx", "--outdir", tempDir, filePath],
      { timeout: 120_000, windowsHide: true },
    );
    const outputPath = path.join(
      tempDir,
      `${path.basename(filePath, path.extname(filePath))}.docx`,
    );
    const buffer = await readFile(outputPath);
    return {
      buffer,
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw new DocumentIngestionError(
      `DOC 转换失败，请安装 LibreOffice/soffice：${error instanceof Error ? error.message : String(error)}`,
      "MANUAL_REVIEW",
      error,
    );
  }
}

export async function parseDocumentFile(
  filePath: string,
  config: IngestionConfig,
  metadata: NormalizedDocument["metadata"] = {},
): Promise<ParserOutput> {
  const sourceType = sourceTypeFromPath(filePath);
  const buffer = await readFile(filePath);

  switch (sourceType) {
    case "txt":
      return { normalized: parseTextDocument(buffer.toString("utf8"), metadata) };
    case "html":
      return { normalized: parseHtmlDocument(buffer.toString("utf8"), "html", metadata) };
    case "docx":
      return { normalized: await parseDocxDocument(buffer, metadata) };
    case "pdf":
      return parsePdfDocument(buffer, metadata, config.pdfTextCoverageThreshold);
    case "doc": {
      const converted = await convertDocToDocx(filePath, config);
      try {
        return { normalized: await parseDocxDocument(converted.buffer, metadata) };
      } finally {
        await converted.cleanup();
      }
    }
  }
}

export { sourceTypeFromPath };
