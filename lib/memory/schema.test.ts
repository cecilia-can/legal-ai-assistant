import { describe, expect, it } from "vitest";
import { conversationMemoryContentSchema, getMemorySourceMessageIds } from "@/lib/memory/schema";

describe("conversationMemoryContentSchema", () => {
  it("接受包含可选案件事实块的记忆，并保留来源消息", () => {
    const memory = conversationMemoryContentSchema.parse({
      summary: "用户咨询协商解除劳动合同。",
      topics: ["协商解除"],
      conclusions: [],
      openQuestions: ["尚未提供协议内容。"],
      case: {
        parties: [{ role: "劳动者" }],
        timeline: [],
        facts: [{ statement: "用户称公司要求签协议。", status: "user_stated", sourceMessageIds: ["m1"] }],
        evidence: [],
        issues: ["补偿计算"],
      },
    });

    expect(getMemorySourceMessageIds(memory)).toEqual(["m1"]);
  });

  it("拒绝没有来源或使用非法状态的案件事实", () => {
    const result = conversationMemoryContentSchema.safeParse({
      summary: "摘要",
      topics: [],
      conclusions: [],
      openQuestions: [],
      case: {
        parties: [],
        timeline: [],
        facts: [{ statement: "事实", status: "confirmed", sourceMessageIds: [] }],
        evidence: [],
        issues: [],
      },
    });

    expect(result.success).toBe(false);
  });

  it.each(["user_stated", "document_supported", "uncertain"] as const)("接受有来源的 %s 事实状态", (status) => {
    const result = conversationMemoryContentSchema.safeParse({
      summary: "用户讨论工资争议",
      topics: [], conclusions: [], openQuestions: [],
      case: { parties: [], timeline: [], facts: [{ statement: "工资争议", status, sourceMessageIds: ["m1"] }], evidence: [], issues: [] },
    });
    expect(result.success).toBe(true);
  });

  it("分别拒绝无来源事实与未知事实状态", () => {
    const base = { summary: "工资争议", topics: [], conclusions: [], openQuestions: [] };
    const caseBlock = { parties: [], timeline: [], evidence: [], issues: [] };
    expect(conversationMemoryContentSchema.safeParse({ ...base, case: { ...caseBlock, facts: [{ statement: "月薪 9600 元", status: "user_stated", sourceMessageIds: [] }] } }).success).toBe(false);
    expect(conversationMemoryContentSchema.safeParse({ ...base, case: { ...caseBlock, facts: [{ statement: "月薪 9600 元", status: "confirmed", sourceMessageIds: ["m1"] }] } }).success).toBe(false);
  });
});
