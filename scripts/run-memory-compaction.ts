import "dotenv/config";

import { prisma } from "../lib/db";
import { processPendingMemoryCompactionTasks } from "../lib/memory/service";

function parseLimit(args: string[]): number {
  const index = args.indexOf("--limit");
  if (index < 0) return 10;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("--limit 必须是 1-100 的整数。");
  }
  return value;
}

function parseInterval(args: string[]): number {
  const index = args.indexOf("--interval-ms");
  if (index < 0) return 10_000;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000) {
    throw new Error("--interval-ms 必须是 1000-300000 的整数。");
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseLimit(args);
  const watch = args.includes("--watch");
  const interval = watch ? parseInterval(args) : 0;
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });
  do {
    try {
      const result = await processPendingMemoryCompactionTasks(limit);
      if (!watch || result.claimed || result.failed) console.log(JSON.stringify(result));
    } catch (error) {
      if (!watch) throw error;
      console.error("压缩 worker 本轮执行失败：", error);
    }
    if (watch && !stopping) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } while (watch && !stopping);
}

main()
  .catch((error) => {
    // Preserve Prisma error codes and metadata so a scheduled worker can be
    // diagnosed without reproducing it under the Next.js dev server.
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
