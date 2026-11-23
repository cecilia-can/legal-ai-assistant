import OpenAI from "openai";
import { getEmbeddingConfig } from "./config";
export { toVectorLiteral } from "./vector";

export class EmbeddingServiceError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "EmbeddingServiceError";
  }
}

function isRetryable(error: unknown) {
  const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : undefined;
  return status === 429 || (status !== undefined && status >= 500);
}

export async function createEmbeddings(input: string[]) {
  if (!input.length) return [] as number[][];
  const config = getEmbeddingConfig();
  let lastError: EmbeddingServiceError | null = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      const response = await client.embeddings.create({ model: config.model, input, dimensions: config.dimensions, encoding_format: "float" });
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      const vectors = ordered.map((item) => item.embedding);
      if (vectors.length !== input.length || ordered.some((item, index) => item.index !== index) || vectors.some((vector) => vector.length !== config.dimensions || vector.some((n) => !Number.isFinite(n)))) {
        throw new EmbeddingServiceError(`Embedding 维度必须为 ${config.dimensions}，或响应数量与输入不一致。`, false);
      }
      return vectors;
    } catch (error) {
      if (error instanceof EmbeddingServiceError) throw error;
      lastError = new EmbeddingServiceError(error instanceof Error ? error.message : "Embedding 服务调用失败。", isRetryable(error));
      if (!lastError.retryable || attempt === config.maxRetries) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError ?? new EmbeddingServiceError("Embedding 服务调用失败。", false);
}

export async function createEmbedding(input: string) {
  const [vector] = await createEmbeddings([input]);
  if (!vector) throw new EmbeddingServiceError("Embedding 服务未返回向量。", false);
  return vector;
}
