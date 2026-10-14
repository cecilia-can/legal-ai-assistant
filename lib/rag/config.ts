const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMENSIONS = 1_536;
const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1";

function positiveInt(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function unitInterval(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export type EmbeddingConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  dimensions: number;
  batchSize: number;
  maxRetries: number;
};

export function isRagEnabled() {
  return process.env.RAG_ENABLED?.trim().toLowerCase() === "true";
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const apiKey = process.env.EMBEDDING_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 EMBEDDING_API_KEY，无法执行向量化或检索。");
  return {
    apiKey,
    baseURL: process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_BASE_URL,
    model: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    dimensions: positiveInt(process.env.EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_DIMENSIONS, 3_072),
    batchSize: positiveInt(process.env.EMBEDDING_BATCH_SIZE, 16, 64),
    maxRetries: positiveInt(process.env.EMBEDDING_MAX_RETRIES, 2, 5),
  };
}

export function getRetrievalConfig() {
  return {
    topK: positiveInt(process.env.RAG_TOP_K, 5, 20),
    minSimilarity: unitInterval(process.env.RAG_MIN_SIMILARITY, 0.35),
    maxChunkCharacters: positiveInt(process.env.RAG_MAX_CHUNK_CHARACTERS, 2_400, 12_000),
    maxContextCharacters: positiveInt(process.env.RAG_MAX_CONTEXT_CHARACTERS, 9_000, 40_000),
  };
}
