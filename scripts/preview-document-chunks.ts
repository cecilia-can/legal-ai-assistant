import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/db";
import { DocumentChunkingError, previewDocumentChunks } from "../lib/documents/chunking";

function option(args: string[], name: string) { const index = args.indexOf(name); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`${name} 需要一个值。`); return value; }

function printHelp() { console.log("用法：npm run preview:chunks -- --document <id> --user-id <id> [--chunk-set <id>] [--output <path>] [--json]"); }

function markdown(preview: Awaited<ReturnType<typeof previewDocumentChunks>>) {
  const lines = [
    "# 文档切片预览",
    "",
    `- 文档：${preview.document.title ?? preview.document.originalFilename}`,
    `- 文档 ID：\`${preview.document.id}\``,
    `- 切片集：\`${preview.chunkSet.id}\``,
    `- 策略版本：\`${preview.chunkSet.strategyVersion}\``,
    `- 状态：\`${preview.chunkSet.status}\``,
    `- 切片数量：${preview.chunkSet.chunks.length}`,
  ];
  if (preview.chunkSet.qualityIssues) lines.push("", "## 质量提示", "", "```json", JSON.stringify(preview.chunkSet.qualityIssues, null, 2), "```");
  for (const chunk of preview.chunkSet.chunks) {
    lines.push("", `## 切片 ${chunk.ordinal + 1}`, "", `- 页码：${chunk.pageFrom ?? "未知"}–${chunk.pageTo ?? "未知"}`, `- 章节 / 条款：${chunk.sectionPath || "未识别"}`, `- 内容哈希：\`${chunk.contentHash}\``, "", chunk.text);
  }
  return `${lines.join("\n")}\n`;
}

function resolveOutputPath(requested: string | undefined, documentId: string, chunkSetId: string) {
  const workspace = process.cwd();
  const fallback = path.join("data", "chunk-previews", `${documentId}-${chunkSetId}.md`);
  const output = path.resolve(workspace, requested ?? fallback);
  const relative = path.relative(workspace, output);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("预览文件必须写入当前项目目录。" );
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) return printHelp();
  const documentId = option(args, "--document"); const userId = option(args, "--user-id");
  if (!documentId || !userId) { printHelp(); throw new Error("必须提供 --document 和 --user-id。"); }
  const preview = await previewDocumentChunks({ documentId, userId, chunkSetId: option(args, "--chunk-set") });
  if (args.includes("--json")) { console.log(JSON.stringify(preview, null, 2)); return; }
  const output = resolveOutputPath(option(args, "--output"), documentId, preview.chunkSet.id);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, markdown(preview), "utf8");
  console.log(`切片预览已写入：${output}`);
}

main().catch((error) => { console.error(error instanceof DocumentChunkingError ? `[${error.code}] ${error.message}` : error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
