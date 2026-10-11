import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { DocumentIngestionError } from "./errors";
import type { IngestionConfig, NormalizedDocument } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Render Word with LibreOffice before locating paragraphs. Word pagination is
 * layout-dependent, so XML paragraphs must never be assigned invented pages.
 */
export async function renderWordToPdf(
  inputPath: string,
  documentId: string,
  config: IngestionConfig,
) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "legal-word-render-"));
  const outputName = `${path.basename(inputPath, path.extname(inputPath))}.pdf`;
  const outputPath = path.join(tempDir, outputName);
  const artifactPath = path.join(config.artifactRoot, "documents", documentId, "rendered.pdf");
  try {
    await execFileAsync(
      config.officeCommand,
      ["--headless", "--convert-to", "pdf", "--outdir", tempDir, inputPath],
      { timeout: config.documentRenderTimeoutMs, windowsHide: true },
    );
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await copyFile(outputPath, artifactPath);
    return {
      artifactPath,
      relativeUri: path.relative(config.artifactRoot, artifactPath).replaceAll(path.sep, "/"),
    };
  } catch (error) {
    throw new DocumentIngestionError(
      `Word PDF 渲染失败，无法补充页码定位：${error instanceof Error ? error.message : String(error)}`,
      "PARSER_FAILED",
      error,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

/** Assign PDF pages to DOCX blocks in document order without changing text. */
export function attachRenderedPdfPageLocations(
  document: NormalizedDocument,
  renderedPdf: NormalizedDocument,
): NormalizedDocument {
  const pages = renderedPdf.pages.map((page) => ({ pageNumber: page.pageNumber, text: compact(page.text) }));
  const pageStarts: number[] = [];
  let totalLength = 0;
  for (const page of pages) {
    pageStarts.push(totalLength);
    totalLength += page.text.length;
  }
  const renderedText = pages.map((page) => page.text).join("");
  let searchCursor = 0;
  const pageIndexAt = (offset: number) => {
    for (let index = pageStarts.length - 1; index >= 0; index -= 1) {
      if (offset >= pageStarts[index]!) return index;
    }
    return 0;
  };
  const locatedBlocks = document.pages.flatMap((page) =>
    page.blocks.map((block) => {
      const needle = compact(block.text);
      if (!needle) return block;
      let matchedText = needle;
      let matchOffset = renderedText.indexOf(matchedText, searchCursor);
      // Text extraction can change a few symbols. A stable prefix still gives
      // us a real PDF start page without ever dropping the original paragraph.
      if (matchOffset < 0) {
        matchedText = needle.slice(0, Math.min(40, needle.length));
        matchOffset = matchedText.length >= 8
          ? renderedText.indexOf(matchedText, searchCursor)
          : -1;
      }
      if (matchOffset < 0) return block;
      const startIndex = pageIndexAt(matchOffset);
      const endIndex = pageIndexAt(matchOffset + matchedText.length - 1);
      const start = pages[startIndex]!.pageNumber;
      searchCursor = matchOffset + matchedText.length;
      return {
        ...block,
        sourcePage: start,
        sourcePageEnd: pages[endIndex]!.pageNumber,
      };
    }),
  );
  // A DOCX is a logical stream, but the rendered PDF has physical pages.
  // Re-bucket canonical Word blocks by their rendered page so both the page
  // object and each block expose the same citation location to the chunker.
  const blocksByPage = new Map<number | null, typeof locatedBlocks>();
  for (const block of locatedBlocks) {
    const pageNumber = block.sourcePage ?? null;
    const current = blocksByPage.get(pageNumber) ?? [];
    current.push(block);
    blocksByPage.set(pageNumber, current);
  }
  const locatedPages = pages
    .map(({ pageNumber }) => {
      const blocks = blocksByPage.get(pageNumber) ?? [];
      return blocks.length
        ? { pageNumber, text: blocks.map((block) => block.text).join("\n"), blocks }
        : null;
    })
    .filter((page): page is NonNullable<typeof page> => page !== null);
  const unlocatedBlocks = blocksByPage.get(null) ?? [];
  if (unlocatedBlocks.length) {
    locatedPages.push({
      pageNumber: null,
      text: unlocatedBlocks.map((block) => block.text).join("\n"),
      blocks: unlocatedBlocks,
    });
  }
  return {
    ...document,
    pages: locatedPages,
    metadata: { ...document.metadata, pageLocationSource: "pdf-render" },
  };
}
