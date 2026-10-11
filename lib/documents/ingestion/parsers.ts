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

interface WordStyle {
  name: string;
  headingLevel?: number;
}

interface WordNumberingLevel {
  format: string;
  template: string;
  start: number;
}

interface WordNumberingDefinition {
  levels: Map<number, WordNumberingLevel>;
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

function xmlElements(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "g")) ?? [];
}

function numberToChinese(value: number) {
  if (value === 0) return "零";
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  let remaining = value;
  let result = "";
  let unit = 0;
  let pendingZero = false;
  while (remaining > 0 && unit < units.length) {
    const digit = remaining % 10;
    if (digit) {
      result = `${digits[digit]}${units[unit]}${result}`;
      pendingZero = false;
    } else if (result && !pendingZero) {
      result = `零${result}`;
      pendingZero = true;
    }
    remaining = Math.floor(remaining / 10);
    unit += 1;
  }
  return result.replace(/^一十/, "十").replace(/零+$/g, "");
}

function formatWordNumber(value: number, format: string) {
  if (/chinese|ideograph|taiwanese/i.test(format)) return numberToChinese(value);
  if (/upperLetter/i.test(format)) return String.fromCharCode(64 + ((value - 1) % 26) + 1);
  if (/lowerLetter/i.test(format)) return String.fromCharCode(96 + ((value - 1) % 26) + 1);
  return String(value);
}

function readWordNumbering(numberingXml: string | undefined) {
  const definitions = new Map<string, WordNumberingDefinition>();
  const numToAbstract = new Map<string, string>();
  for (const abstract of xmlElements(numberingXml ?? "", "w:abstractNum")) {
    const abstractId = xmlAttribute(abstract, "w:abstractNumId");
    if (!abstractId) continue;
    const levels = new Map<number, WordNumberingLevel>();
    for (const level of xmlElements(abstract, "w:lvl")) {
      const index = Number(xmlAttribute(level, "w:ilvl") ?? "0");
      const format = xmlAttribute(level.match(/<w:numFmt\b[^>]*>/)?.[0] ?? "", "w:val") ?? "decimal";
      const template = xmlAttribute(level.match(/<w:lvlText\b[^>]*>/)?.[0] ?? "", "w:val") ?? "%1";
      const start = Number(xmlAttribute(level.match(/<w:start\b[^>]*>/)?.[0] ?? "", "w:val") ?? "1");
      levels.set(index, { format, template, start: Number.isFinite(start) ? start : 1 });
    }
    definitions.set(abstractId, { levels });
  }
  for (const num of xmlElements(numberingXml ?? "", "w:num")) {
    const numId = xmlAttribute(num, "w:numId");
    const abstractId = xmlAttribute(num.match(/<w:abstractNumId\b[^>]*>/)?.[0] ?? "", "w:val");
    if (numId && abstractId) numToAbstract.set(numId, abstractId);
  }
  return { definitions, numToAbstract };
}

function numberParagraph(
  paragraphXml: string,
  numbering: ReturnType<typeof readWordNumbering>,
  counters: Map<string, number[]>,
) {
  const numPr = paragraphXml.match(/<w:numPr\b[\s\S]*?<\/w:numPr>/)?.[0];
  if (!numPr) return undefined;
  const numId = xmlAttribute(numPr.match(/<w:numId\b[^>]*>/)?.[0] ?? "", "w:val");
  if (!numId) return undefined;
  const level = Number(xmlAttribute(numPr.match(/<w:ilvl\b[^>]*>/)?.[0] ?? "", "w:val") ?? "0");
  const definition = numbering.definitions.get(numbering.numToAbstract.get(numId) ?? "");
  const levelDefinition = definition?.levels.get(level);
  if (!levelDefinition) {
    return { numId, level, text: "" };
  }
  if (levelDefinition.format === "bullet") return { numId, level, text: levelDefinition.template };
  const values = counters.get(numId) ?? [];
  values[level] = (values[level] ?? levelDefinition.start - 1) + 1;
  values.length = level + 1;
  counters.set(numId, values);
  const text = levelDefinition.template.replace(/%(\d+)/g, (_, token: string) => {
    const targetLevel = Number(token) - 1;
    const target = definition?.levels.get(targetLevel);
    return formatWordNumber(values[targetLevel] ?? target?.start ?? 1, target?.format ?? "decimal");
  });
  return { numId, level, text };
}

