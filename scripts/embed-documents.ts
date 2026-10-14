import "dotenv/config";

import { prisma } from "../lib/db";
import { embedAvailableChunks } from "../lib/rag/service";

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 需要一个值。`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("用法：npm run embed:documents -- --user-id <id> [--knowledge-base <id>] [--document <id>]");
    return;
  }
  const userId = option(args, "--user-id");
  if (!userId) throw new Error("必须提供 --user-id。向量化任务需要已验证的用户身份。");
  const result = await embedAvailableChunks({ userId, knowledgeBaseId: option(args, "--knowledge-base"), documentId: option(args, "--document") });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
