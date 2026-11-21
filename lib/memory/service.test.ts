import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    conversation: { findFirst: vi.fn() },
    conversationMemory: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    memoryCompactionTask: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    message: { findMany: vi.fn() },
    conversationRecallChunk: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma, completion: vi.fn(), indexRecall: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/ai/client", () => ({ createStructuredMemoryCompletion: mocks.completion }));
vi.mock("@/lib/memory/recall", () => ({ indexConversationRecallMessages: mocks.indexRecall }));

import {
  enqueueMemoryCompaction,
  getConversationMemory,
  invalidateMemoryForDeletedMessage,
  processMemoryCompactionTask,
  processPendingMemoryCompactionTasks,
  selectCompactionMessages,
} from "@/lib/memory/service";

const date = new Date("2026-01-01T00:00:00.000Z");
const messages = [
  { id: "m1", conversationId: "c1", role: "user", content: "我的月薪是 8600 元", createdAt: date },
  { id: "m2", conversationId: "c1", role: "assistant", content: "请提供工资流水", createdAt: date },
  { id: "m3", conversationId: "c1", role: "user", content: "更正：月薪是 9600 元", createdAt: date },
  { id: "m4", conversationId: "c1", role: "assistant", content: "已记录更正", createdAt: date },
  { id: "m5", conversationId: "c1", role: "user", content: "还有考勤记录", createdAt: date },
];
const oldContent = { summary: "用户称月薪 8600 元", topics: ["劳动合同"], conclusions: [], openQuestions: [] };
const correctedContent = {
  summary: "用户更正月薪为 9600 元，原 8600 元有误",
  topics: ["劳动合同"],
  conclusions: [],
  openQuestions: [],
  case: { parties: [], timeline: [], facts: [{ statement: "用户称月薪 9600 元", status: "user_stated", sourceMessageIds: ["m3"] }], evidence: [], issues: [] },
};

function task(overrides: Record<string, unknown> = {}) {
  return { id: "t1", conversationId: "c1", sourceStartMessageId: "m3", sourceEndMessageId: "m3", expectedRevision: 1, attempts: 1, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_MEMORY_RECENT_MESSAGES", "2");
  mocks.prisma.conversation.findFirst.mockResolvedValue({ id: "c1" });
  mocks.prisma.message.findMany.mockResolvedValue(messages);
  mocks.prisma.conversationMemory.findUnique.mockResolvedValue({ content: oldContent, sourceMessageIds: ["m1", "m2"], coveredUntilMessageId: "m2", revision: 1, status: "valid" });
  mocks.prisma.conversationMemory.findFirst.mockResolvedValue({ content: oldContent, sourceMessageIds: ["m1", "m2"], coveredUntilMessageId: "m2", revision: 1 });
  mocks.prisma.conversationMemory.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.memoryCompactionTask.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.memoryCompactionTask.findUnique.mockResolvedValue(task());
  mocks.prisma.memoryCompactionTask.findFirst.mockResolvedValue(null);
  mocks.prisma.memoryCompactionTask.create.mockResolvedValue(task());
  mocks.prisma.memoryCompactionTask.update.mockResolvedValue(task());
  mocks.prisma.$transaction.mockImplementation(async (input: unknown) =>
    typeof input === "function" ? input(mocks.prisma) : Promise.all(input as Promise<unknown>[]));
  mocks.indexRecall.mockResolvedValue(undefined);
  mocks.completion.mockResolvedValue(JSON.stringify(correctedContent));
});
afterEach(() => vi.unstubAllEnvs());