function mergeNumberingText(numberingText: string, body: string) {
  if (!numberingText) return body;
  // Clause headings are conventionally separated by a space; list punctuation is not.
  return /[条章节编部分]$/.test(numberingText) ? `${numberingText} ${body}` : `${numberingText}${body}`;
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
    const level = block.headingLevel ?? headingLevel(block.text);
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
    const numberingXml = await zip.file("word/numbering.xml")?.async("string");
    if (!documentXml) throw new Error("缺少 word/document.xml");

    const styles = new Map<string, WordStyle>();
    for (const style of stylesXml?.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? []) {
      const styleId = xmlAttribute(style, "w:styleId");
      const name = xmlAttribute(style.match(/<w:name\b[^>]*>/)?.[0] ?? "", "w:val");
      const outlineLevel = Number(xmlAttribute(style.match(/<w:outlineLvl\b[^>]*>/)?.[0] ?? "", "w:val"));
      if (styleId) styles.set(styleId, {
        name: name ?? styleId,
        headingLevel: Number.isFinite(outlineLevel) ? outlineLevel + 1 : undefined,
      });
    }
    const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(documentXml)?.[1] ?? "";
    const nodes = body.match(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
    const blocks: NormalizedBlock[] = [];
    const state: StructureState = { sections: [] };
    const numbering = readWordNumbering(numberingXml);
    const numberingCounters = new Map<string, number[]>();
    let paragraphNumber = 0;
    let tableNumber = 0;
    for (const node of nodes) {
      if (node.startsWith("<w:tbl")) {
        const rows = (node.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []).map((row) =>
          (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map(extractXmlText).filter(Boolean).join(" | "),
        ).filter(Boolean);
        if (rows.length) {
          tableNumber += 1;
          blocks.push(enrichBlock({ kind: "table", text: rows.join("\n"), locator: `table:${tableNumber}`, paragraphType: "table" }, state));
        }
        continue;
      }
      const bodyText = extractXmlText(node);
      if (!bodyText) continue;
      paragraphNumber += 1;
      const styleId = xmlAttribute(node.match(/<w:pStyle\b[^>]*>/)?.[0] ?? "", "w:val");
      const style = styleId ? styles.get(styleId) : undefined;
      const numberingInfo = numberParagraph(node, numbering, numberingCounters);
      const text = mergeNumberingText(numberingInfo?.text ?? "", bodyText);
      const isHeading = Boolean(style?.headingLevel) || /(^|\s)heading\s*[1-9]?|标题|title/i.test(style?.name ?? "");
      const kind = blockKindForText(text, "paragraph", {
        isHeading,
        isListItem: /<w:numPr\b/.test(node),
      });
      const inferredHeadingLevel = isHeading
        ? style?.headingLevel ?? Number(/heading\s*([1-9])?/i.exec(style?.name ?? "")?.[1] ?? "1")
        : undefined;
      blocks.push(enrichBlock({
        kind,
        text,
        locator: `paragraph:${paragraphNumber}`,
        paragraphType: kind === "heading" ? "heading" : kind === "list-item" ? "list-item" : "body",
        ...(inferredHeadingLevel ? { headingLevel: inferredHeadingLevel } : {}),
        ...(numberingInfo ? {
          listId: numberingInfo.numId,
          listLevel: numberingInfo.level,
          listNumber: numberingInfo.text || undefined,
          numberingText: numberingInfo.text || undefined,
        } : {}),
      }, state));
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

interface PdfTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
}

interface PdfTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

const CASE_SECTION_HEADINGS: Record<string, NonNullable<NormalizedBlock["semanticRole"]>> = {
  "关键词": "case_keywords",
  "裁判要旨": "case_holding",
  "裁判要点": "case_holding",
  "基本案情": "case_facts",
  "争议焦点": "case_issues",
  "裁判结果": "case_judgment",
  "裁判理由": "case_reasoning",
  "法院认为": "case_reasoning",
  "本院认为": "case_reasoning",
  "关联索引": "case_index",
  "相关法条": "case_index",
};

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return Boolean(value && typeof value === "object" && "str" in value && typeof value.str === "string");
}

function needsInlineSpace(previous: string, next: string) {
  return /[A-Za-z0-9)]$/.test(previous) && /^[A-Za-z0-9(]/.test(next);
}

/** Restores visual PDF text items into reading-order lines. */
export function pdfTextItemsToLines(items: unknown[]): PdfTextLine[] {
  const fragments = items
    .filter(isPdfTextItem)
    .map((item) => {
      const [,, , transformHeight = item.height ?? 10, x = 0, y = 0] = item.transform ?? [];
      return { text: item.str.trim(), x, y, width: item.width ?? 0, height: Math.abs(item.height ?? transformHeight) || 10, fontName: item.fontName };
    })
    .filter((item) => item.text);
  const rows: Array<{ y: number; height: number; fragments: typeof fragments }> = [];
  for (const fragment of fragments.sort((left, right) => right.y - left.y || left.x - right.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - fragment.y) <= Math.max(2, Math.max(candidate.height, fragment.height) * 0.45));
    if (row) {
      row.fragments.push(fragment);
      row.height = Math.max(row.height, fragment.height);
    } else {
      rows.push({ y: fragment.y, height: fragment.height, fragments: [fragment] });
    }
  }
  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const ordered = row.fragments.sort((left, right) => left.x - right.x);
      let text = "";
      for (const fragment of ordered) {
        text += text && needsInlineSpace(text, fragment.text) ? ` ${fragment.text}` : fragment.text;
      }
      const x = Math.min(...ordered.map((fragment) => fragment.x));
      const right = Math.max(...ordered.map((fragment) => fragment.x + fragment.width));
      return { text: cleanInlineText(text), x, y: row.y, width: Math.max(0, right - x), height: row.height, fontName: ordered[0]?.fontName };
    })
    .filter((line) => line.text);
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
}

