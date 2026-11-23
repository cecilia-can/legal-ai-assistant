import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { embeddings = { create: mocks.create }; } }));
vi.mock("./config", () => ({ getEmbeddingConfig: () => ({ apiKey: "test", baseURL: "http://localhost", model: "fixture", dimensions: 2, batchSize: 2, maxRetries: 1 }) }));
import { createEmbeddings } from "./embeddings";
beforeEach(() => vi.clearAllMocks());
describe("Embedding 响应与批次对应关系", () => {
  it("将乱序响应按输入索引还原，显式请求浮点编码", async () => {
    mocks.create.mockResolvedValue({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] });
    expect(await createEmbeddings(["first", "second"])).toEqual([[1, 0], [0, 1]]);
    expect(mocks.create.mock.calls[0][0].encoding_format).toBe("float");
  });
  it("拒绝非有限数值、错误维度与重复索引，不重试无效响应", async () => {
    for (const data of [[{ index: 0, embedding: [NaN, 1] }], [{ index: 0, embedding: [1] }]]) {
      mocks.create.mockResolvedValueOnce({ data });
      await expect(createEmbeddings(["first"])).rejects.toMatchObject({ retryable: false });
    }
    mocks.create.mockResolvedValueOnce({ data: [{ index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] }] });
    await expect(createEmbeddings(["first", "second"])).rejects.toMatchObject({ retryable: false });
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });
  it("空输入不调用外部服务", async () => {
    expect(await createEmbeddings([])).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
