import "dotenv/config";

import { prisma } from "../lib/db";
import {
  DocumentIngestionError,
  ingestDocument,
} from "../lib/documents/ingestion";

function readOption(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} 需要一个值。`);
  }
  return value;
}

function printHelp() {
  console.log(`用法：
  npx tsx scripts/ingest-document.ts --knowledge-base <id> --file <path> [选项]

选项：
  --user-id <id>          用户 ID；所有导入任务必填
  --source-id <value>     稳定来源标识，默认使用相对文件路径或文件名
  --source-uri <value>    原始来源 URI
  --title <value>         文档标题
  --category <value>      文档分类
  --reprocess             使用当前解析器重新处理已成功导入的同一文件
  --help                  显示帮助
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const knowledgeBaseId = readOption(args, "--knowledge-base");
  const filePath = readOption(args, "--file");
  if (!knowledgeBaseId || !filePath) {
    printHelp();
    throw new Error("必须提供 --knowledge-base 和 --file。");
  }

  const result = await ingestDocument({
    knowledgeBaseId,
    filePath,
    userId: readOption(args, "--user-id"),
    sourceIdentifier: readOption(args, "--source-id"),
    sourceUri: readOption(args, "--source-uri"),
    title: readOption(args, "--title"),
    category: readOption(args, "--category"),
    forceReprocess: args.includes("--reprocess"),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    if (error instanceof DocumentIngestionError) {
      console.error(`[${error.code}] ${error.message}`);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
