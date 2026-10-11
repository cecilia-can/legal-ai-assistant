import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

import { parseDocxDocument } from "../lib/documents/ingestion/parsers";
import { attachRenderedPdfPageLocations } from "../lib/documents/ingestion/render";
import { NORMALIZED_DOCUMENT_SCHEMA_VERSION, type NormalizedDocument } from "../lib/documents/ingestion/types";
import { createChunkCandidates, identifyStructure } from "../lib/documents/chunking/structure";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function numberedDocxFixture() {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>委托代理事项</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>甲方应提供材料。</w:t></w:r></w:p>
  </w:body></w:document>`);
  zip.file("word/styles.xml", `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>`);
  zip.file("word/numbering.xml", `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="chineseCounting"/><w:lvlText w:val="第%1条"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="chineseCounting"/><w:lvlText w:val="（%2）"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function main() {
  const filePath = process.argv[2];
  if (filePath && path.extname(filePath).toLowerCase() !== ".docx") {
    throw new Error("用法：npx tsx scripts/verify-document-structure.ts <file.docx>");
  }
  if (filePath) {
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

  const numbered = await parseDocxDocument(await numberedDocxFixture());
  const [heading, item] = numbered.pages[0]!.blocks;
  assert(heading?.text === "第一条 委托代理事项", "应恢复 Word 自动编号并与标题正文合并");
  assert(heading.headingLevel === 1 && heading.paragraphType === "heading", "应保留标题层级和段落类型");
  assert(item?.text === "（一）甲方应提供材料。" && item.listLevel === 1, "应保留列表编号和层级");
  const structure = identifyStructure(numbered, "合同");
  const chunks = createChunkCandidates(structure.nodes, { artifactRoot: ".", strategyVersion: "verify", maxChunkCharacters: 500 }, structure.strategy);
  assert(chunks[0]?.text.includes("第一条 委托代理事项"), "切片器应以规范化后的 Word 条款编号作为结构边界");
  const rendered: NormalizedDocument = {
    schemaVersion: NORMALIZED_DOCUMENT_SCHEMA_VERSION,
    sourceType: "pdf",
    extractionMethod: "native",
    pages: [
      { pageNumber: 7, text: "第一条 委托", blocks: [] },
      { pageNumber: 8, text: "代理事项", blocks: [] },
    ],
    metadata: {},
  };
  const located = attachRenderedPdfPageLocations(numbered, rendered);
  assert(located.pages[0]!.blocks[0]?.sourcePage === 7, "应以渲染 PDF 为 Word 段落补充页码");
  assert(located.pages[0]!.blocks[0]?.sourcePageEnd === 8, "跨页段落应保留 PDF 页码范围");
  assert(located.pages[0]?.pageNumber === 7, "规范化页面应使用渲染 PDF 的物理页码");

  console.log("✓ Word 编号、结构元数据和渲染 PDF 页码定位验证通过");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
