export class KnowledgeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "KnowledgeError"; }
}

export const actions = ["parse", "chunk", "embed"] as const;
export type ProcessingAction = typeof actions[number];
export function parseAction(value: unknown): ProcessingAction {
  if (!actions.includes(value as ProcessingAction)) throw new KnowledgeError("请选择解析、切片或索引操作。");
  return value as ProcessingAction;
}
export function pagination(params: URLSearchParams) {
  const number = (key: string, fallback: number, maximum: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw new KnowledgeError(`${key} 超出允许范围。`);
    return n;
  };
  const page = number("page", 1, 100_000);
  const pageSize = number("pageSize", 20, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export const activeStatuses = ["pending", "running"];
export const labels: Record<string, string> = {
  pending: "排队中", running: "处理中", processing: "解析中", ocr_processing: "OCR 处理中",
  succeeded: "已完成", failed: "失败", ocr_failed: "OCR 失败", manual_review: "待人工检查",
  active: "当前使用", superseded: "历史版本", blocked: "质量未通过", parse: "解析", chunk: "切片", embed: "索引",
};
export function indexModel() {
  const dimensions = Number.parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10);
  return { model: process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small", dimensions: Number.isInteger(dimensions) && dimensions > 0 && dimensions <= 3072 ? dimensions : 1536 };
}

export type KnowledgeBaseDto = { id: string; name: string; scope: string; writable: boolean; documentCount: number };
export type TaskDto = { id: string; action: string; status: string; stage: string; completed: number; total: number; attempts: number; errorMessage: string | null; result: unknown; createdAt: string; completedAt: string | null };
export type DocumentDto = {
  id: string; title: string | null; originalFilename: string; sourceType: string; category: string | null;
  documentVersion: string | null; status: string; errorMessage: string | null; updatedAt: string;
  extractionMethod: string | null; normalizedContentHash: string | null; reviewedNormalizedHash: string | null; reviewedAt: string | null;
  hasOriginal: boolean; hasNormalized: boolean; chunkCount: number; indexedCount: number; model: string;
  chunkState: string; activeTask: TaskDto | null;
};
export type DocumentDetailDto = DocumentDto & { sourceIdentifier: string; sourceUri: string | null; parserVersion: string | null; normalizationVersion: string | null; chunkSets: ChunkSetDto[]; tasks: TaskDto[]; writable: boolean };
export type ChunkSetDto = { id: string; status: string; strategyVersion: string; qualityIssues: unknown; createdAt: string; chunkCount: number };
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };
