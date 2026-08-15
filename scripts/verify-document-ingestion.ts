import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  extractPdfPages,
  parseHtmlDocument,
  parsePdfDocument,
  parseTextDocument,
} from "../lib/documents/ingestion/parsers";
import { getIngestionConfig } from "../lib/documents/ingestion/config";
import { DocumentIngestionError } from "../lib/documents/ingestion/errors";
import { runOcr } from "../lib/documents/ingestion/ocr";
import {
  readNormalizedArtifact,
  writeNormalizedArtifact,
} from "../lib/documents/ingestion/storage";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildPdf(text?: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    text
      ? `<< /Length ${Buffer.byteLength(`BT /F1 12 Tf 72 72 Td (${text}) Tj ET`, "ascii")} >>\nstream\nBT /F1 12 Tf 72 72 Td (${text}) Tj ET\nendstream`
      : "<< /Length 0 >>\nstream\n\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(chunks.join(""), "ascii"));
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "ascii");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    chunks.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.from(chunks.join(""), "ascii");
}

async function run() {
  const text = parseTextDocument("第一段\n\n第二段");
  assert(text.pages[0]?.blocks.length === 2, "TXT 应按空行拆分段落");

  const html = parseHtmlDocument(
    "<nav>导航</nav><h1>标题</h1><p>正文</p><table><tr><td>A</td><td>B</td></tr></table><script>bad()</script>",
  );
  assert(html.pages[0]?.text.includes("正文"), "HTML 应保留正文");
  assert(!html.pages[0]?.text.includes("导航"), "HTML 应移除导航噪声");
  assert(html.pages[0]?.blocks.some((block) => block.kind === "table"), "HTML 应保留表格");

  const textPdf = await parsePdfDocument(buildPdf("Hello PDF"));
  assert(textPdf.pdfPageClassification === "text", "文字型 PDF 应被识别为 text");
  assert(textPdf.normalized.pages[0]?.text.includes("Hello PDF"), "PDF 文本应被提取");

  const imagePdf = await extractPdfPages(buildPdf());
  assert(imagePdf.classification === "image_only", "无文字层 PDF 应被识别为 image_only");
  assert(imagePdf.imageOnlyPageNumbers[0] === 1, "应记录图片页码");

  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "legal-ingestion-test-"));
  try {
    const config = getIngestionConfig({ artifactRoot });
    const sourcePath = path.join(artifactRoot, "source.txt");
    await writeFile(sourcePath, "原始文件内容", "utf8");
    const sourceBefore = await readFile(sourcePath);
    await parseTextDocument(sourceBefore.toString("utf8"));
    const sourceAfter = await readFile(sourcePath);
    assert(sourceBefore.equals(sourceAfter), "解析过程不得修改原始文件");

    const artifact = await writeNormalizedArtifact("test-document", text, config);
    const roundTrip = await readNormalizedArtifact(artifact.absolutePath);
    assert(roundTrip.schemaVersion === text.schemaVersion, "规范化产物应可读回");
    assert(Boolean(artifact.contentHash), "规范化产物应生成哈希");

    let ocrFailed = false;
    try {
      await runOcr(
        "missing-input.pdf",
        "test-document",
        getIngestionConfig({
          artifactRoot,
          ocrCommand: "definitely-missing-ocrmypdf",
          tesseractCommand: "definitely-missing-tesseract",
        }),
      );
    } catch (error) {
      ocrFailed = error instanceof DocumentIngestionError && error.code === "OCR_FAILED";
    }
    assert(ocrFailed, "OCR 依赖缺失时应返回 OCR_FAILED");
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }

  console.log("✓ 文档导入基础验证通过");
}

run().catch((error) => {
  console.error("✗ 文档导入验证失败：", error);
  process.exit(1);
});
