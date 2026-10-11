import "dotenv/config";

import { prisma } from "../lib/db";
import { chunkDocument, DocumentChunkingError } from "../lib/documents/chunking";

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
    console.log("用法：npx tsx scripts/chunk-document.ts --document <id> --user-id <id> [--max-chars <n>] [--strategy <version>]");
    return;
  }
  const documentId = option(args, "--document");
  const userId = option(args, "--user-id");
  if (!documentId || !userId) throw new Error("必须提供 --document 和 --user-id。");
  const maxChunkCharacters = option(args, "--max-chars");
  const result = await chunkDocument({ documentId, userId, config: { maxChunkCharacters: maxChunkCharacters ? Number(maxChunkCharacters) : undefined, strategyVersion: option(args, "--strategy") } });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error instanceof DocumentChunkingError ? `[${error.code}] ${error.message}` : error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
