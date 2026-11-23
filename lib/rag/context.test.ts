import { describe, expect, it } from "vitest";
import { buildRagContext } from "./context";
import type { RetrievalResult } from "./retrieval";

const result: RetrievalResult = {
  chunkId: "chunk-1", knowledgeBaseId: "kb-1", documentId: "doc-1",
  documentTitle: "劳动合同法", category: "法规", text: "第九条 不得扣押证件。",
  sectionPath: "第九条", locator: {}, pageFrom: 1, pageTo: 1, similarity: 0.8,
};

describe("RAG 来源快照", () => {
  it("编号与实际送入上下文的文本一一对应，跳过空切片", () => {
    const context = buildRagContext([{ ...result, text: " " }, result, { ...result, chunkId: "chunk-2", text: "第八十四条 责令退还。" }]);
    expect(context?.sources.map((source) => source.number)).toEqual([1, 2]);
    expect(context?.sources.map((source) => source.text)).toEqual([result.text, "第八十四条 责令退还。"]);
    expect(context?.content).toContain("[来源1] 劳动合同法");
    expect(context?.content).toContain("[来源2] 劳动合同法");
    expect(context?.sourceCount).toBe(2);
  });
});
