import { Prisma } from "@/app/generated/prisma/client";
import { createStructuredMemoryCompletion } from "@/lib/ai/client";
import type { MessageRecord } from "@/lib/services/messageService";
import { prisma } from "@/lib/db";
import { getConversationMemoryConfig, isConversationMemoryEnabled } from "./config";
import { indexConversationRecallMessages } from "./recall";
import { buildConversationMemoryPrompt, getConversationMemorySystemPrompt } from "./prompts";
import {
  conversationMemoryContentSchema,
  getMemorySourceMessageIds,
  type ConversationMemoryContent,
} from "./schema";

// This module is used by both Next.js route handlers and the standalone
// `memory:compact` worker. `server-only` is a Next.js compiler marker and
// cannot be resolved by the worker's plain Node.js runtime.

const MEMORY_SCHEMA_VERSION = 1;

export type ConversationMemoryRecord = {
  content: ConversationMemoryContent;
  coveredUntilMessageId: string | null;
  revision: number;
  sourceMessageIds: string[];
};

export class ConversationMemoryError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID") {
    super(message);
    this.name = "ConversationMemoryError";
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : [];
}

function toMessageRecord(record: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}): MessageRecord {
  return record;
}

async function assertConversationOwnership(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!conversation) throw new ConversationMemoryError("会话不存在。", "NOT_FOUND");
}

function parseMemory(record: {
  content: Prisma.JsonValue;
  sourceMessageIds: Prisma.JsonValue;
  coveredUntilMessageId: string | null;
  revision: number;
}): ConversationMemoryRecord | null {
  const parsed = conversationMemoryContentSchema.safeParse(record.content);
  if (!parsed.success) return null;
  return {
    content: parsed.data,
    coveredUntilMessageId: record.coveredUntilMessageId,
    revision: record.revision,
    sourceMessageIds: parseStringArray(record.sourceMessageIds),
  };
}

export async function getConversationMemory(
  conversationId: string,
  userId: string,
): Promise<ConversationMemoryRecord | null> {
  await assertConversationOwnership(conversationId, userId);
  const record = await prisma.conversationMemory.findFirst({
    where: { conversationId, conversation: { userId }, status: "valid" },
    select: {
      content: true,
      sourceMessageIds: true,
      coveredUntilMessageId: true,
      revision: true,
    },
  });
  return record ? parseMemory(record) : null;
}