describe("conversation memory compaction", () => {
  it("only selects a continuous uncovered prefix and keeps the recent tail", () => {
    expect(selectCompactionMessages({ messages, coveredUntilMessageId: "m2", recentMessages: 2 }).map((m) => m.id)).toEqual(["m3"]);
    expect(selectCompactionMessages({ messages, coveredUntilMessageId: null, recentMessages: 2 }).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("passes the previous memory and correction to the model, then advances revision", async () => {
    expect(await processMemoryCompactionTask("t1")).toBe("completed");
    const prompt = mocks.completion.mock.calls[0][0][1].content as string;
    expect(prompt).toContain("8600 元");
    expect(prompt).toContain("更正：月薪是 9600 元");
    expect(prompt).not.toContain("还有考勤记录");
    expect(mocks.prisma.conversationMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: "c1", revision: 1 },
      data: expect.objectContaining({ revision: 2, coveredUntilMessageId: "m3", sourceMessageIds: ["m1", "m2", "m3"], content: correctedContent }),
    }));
  });

  it.each([
    ["non-JSON", "not-json"],
    ["invalid fact status", JSON.stringify({ ...correctedContent, case: { ...correctedContent.case, facts: [{ statement: "薪资", status: "confirmed", sourceMessageIds: ["m3"] }] } })],
    ["unprovided source", JSON.stringify({ ...correctedContent, case: { ...correctedContent.case, facts: [{ statement: "薪资", status: "user_stated", sourceMessageIds: ["other-conversation"] }] } })],
  ])("keeps the old memory when the model returns %s", async (_label, response) => {
    mocks.completion.mockResolvedValue(response);
    expect(await processMemoryCompactionTask("t1")).toBe("failed");
    expect(mocks.prisma.conversationMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastError: expect.any(String) }) }));
    expect(mocks.prisma.conversationMemory.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 2 }) }));
    expect(mocks.prisma.memoryCompactionTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: expect.stringMatching(/^(failed|pending)$/), errorMessage: expect.any(String) }) }));
  });

  it("keeps the last valid revision when the model call fails and records a retryable task", async () => {
    mocks.completion.mockRejectedValue(new Error("upstream unavailable"));
    expect(await processMemoryCompactionTask("t1")).toBe("failed");
    expect(mocks.prisma.conversationMemory.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 2 }) }));
    expect(mocks.prisma.memoryCompactionTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "pending", errorMessage: "upstream unavailable" }) }));
  });

  it("skips a stale revision before calling the model", async () => {
    mocks.prisma.memoryCompactionTask.findUnique.mockResolvedValue(task({ expectedRevision: 0 }));
    expect(await processMemoryCompactionTask("t1")).toBe("skipped");
    expect(mocks.completion).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationMemory.updateMany).not.toHaveBeenCalled();
  });

  it("completes a task when the compare-and-swap loses a concurrent update", async () => {
    mocks.prisma.conversationMemory.updateMany.mockResolvedValue({ count: 0 });
    expect(await processMemoryCompactionTask("t1")).toBe("skipped");
    expect(mocks.prisma.memoryCompactionTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "completed", errorMessage: expect.stringContaining("跳过") }) }));
  });

  it("marks referenced memory invalid and rebuilds it from remaining messages", async () => {
    await invalidateMemoryForDeletedMessage("c1", "m1");
    expect(mocks.prisma.conversationMemory.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "invalid" }) }));
    expect(mocks.prisma.conversationRecallChunk.deleteMany).toHaveBeenCalledWith({ where: { conversationId: "c1" } });

    mocks.prisma.conversationMemory.findFirst.mockResolvedValue(null);
    mocks.prisma.conversationMemory.findUnique.mockResolvedValue({ content: oldContent, sourceMessageIds: ["m1", "m2"], coveredUntilMessageId: "m2", revision: 1, status: "invalid" });
    mocks.prisma.message.findMany.mockResolvedValue(messages.slice(1));
    expect(await getConversationMemory("c1", "u1")).toBeNull();
    const queued = await enqueueMemoryCompaction({ conversationId: "c1", userId: "u1" });
    expect(queued).toEqual({ queued: true, taskId: "t1" });
    expect(mocks.prisma.memoryCompactionTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expectedRevision: 1, sourceStartMessageId: "m2" }) }));

    mocks.prisma.memoryCompactionTask.findUnique.mockResolvedValue(task({ sourceStartMessageId: "m2", sourceEndMessageId: "m3" }));
    expect(await processMemoryCompactionTask("t1")).toBe("completed");
    expect(mocks.prisma.conversationMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 2, status: "valid", sourceMessageIds: ["m2", "m3"] }) }));
  });

  it("leaves pending tasks and stored memory unchanged when the feature is off", async () => {
    vi.stubEnv("CONVERSATION_MEMORY_ENABLED", "false");
    expect(await processPendingMemoryCompactionTasks()).toEqual({ claimed: 0, completed: 0, failed: 0 });
    expect(mocks.prisma.memoryCompactionTask.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationMemory.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationMemory.update).not.toHaveBeenCalled();
  });
});