function knownCaseSection(text: string) {
  const compact = text.replace(/\s+/g, "").replace(/[：:]$/, "");
  for (const [label, semanticRole] of Object.entries(CASE_SECTION_HEADINGS)) {
    if (compact === label) return { label, remainder: "", semanticRole };
    if (compact.startsWith(label) && compact.length > label.length) {
      return { label, remainder: compact.slice(label.length).replace(/^[：:]/, ""), semanticRole };
    }
  }
  return undefined;
}

function isNumberedHeading(text: string) {
  return /^(第[一二三四五六七八九十百千万零〇\d]+[编章节部分]|\d+(?:\.\d+)*[、.])\S{0,80}$/.test(text);
}

function headingScore(
  line: PdfTextLine,
  index: number,
  lines: PdfTextLine[],
  pageWidth: number,
  bodyHeight: number,
  typicalGap: number,
) {
  const compact = line.text.replace(/\s+/g, "").replace(/[：:]$/, "");
  if (knownCaseSection(line.text)) return 10;
  let score = 0;
  const previous = lines[index - 1];
  const next = lines[index + 1];
  const gapBefore = previous ? previous.y - line.y : typicalGap;
  const gapAfter = next ? line.y - next.y : typicalGap;
  if (compact.length <= 28) score += 1;
  if (!/[。；！？!?]$/.test(compact)) score += 1;
  if (line.width <= pageWidth * 0.58) score += 1;
  if (gapBefore >= typicalGap * 1.35) score += 1;
  if (gapAfter >= typicalGap * 1.35) score += 1;
  if (line.height >= bodyHeight * 1.12) score += 1;
  if (Math.abs(line.x + line.width / 2 - pageWidth / 2) <= pageWidth * 0.12) score += 1;
  if (looksLikeHeading(compact) || isNumberedHeading(compact)) score += 2;
  // Dates and line-wrapped paragraph tails are short, but are not sections.
  if (/^\d+[年月日]/.test(compact) || /^[（(]?\d{4}[）)]?$/.test(compact)) score -= 2;
  return score;
}

function isPdfListItem(text: string) {
  return /^(?:[（(][一二三四五六七八九十百千万零〇\d]+[）)]|\d+(?:\.\d+)*[、.])/.test(text.replace(/\s+/g, ""));
}

function pageLineKey(text: string) {
  return text.replace(/第\s*\d+\s*页/g, "").replace(/\s+/g, "").trim();
}

function isPageNumberLine(text: string) {
  return /^第\s*\d+\s*页$/.test(text.trim());
}