export async function listConversationMessagesForMemory(conversationId: string): Promise<MessageRecord[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId, content: { not: "" }, role: { in: ["user", "assistant"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return messages.map(toMessageRecord);
}

export function selectCompactionMessages(input: {
  messages: MessageRecord[];
  coveredUntilMessageId: string | null;
  recentMessages: number;
}): MessageRecord[] {
  const coveredIndex = input.coveredUntilMessageId
    ? input.messages.findIndex((message) => message.id === input.coveredUntilMessageId)
    : -1;
  const uncompressed = input.messages.slice(coveredIndex + 1);
  const eligibleCount = Math.max(0, uncompressed.length - input.recentMessages);
  return uncompressed.slice(0, eligibleCount);
}

export async function enqueueMemoryCompaction(input: {
  conversationId: string;
  userId: string;
  messages?: MessageRecord[];
}): Promise<{ queued: boolean; taskId?: string }> {
  await assertConversationOwnership(input.conversationId, input.userId);
  const [memory, persisted, messages] = await Promise.all([
    getConversationMemory(input.conversationId, input.userId),
    prisma.conversationMemory.findUnique({
      where: { conversationId: input.conversationId },
      select: { revision: true },
    }),
    input.messages ?? listConversationMessagesForMemory(input.conversationId),
  ]);
  const candidates = selectCompactionMessages({
    messages,
    coveredUntilMessageId: memory?.coveredUntilMessageId ?? null,
    recentMessages: getConversationMemoryConfig().recentMessages,
  });
  if (!candidates.length) return { queued: false };

  const active = await prisma.memoryCompactionTask.findFirst({
    where: { conversationId: input.conversationId, status: { in: ["pending", "running"] } },
    select: { id: true },
  });
  if (active) return { queued: false, taskId: active.id };

  const task = await prisma.memoryCompactionTask.create({
    data: {
      conversationId: input.conversationId,
      sourceStartMessageId: candidates[0]!.id,
      sourceEndMessageId: candidates.at(-1)!.id,
      expectedRevision: persisted?.revision ?? 0,
    },
  });
  return { queued: true, taskId: task.id };
}

function messageRange(messages: MessageRecord[], startId: string, endId: string): MessageRecord[] {
  const start = messages.findIndex((message) => message.id === startId);
  const end = messages.findIndex((message) => message.id === endId);
  return start < 0 || end < start ? [] : messages.slice(start, end + 1);
}

async function failTask(taskId: string, message: string, retryable: boolean) {
  const maxAttempts = getConversationMemoryConfig().maxTaskAttempts;
  const task = await prisma.memoryCompactionTask.findUnique({ where: { id: taskId }, select: { attempts: true, conversationId: true } });
  if (!task) return;
  const status = retryable && task.attempts < maxAttempts ? "pending" : "failed";
  await prisma.$transaction([
    prisma.memoryCompactionTask.update({
      where: { id: taskId },
      data: { status, errorMessage: message, completedAt: status === "failed" ? new Date() : null },
    }),
    prisma.conversationMemory.updateMany({
      where: { conversationId: task.conversationId, status: "valid" },
      data: { lastError: message },
    }),
  ]);
}

export async function processMemoryCompactionTask(taskId: string): Promise<"completed" | "skipped" | "failed"> {
  const claimed = await prisma.memoryCompactionTask.updateMany({
    where: { id: taskId, status: "pending" },
    data: { status: "running", attempts: { increment: 1 }, startedAt: new Date(), errorMessage: null },
  });
  if (!claimed.count) return "skipped";

  const task = await prisma.memoryCompactionTask.findUnique({ where: { id: taskId } });
  if (!task) return "skipped";

  try {
    const [existing, messages] = await Promise.all([
      prisma.conversationMemory.findUnique({ where: { conversationId: task.conversationId } }),
      listConversationMessagesForMemory(task.conversationId),
    ]);
    const previous = existing && existing.status === "valid" ? parseMemory(existing) : null;
    if ((existing?.revision ?? 0) !== task.expectedRevision) {
      await prisma.memoryCompactionTask.update({ where: { id: task.id }, data: { status: "completed", completedAt: new Date(), errorMessage: "记忆已被更新，任务跳过。" } });
      return "skipped";
    }
    const candidates = messageRange(messages, task.sourceStartMessageId, task.sourceEndMessageId);
    if (!candidates.length) {
      await prisma.memoryCompactionTask.update({ where: { id: task.id }, data: { status: "completed", completedAt: new Date(), errorMessage: "候选消息已不存在，任务跳过。" } });
      return "skipped";
    }

    const raw = await createStructuredMemoryCompletion([
      { role: "system", content: getConversationMemorySystemPrompt() },
      { role: "user", content: buildConversationMemoryPrompt({ previous: previous?.content ?? null, messages: candidates }) },
    ]);
    const content = conversationMemoryContentSchema.parse(JSON.parse(raw));
    const candidateIds = new Set(candidates.map((message) => message.id));
    if (getMemorySourceMessageIds(content).some((id) => !candidateIds.has(id) && !previous?.sourceMessageIds.includes(id))) {
      throw new ConversationMemoryError("摘要引用了未提供的来源消息。", "INVALID");
    }
    const sourceMessageIds = [...new Set([...(previous?.sourceMessageIds ?? []), ...candidates.map((message) => message.id)])];
    const revision = (existing?.revision ?? 0) + 1;
    const result = await prisma.$transaction(async (tx) => {
      if (existing) {
        const updated = await tx.conversationMemory.updateMany({
          where: { conversationId: task.conversationId, revision: task.expectedRevision },
          data: {
            schemaVersion: MEMORY_SCHEMA_VERSION,
            content,
            sourceMessageIds,
            coveredUntilMessageId: candidates.at(-1)!.id,
            revision,
            status: "valid",
            invalidatedAt: null,
            lastError: null,
          },
        });
        if (!updated.count) {
          await tx.memoryCompactionTask.update({ where: { id: task.id }, data: { status: "completed", completedAt: new Date(), errorMessage: "记忆已被更新，任务跳过。" } });
          return false;
        }
      } else {
        await tx.conversationMemory.create({
          data: {
            conversationId: task.conversationId,
            schemaVersion: MEMORY_SCHEMA_VERSION,
            content,
            sourceMessageIds,
            coveredUntilMessageId: candidates.at(-1)!.id,
            revision,
            status: "valid",
          },
        });
      }
      await tx.memoryCompactionTask.update({ where: { id: task.id }, data: { status: "completed", completedAt: new Date(), errorMessage: null } });
      return true;
    });
    if (!result) return "skipped";
    try {
      await indexConversationRecallMessages({ conversationId: task.conversationId, messages: candidates });
    } catch (error) {
      console.error("Failed to index conversation recall chunks:", error);
    }
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "会话记忆压缩失败。";
    const retryable = !(error instanceof ConversationMemoryError) && !(error instanceof SyntaxError);
    await failTask(task.id, message, retryable);
    return "failed";
  }
}

export async function processPendingMemoryCompactionTasks(limit = 10) {
  if (!isConversationMemoryEnabled()) return { claimed: 0, completed: 0, failed: 0 };
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const maxAttempts = getConversationMemoryConfig().maxTaskAttempts;
  await prisma.memoryCompactionTask.updateMany({
    where: { status: "running", startedAt: { lt: staleBefore }, attempts: { lt: maxAttempts } },
    data: { status: "pending", errorMessage: "压缩进程中断，任务等待重试。", startedAt: null },
  });
  await prisma.memoryCompactionTask.updateMany({
    where: { status: "running", startedAt: { lt: staleBefore }, attempts: { gte: maxAttempts } },
    data: { status: "failed", errorMessage: "压缩进程中断，已达到最大重试次数。", completedAt: new Date() },
  });
  const tasks = await prisma.memoryCompactionTask.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true },
  });
  // Avoid launching a burst of model calls from one polling cycle.
  const results: Awaited<ReturnType<typeof processMemoryCompactionTask>>[] = [];
  for (const task of tasks) {
    results.push(await processMemoryCompactionTask(task.id));
  }
  return {
    claimed: tasks.length,
    completed: results.filter((result) => result === "completed").length,
    failed: results.filter((result) => result === "failed").length,
  };
}

export async function invalidateMemoryForDeletedMessage(conversationId: string, messageId: string): Promise<void> {
  const memory = await prisma.conversationMemory.findUnique({ where: { conversationId }, select: { sourceMessageIds: true, coveredUntilMessageId: true } });
  if (!memory) return;
  const sourceIds = parseStringArray(memory.sourceMessageIds);
  if (memory.coveredUntilMessageId === messageId || sourceIds.includes(messageId)) {
    await prisma.conversationMemory.update({
      where: { conversationId },
      data: { status: "invalid", invalidatedAt: new Date(), lastError: "引用的原始消息已删除。" },
    });
  }
  await prisma.conversationRecallChunk.deleteMany({ where: { conversationId } });
}
