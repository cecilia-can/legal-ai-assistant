/**
 * Change 1.9 租户隔离冒烟测试（service 层 + 可选 HTTP）。
 *
 * 用法：
 *   npx tsx scripts/verify-tenant-isolation.ts
 *   VERIFY_BASE_URL=http://localhost:3000 npx tsx scripts/verify-tenant-isolation.ts
 */

import "dotenv/config";

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/auth/password";
import {
  MessageServiceError,
  createMessage,
  deleteMessage,
  listMessages,
} from "../lib/services/messageService";

function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 未设置。");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runServiceTests() {
  const prisma = createPrisma();
  const suffix = Date.now().toString(36);

  const userA = await prisma.user.create({
    data: {
      email: `tenant-a-${suffix}@example.com`,
      name: "Tenant A",
      password: await hashPassword("Password1"),
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `tenant-b-${suffix}@example.com`,
      name: "Tenant B",
      password: await hashPassword("Password1"),
    },
  });

  const conversationA = await prisma.conversation.create({
    data: {
      userId: userA.id,
      title: "A 的会话",
    },
  });

  await createMessage(conversationA.id, userA.id, {
    role: "user",
    content: "hello from A",
  });

  let crossListFailed = false;
  try {
    await listMessages(conversationA.id, userB.id, { limit: 10 });
  } catch (error) {
    crossListFailed =
      error instanceof MessageServiceError && error.code === "NOT_FOUND";
  }
  assert(crossListFailed, "用户 B 读取 A 的会话应抛出 NOT_FOUND");

  let crossCreateFailed = false;
  try {
    await createMessage(conversationA.id, userB.id, {
      role: "user",
      content: "intruder",
    });
  } catch (error) {
    crossCreateFailed =
      error instanceof MessageServiceError && error.code === "NOT_FOUND";
  }
  assert(crossCreateFailed, "用户 B 向 A 的会话写入应抛出 NOT_FOUND");

  const ownMessages = await listMessages(conversationA.id, userA.id, {
    limit: 10,
  });
  assert(ownMessages.items.length === 1, "用户 A 应能读取自己的消息");

  const messageId = ownMessages.items[0]!.id;
  let crossDeleteFailed = false;
  try {
    await deleteMessage(conversationA.id, userB.id, messageId);
  } catch (error) {
    crossDeleteFailed =
      error instanceof MessageServiceError && error.code === "NOT_FOUND";
  }
  assert(crossDeleteFailed, "用户 B 删除 A 的消息应抛出 NOT_FOUND");

  await prisma.user.deleteMany({
    where: { id: { in: [userA.id, userB.id] } },
  });

  await prisma.$disconnect();
  console.log("✓ service 层租户隔离测试通过");
}

async function main() {
  await runServiceTests();

  const baseUrl = process.env.VERIFY_BASE_URL;
  if (baseUrl) {
    console.log(
      `\nHTTP 层测试需携带登录 Cookie，请在 ${baseUrl} 手工验证 docs/user-auth-testing.md 清单。`,
    );
  } else {
    console.log(
      "\n提示：设置 VERIFY_BASE_URL 可配合 dev server 做 HTTP 手工验收。",
    );
  }
}

main().catch((error) => {
  console.error("✗ 租户隔离测试失败:", error);
  process.exit(1);
});