export function pdfBlocksFromLines(
  pageNumber: number,
  lines: PdfTextLine[],
  repeatedHeaders: Set<string>,
  state: StructureState,
) {
  const blocks: NormalizedBlock[] = [];
  let blockNumber = 0;
  let current: PdfTextLine[] = [];
  const visibleLines = lines.filter((line) => {
    const key = pageLineKey(line.text);
    return !isPageNumberLine(line.text) && !(key.length >= 3 && repeatedHeaders.has(key));
  });
  const pageWidth = Math.max(...visibleLines.map((line) => line.x + line.width), 1);
  const bodyHeight = median(visibleLines.map((line) => line.height)) || 10;
  const typicalGap = median(visibleLines.slice(1).map((line, index) => visibleLines[index]!.y - line.y).filter((gap) => gap > 0)) || bodyHeight * 1.2;
  const flush = () => {
    if (!current.length) return;
    blockNumber += 1;
    const text = cleanText(current.map((line) => line.text).join(""));
    const x = Math.min(...current.map((line) => line.x));
    const y = Math.min(...current.map((line) => line.y));
    const right = Math.max(...current.map((line) => line.x + line.width));
    const top = Math.max(...current.map((line) => line.y + line.height));
    if (text) blocks.push(enrichBlock({
      kind: blockKindForText(text, "paragraph", { isListItem: isPdfListItem(text) }),
      text,
      locator: `page:${pageNumber}:block:${blockNumber}`,
      sourcePage: pageNumber,
      paragraphType: isPdfListItem(text) ? "list-item" : "body",
      bbox: [x, y, right, top],
    }, state));
    current = [];
  };

  let previousBodyLine: PdfTextLine | undefined;
  for (let index = 0; index < visibleLines.length; index += 1) {
    const line = visibleLines[index]!;
    const knownSection = knownCaseSection(line.text);
    const confidence = headingScore(line, index, visibleLines, pageWidth, bodyHeight, typicalGap);
    if (knownSection || confidence >= 3) {
      flush();
      blockNumber += 1;
      const headingText = knownSection?.label ?? line.text;
      blocks.push(enrichBlock({
        kind: "heading",
        text: headingText,
        locator: `page:${pageNumber}:block:${blockNumber}`,
        sourcePage: pageNumber,
        paragraphType: "heading",
        headingConfidence: confidence,
        ...(knownSection ? { semanticRole: knownSection.semanticRole } : {}),
        bbox: [line.x, line.y, line.x + line.width, line.y + line.height],
      }, state));
      if (knownSection?.remainder) {
        current.push({ ...line, text: knownSection.remainder });
      }
      previousBodyLine = line;
      continue;
    }
    const verticalGap = previousBodyLine ? previousBodyLine.y - line.y : 0;
    // Use the page's measured leading rather than a fixed threshold. This
    // keeps wrapped lines together while separating visually distinct paragraphs.
    if (current.length && verticalGap > Math.max(typicalGap * 1.55, Math.max(previousBodyLine?.height ?? 0, line.height) * 2.2)) flush();
    current.push(line);
    previousBodyLine = line;
  }
  flush();
  return blocks;
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

function markPdfParagraphContinuations(pages: PdfTextPage[]) {
  for (let index = 1; index < pages.length; index += 1) {
    const previous = pages[index - 1]?.blocks.at(-1);
    const first = pages[index]?.blocks[0];
    if (
      previous && first &&
      previous.kind !== "heading" && first.kind !== "heading" &&
      !isPdfListItem(first.text)
    ) {
      first.continuesPreviousParagraph = true;
    }
  }
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
    const extractedPages: Array<{ pageNumber: number; lines: PdfTextLine[] }> = [];
    const state: StructureState = { sections: [] };

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      extractedPages.push({ pageNumber, lines: pdfTextItemsToLines(content.items) });
      page.cleanup();
    }

    const repeatedHeaderCounts = new Map<string, number>();
    for (const page of extractedPages) {
      const candidates = [...page.lines.slice(0, 3), ...page.lines.slice(-3)];
      for (const line of candidates) {
        const key = pageLineKey(line.text);
        if (key.length >= 3) repeatedHeaderCounts.set(key, (repeatedHeaderCounts.get(key) ?? 0) + 1);
      }
    }
    const repeatedHeaders = new Set(
      [...repeatedHeaderCounts].filter(([, count]) => count >= 2).map(([key]) => key),
    );
    const pages: PdfTextPage[] = extractedPages.map((page) => {
      const blocks = pdfBlocksFromLines(page.pageNumber, page.lines, repeatedHeaders, state);
      return { pageNumber: page.pageNumber, text: blocks.map((block) => block.text).join("\n"), blocks };
    });
    markPdfParagraphContinuations(pages);

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
