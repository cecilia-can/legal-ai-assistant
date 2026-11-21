import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  history: vi.fn(), memory: vi.fn(), recall: vi.fn(), enqueue: vi.fn(), process: vi.fn(),
  stream: vi.fn(), finish: vi.fn(), complete: vi.fn(), createRun: vi.fn(),
  memoryEnabled: vi.fn(), recallEnabled: vi.fn(),
}));

vi.mock("@/lib/api/api-response", () => ({ jsonError: (message: string, status: number) => Response.json({ message }, { status }) }));
vi.mock("@/lib/auth/require-api-session", () => ({ requireApiSession: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/ai/rateLimit", () => ({ checkChatRateLimit: () => ({ allowed: true }), recordChatTokenUsage: () => ({ allowed: true }) }));
vi.mock("@/lib/ai/jailbreak", () => ({ isLatestUserJailbreak: () => false, getJailbreakRejectionMessage: () => "" }));
vi.mock("@/lib/rag/config", () => ({ isRagEnabled: () => false }));
vi.mock("@/lib/rag/context", () => ({ buildRagContext: vi.fn() }));
vi.mock("@/lib/rag/retrieval", () => ({ retrieveRelevantChunks: vi.fn() }));
vi.mock("@/lib/ai/chatUsageLog", () => ({ logChatCompletion: vi.fn(), logJailbreakBlocked: vi.fn() }));
vi.mock("@/lib/memory/config", () => ({
  isConversationMemoryEnabled: mocks.memoryEnabled,
  isConversationMemoryRecallEnabled: mocks.recallEnabled,
  getConversationMemoryConfig: () => ({ compactionThreshold: 0.65, recentMessages: 2 }),
}));
vi.mock("@/lib/memory/recall", () => ({ retrieveConversationRecall: mocks.recall, buildConversationRecallContext: () => null }));
vi.mock("@/lib/memory/service", () => ({
  getConversationMemory: mocks.memory,
  enqueueMemoryCompaction: mocks.enqueue,
  processMemoryCompactionTask: mocks.process,
}));
vi.mock("@/lib/services/chatRunService", () => ({
  ChatRunServiceError: class extends Error {},
  createOrGetChatRun: mocks.createRun,
  finishChatRun: mocks.finish,
  completeChatRun: mocks.complete,
}));
vi.mock("@/lib/services/messageService", () => ({ MessageServiceError: class extends Error {}, listConversationMessagesForChat: mocks.history }));
vi.mock("@/lib/ai/client", () => ({
  AiConfigError: class extends Error {}, AiServiceError: class extends Error {},
  createChatCompletionStream: mocks.stream,
  extractDeltaText: (chunk: { choices: { delta: { content: string } }[] }) => chunk.choices[0]?.delta.content ?? "",
  extractUsageFromChunk: () => ({ prompt_tokens: 100, completion_tokens: 4 }),
}));
vi.mock("@/lib/ai/tokenizer", () => ({
  countMessagesTokens: (messages: { content: string }[]) => messages.reduce((total, message) => total + message.content.length, 0),
  getMaxInputTokens: () => 1_200,
}));

import { POST } from "@/app/api/chat/route";

const date = new Date("2026-01-01T00:00:00.000Z");
const oldMemory = {
  content: { summary: "用户更正月薪为 9600 元，原 8600 元有误", topics: ["劳动合同"], conclusions: [], openQuestions: [] },
  sourceMessageIds: ["m1"], coveredUntilMessageId: "m1", revision: 2,
};

function records(contents: string[]) {
  return contents.map((content, index) => ({ id: `m${index + 1}`, conversationId: "c1", role: index % 2 ? "assistant" : "user", content, createdAt: date }));
}

async function chat() {
  const response = await POST(new Request("http://localhost/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: "c1", content: "请继续", clientRequestId: crypto.randomUUID() }),
  }));
  return { response, body: await response.text() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.memoryEnabled.mockReturnValue(true);
  mocks.recallEnabled.mockReturnValue(false);
  mocks.memory.mockResolvedValue(null);
  mocks.enqueue.mockResolvedValue({ queued: false });
  mocks.process.mockResolvedValue("completed");
  mocks.createRun.mockResolvedValue({ kind: "created", run: { id: "run1" } });
  mocks.history.mockResolvedValue(records(["劳动合同法适用吗？"]));
  mocks.stream.mockImplementation(async () => ({
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: "收到" }, finish_reason: "stop" }] };
    },
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/chat memory integration", () => {
  it("answers a short conversation before any memory exists", async () => {
    const { response, body } = await chat();
    expect(response.status).toBe(200);
    expect(body).toContain("收到");
    expect(body).toContain('"type":"done"');
    expect(mocks.stream.mock.calls[0][0].at(-1)).toMatchObject({ content: "劳动合同法适用吗？" });
  });

  it("uses corrected memory and recent messages for a long conversation", async () => {
    mocks.memory.mockResolvedValue(oldMemory);
    mocks.history.mockResolvedValue(records(["旧事实：月薪 8600 元", "早期回复", "更正：月薪 9600 元", "已记录", "请按更正后的金额分析"]));
    const { body } = await chat();
    expect(body).toContain("收到");
    const input = mocks.stream.mock.calls[0][0] as { content: string }[];
    expect(input[0]?.content).toContain("月薪为 9600 元");
    expect(input.some((item) => item.content.includes("旧事实：月薪 8600 元"))).toBe(false);
    expect(input.at(-1)?.content).toBe("请按更正后的金额分析");
  });

  it("continues streaming if scheduling compaction fails", async () => {
    vi.stubEnv("CONVERSATION_MEMORY_COMPACTION_THRESHOLD", "0.02");
    mocks.history.mockResolvedValue(records(["劳动合同问题".repeat(80)]));
    mocks.enqueue.mockRejectedValue(new Error("worker unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { response, body } = await chat();
      expect(response.status).toBe(200);
      expect(body).toContain("收到");
      expect(mocks.enqueue).toHaveBeenCalled();
      expect(mocks.stream).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("continues streaming with original history when synchronous compaction fails", async () => {
    mocks.history.mockResolvedValue(records(["劳动合同纠纷".repeat(200)]));
    mocks.enqueue.mockResolvedValue({ queued: true, taskId: "t1" });
    mocks.process.mockResolvedValue("failed");
    const { response, body } = await chat();
    expect(response.status).toBe(200);
    expect(body).toContain("收到");
    expect(mocks.process).toHaveBeenCalledWith("t1");
    expect(mocks.stream.mock.calls[0][0].at(-1)?.content).toContain("劳动合同纠纷");
  });

  it("uses raw history and leaves stored memory untouched when the feature is off", async () => {
    mocks.memoryEnabled.mockReturnValue(false);
    mocks.history.mockResolvedValue(records(["早期事实：杭州", "已记录", "现在继续咨询"]));
    const { body } = await chat();
    expect(body).toContain("收到");
    expect(mocks.memory).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
    const input = mocks.stream.mock.calls[0][0] as { content: string }[];
    expect(input.some((item) => item.content === "早期事实：杭州")).toBe(true);
  });

  it("falls back to bounded raw history when the feature is off and the conversation is long", async () => {
    mocks.memoryEnabled.mockReturnValue(false);
    mocks.history.mockResolvedValue(records(["最早的事实", "旧回复".repeat(300), "最后的问题"]));
    const { body } = await chat();
    expect(body).toContain("收到");
    const input = mocks.stream.mock.calls[0][0] as { content: string }[];
    expect(input[0]?.content).not.toContain("会话记忆");
    expect(input.some((item) => item.content === "最早的事实")).toBe(false);
    expect(input.at(-1)?.content).toBe("最后的问题");
    expect(mocks.memory).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
