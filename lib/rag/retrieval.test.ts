import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  assertAccess: vi.fn(),
  createEmbedding: vi.fn(),
  dimensions: 1_536,
  model: "text-embedding-v4",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("./access", () => ({ assertKnowledgeBaseAccess: mocks.assertAccess }));
vi.mock("./embeddings", () => ({ createEmbedding: mocks.createEmbedding, toVectorLiteral: (vector: number[]) => `[${vector.join(",")}]` }));
vi.mock("./config", () => ({
  getEmbeddingConfig: () => ({ model: mocks.model, dimensions: mocks.dimensions }),
  getRetrievalConfig: () => ({ topK: 5, minSimilarity: 0.35 }),
}));

import { retrieveRelevantChunks } from "./retrieval";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dimensions = 1_536;
  mocks.model = "text-embedding-v4";
  mocks.createEmbedding.mockResolvedValue([1, 0]);
  mocks.queryRaw.mockResolvedValue([]);
});

describe("知识库向量检索 SQL", () => {
  it("使用实际表别名、当前内容哈希和 1536 维索引表达式", async () => {
    await retrieveRelevantChunks({ userId: "owner", query: "劳动合同", knowledgeBaseId: "base" });
    expect(mocks.assertAccess).toHaveBeenCalledWith("owner", "base");
    const query = mocks.queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('embedding."model" =');
    expect(query.sql).toContain('embedding."dimensions" =');
    expect(query.sql).toContain('embedding."contentHash" = chunk."contentHash"');
    expect(query.sql).toContain('chunk_set."normalizedContentHash" = document."normalizedContentHash"');
    expect(query.sql).toContain('document."reviewedNormalizedHash" = document."normalizedContentHash"');
    expect(query.sql).toContain('embedding."vector"::vector(1536) <=>');
    expect(query.sql).not.toMatch(/\be\."/);
    expect(query.values).toContain("text-embedding-v4");
  });

  it("其他维度仍使用通用向量比较", async () => {
    mocks.dimensions = 1_024;
    await retrieveRelevantChunks({ userId: "owner", query: "劳动合同" });
    const query = mocks.queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('embedding."vector" <=>');
    expect(query.sql).not.toContain("::vector(1536)");
  });
});
