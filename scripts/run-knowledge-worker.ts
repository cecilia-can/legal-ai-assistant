import "dotenv/config";
import { prisma } from "../lib/db";
import { claimTask, processTask } from "../lib/knowledge/worker";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
async function main() {
  const once = process.argv.includes("--once");
  console.log("知识库 worker 已启动；Ctrl+C 将在当前任务结束后退出。");
  do {
    try {
      const task = await claimTask();
      if (task) await processTask(task);
    } catch (error) {
      if (once) throw error;
      console.error("知识库 worker 本轮连接或领取失败，将稍后重试；请检查数据库连接与迁移。");
    }
    if (!once && !stopping) await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (!once && !stopping);
}
main().catch(() => { console.error("知识库 worker 无法运行，请检查数据库连接与迁移。"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
