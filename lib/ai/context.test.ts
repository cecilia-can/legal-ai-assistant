import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/tokenizer", () => ({
  countMessagesTokens: (
    messages: Array<{ role: string; content: string }>,
  ) =>
    messages.reduce(
      (total, message) => total + message.role.length + message.content.length + 1,
      0,
    ),
  getMaxInputTokens: () => 4_096,
}));

import { buildConversationContext } from "@/lib/ai/context";

describe("buildConversationContext", () => {
  it("keeps older dialogue before the first summary is available", () => {
    const result = buildConversationContext({
      history: [
        { role: "user", content: "早期关键事实" },
        { role: "assistant", content: "早期回答" },
        { role: "user", content: "后续问题" },
      ],
      recentMessages: 1,
    });

    expect(result.messages.some((message) => message.content === "早期关键事实")).toBe(true);
  });

  it("keeps the newest messages while including structured memory", () => {
    const result = buildConversationContext({
      history: [
        { role: "user", content: "最早的问题" },
        { role: "assistant", content: "最早的回答" },
        { role: "user", content: "中间问题" },
        { role: "assistant", content: "中间回答" },
        { role: "user", content: "最新问题" },
        { role: "assistant", content: "最新回答" },
      ],
      recentMessages: 2,
      memory: {
        content: {
          summary: "用户正在咨询劳动合同争议。",
          topics: ["劳动合同"],
          conclusions: [],
          openQuestions: ["是否存在书面合同"],
        },
        sourceMessageIds: ["m1", "m2"],
        coveredUntilMessageId: "m2",
        revision: 1,
      },
    });

    expect(result.messages.at(-2)).toMatchObject({ content: "最新问题" });
    expect(result.messages.at(-1)).toMatchObject({ content: "最新回答" });
    expect(result.messages[0]?.content).toContain("会话记忆");
    expect(result.messages[0]?.content).toContain("劳动合同争议");
  });

  it("drops recall before removing the newest dialogue when the budget is exceeded", () => {
    const result = buildConversationContext({
      history: [{ role: "user", content: "请解释举证责任" }],
      recentMessages: 1,
      recall: { content: "R".repeat(10_000), sourceCount: 1 },
    });

    expect(result.messages.at(-1)).toMatchObject({ content: "请解释举证责任" });
    expect(result.tokenStats.recall_tokens).toBe(0);
    expect(result.tokenStats.omitted_recall).toBe(true);
  });
});
