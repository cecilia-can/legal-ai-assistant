import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocxDocument } from "../lib/documents/ingestion/parsers";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || path.extname(filePath).toLowerCase() !== ".docx") {
    throw new Error("用法：npx tsx scripts/verify-document-structure.ts <file.docx>");
  }

  const document = await parseDocxDocument(await readFile(filePath));
  const blocks = document.pages.flatMap((page) => page.blocks);
  const locators = blocks.map((block) => block.locator).filter(Boolean);

  assert(document.pages[0]?.pageNumber === null, "DOCX 不应伪造物理页码");
  assert(locators.length === new Set(locators).size, "每个 block 必须有唯一 locator");

  console.log(JSON.stringify({
    sourceType: document.sourceType,
    pageNumber: document.pages[0]?.pageNumber,
    blockCount: blocks.length,
    headings: blocks.filter((block) => block.kind === "heading").slice(0, 10),
    articles: blocks.filter((block) => block.articleNumber).slice(0, 10),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
