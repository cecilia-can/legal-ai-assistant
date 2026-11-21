/** Verify conversation-memory tenant boundaries using temporary database rows. */
import "dotenv/config";

import { prisma } from "../lib/db";
import {
  ConversationMemoryError,
  enqueueMemoryCompaction,
  getConversationMemory,
} from "../lib/memory/service";
import { retrieveConversationRecall } from "../lib/memory/recall";

function assert(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(description);
}

async function expectNotFound(action: () => Promise<unknown>, description: string) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof ConversationMemoryError && error.code === "NOT_FOUND", description);
    return;
  }
  throw new Error(description);
}

async function main() {
  const createdUserIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const previousRecallFlag = process.env.CONVERSATION_MEMORY_RECALL_ENABLED;
  try {
    const userA = await prisma.user.create({ data: { email: `memory-a-${suffix}@example.com`, name: "Memory tenant A" } });
    createdUserIds.push(userA.id);
    const userB = await prisma.user.create({ data: { email: `memory-b-${suffix}@example.com`, name: "Memory tenant B" } });
    createdUserIds.push(userB.id);
    const conversationB = await prisma.conversation.create({ data: { userId: userB.id, title: "B only" } });
    const messageB = await prisma.message.create({ data: { conversationId: conversationB.id, role: "user", content: "仅属于 B 的事实" } });
    await prisma.conversationMemory.create({
      data: {
        conversationId: conversationB.id,
        content: { summary: "B 的内部摘要", topics: [], conclusions: [], openQuestions: [] },
        sourceMessageIds: [messageB.id],
        coveredUntilMessageId: messageB.id,
      },
    });

    const ownMemory = await getConversationMemory(conversationB.id, userB.id);
    assert(ownMemory?.content.summary === "B 的内部摘要", "所有者应能读取自己的记忆");
    await expectNotFound(
      () => getConversationMemory(conversationB.id, userA.id),
      "A 不得读取 B 的会话记忆",
    );
    const beforeTasks = await prisma.memoryCompactionTask.count({ where: { conversationId: conversationB.id } });
    await expectNotFound(
      () => enqueueMemoryCompaction({ conversationId: conversationB.id, userId: userA.id }),
      "A 不得为 B 的会话创建或触发压缩任务",
    );
    const afterTasks = await prisma.memoryCompactionTask.count({ where: { conversationId: conversationB.id } });
    assert(afterTasks === beforeTasks, "越权请求不得更改 B 的任务记录");
    const unchanged = await getConversationMemory(conversationB.id, userB.id);
    assert(unchanged?.revision === ownMemory.revision, "越权请求不得重建 B 的摘要");

    // This must return before requesting an embedding, even without embedding credentials.
    process.env.CONVERSATION_MEMORY_RECALL_ENABLED = "true";
    const crossRecall = await retrieveConversationRecall({
      conversationId: conversationB.id,
      userId: userA.id,
      query: "B 的事实是什么",
    });
    assert(crossRecall.length === 0, "A 不得召回 B 的会话历史");
    console.log("✓ 会话记忆读取、任务入队和历史回溯的跨用户隔离验证通过");
  } finally {
    if (previousRecallFlag === undefined) delete process.env.CONVERSATION_MEMORY_RECALL_ENABLED;
    else process.env.CONVERSATION_MEMORY_RECALL_ENABLED = previousRecallFlag;
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("✗ 会话记忆租户隔离验证失败：", error);
  process.exitCode = 1;
});
