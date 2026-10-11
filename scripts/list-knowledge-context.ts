import "dotenv/config";

import { prisma } from "../lib/db";

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 需要一个值。`);
  return value;
}

function help() {
  console.log(`用法：
  npm run list:knowledge-context
  npm run list:knowledge-context -- --user-id <userId> [--json]

不传 --user-id 时列出可选用户；传入后列出该用户可访问的私有与系统知识库。`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) return help();
  const userId = option(args, "--user-id");
  const json = args.includes("--json");

  if (!userId) {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
    if (json) return console.log(JSON.stringify({ users }, null, 2));
    if (!users.length) return console.log("尚无用户。请先注册一个账号。");
    console.log("可选用户：");
    for (const user of users) console.log(`- ${user.email}${user.name ? `（${user.name}）` : ""}\n  userId: ${user.id}`);
    console.log("\n复制一个 userId 后运行：npm run list:knowledge-context -- --user-id <userId>");
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) throw new Error("未找到该 userId 对应的用户。");
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { OR: [{ scope: "system" }, { ownerId: userId }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, scope: true, ownerId: true, _count: { select: { documents: true } } },
  });
  if (json) return console.log(JSON.stringify({ user, knowledgeBases }, null, 2));
  console.log(`用户：${user.email}${user.name ? `（${user.name}）` : ""}\nuserId: ${user.id}\n`);
  if (!knowledgeBases.length) return console.log("该用户暂无可访问的知识库。");
  console.log("可访问知识库：");
  for (const knowledgeBase of knowledgeBases) console.log(`- ${knowledgeBase.name}｜${knowledgeBase.scope === "system" ? "系统" : "私有"}｜文档 ${knowledgeBase._count.documents} 份\n  knowledgeBaseId: ${knowledgeBase.id}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
