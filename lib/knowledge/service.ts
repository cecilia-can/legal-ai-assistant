// Shared by Next.js route handlers and the standalone Node.js worker.
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getIngestionConfig } from "@/lib/documents/ingestion/config";
import { assertSupportedNormalizedDocument } from "@/lib/documents/chunking/input";
import { KnowledgeError, activeStatuses, indexModel, pagination, type DocumentDto, type ProcessingAction } from "./contracts";
import { controlledFile, discardOriginal, readControlledJson, storeOriginal, uploadRoot, validateUpload } from "./storage";

export type Db = Prisma.TransactionClient;
export const readableScope = (userId: string) => ({ OR: [{ scope: "system" }, { scope: "user", ownerId: userId }] });
export async function requireKnowledgeBase(userId: string, id: string, write = false, db: Db = prisma) {
  const kb = await db.knowledgeBase.findFirst({ where: { id, ...readableScope(userId) } });
  if (!kb) throw new KnowledgeError("知识库不存在或无权访问。", 404);
  if (write && (kb.scope !== "user" || kb.ownerId !== userId)) throw new KnowledgeError("系统知识库仅可阅读。", 403);
  return kb;
}
export async function requireDocument(userId: string, kbId: string, id: string, write = false, db: Db = prisma) {
  await requireKnowledgeBase(userId, kbId, write, db);
  const doc = await db.document.findFirst({ where: { id, knowledgeBaseId: kbId } });
  if (!doc) throw new KnowledgeError("文档不存在或无权访问。", 404);
  return doc;
}
export async function lockDocument(db: Db, id: string) {
  await db.$queryRaw(Prisma.sql`SELECT "id" FROM "Document" WHERE "id" = ${id} FOR UPDATE`);
}
export async function listKnowledgeBases(userId: string) {
  const rows = await prisma.knowledgeBase.findMany({ where: readableScope(userId), orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: { _count: { select: { documents: true } } } });
  return rows.map((row) => ({ id: row.id, name: row.name, scope: row.scope, writable: row.scope === "user" && row.ownerId === userId, documentCount: row._count.documents }));
}
export async function createKnowledgeBase(userId: string, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => key !== "name")) throw new KnowledgeError("创建知识库只接受名称。");
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) throw new KnowledgeError("知识库名称须为 1–100 个字符。");
  const row = await prisma.knowledgeBase.create({ data: { name: body.name.trim(), scope: "user", ownerId: userId } });
  return { id: row.id, name: row.name, scope: row.scope, writable: true, documentCount: 0 };
}
const taskSelect = { id: true, action: true, status: true, stage: true, completed: true, total: true, attempts: true, errorMessage: true, result: true, createdAt: true, completedAt: true } satisfies Prisma.DocumentProcessingTaskSelect;
export function serializeTask(row: Prisma.DocumentProcessingTaskGetPayload<{ select: typeof taskSelect }>) {
  return { ...row, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null };
}

export async function documentSummary(id: string): Promise<DocumentDto> {
  const row = await prisma.document.findUniqueOrThrow({ where: { id }, select: {
    id: true, title: true, originalFilename: true, sourceType: true, category: true, documentVersion: true, status: true,
    errorMessage: true, updatedAt: true, originalFileUri: true, normalizedUri: true, normalizedContentHash: true,
    extractionMethod: true, reviewedNormalizedHash: true, reviewedAt: true,
    chunkSets: { orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 1, select: { status: true } },
    processingTasks: { where: { status: { in: activeStatuses } }, select: taskSelect, take: 1 },
  } });
  const { model, dimensions } = indexModel();
  const [counts] = await prisma.$queryRaw<{ chunks: bigint; indexed: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS chunks, COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM "Embedding" e WHERE e."chunkId" = c."id" AND e."model" = ${model}
      AND e."dimensions" = ${dimensions} AND e."contentHash" = c."contentHash" AND e."vector" IS NOT NULL
    )) AS indexed FROM "DocumentChunk" c
    JOIN "DocumentChunkSet" s ON s."id" = c."chunkSetId"
    JOIN "Document" d ON d."id" = c."documentId"
    WHERE c."documentId" = ${id} AND s."status" = 'active' AND s."normalizedContentHash" = d."normalizedContentHash"
    AND (d."extractionMethod" IS DISTINCT FROM 'ocr' OR d."reviewedNormalizedHash" = d."normalizedContentHash")
  `);
  const { originalFileUri, normalizedUri, chunkSets, processingTasks, ...publicFields } = row;
  return { ...publicFields, errorMessage: row.errorMessage ? (row.status === "ocr_failed" ? "OCR 失败，请检查 OCR 依赖、语言包与任务记录。" : "文档处理失败，请检查文件格式、转换依赖与任务记录。") : null,
    updatedAt: row.updatedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null,
    hasOriginal: Boolean(originalFileUri), hasNormalized: Boolean(normalizedUri),
    chunkCount: Number(counts?.chunks ?? 0), indexedCount: Number(counts?.indexed ?? 0), model,
    chunkState: chunkSets[0]?.status ?? "none", activeTask: processingTasks[0] ? serializeTask(processingTasks[0]) : null };
}
export async function listDocuments(userId: string, kbId: string, params: URLSearchParams) {
  const kb = await requireKnowledgeBase(userId, kbId);
  const { page, pageSize, skip } = pagination(params);
  const where: Prisma.DocumentWhereInput = { knowledgeBaseId: kbId };
  for (const key of ["category", "sourceType", "status", "documentVersion"] as const) {
    const value = params.get(key)?.trim();
    if (value && value.length > 200) throw new KnowledgeError("筛选条件过长。");
    if (value) where[key] = value;
  }
  const [rows, total] = await Promise.all([
    prisma.document.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip, take: pageSize, select: { id: true } }),
    prisma.document.count({ where }),
  ]);
  return { items: await Promise.all(rows.map((row) => documentSummary(row.id))), total, page, pageSize, knowledgeBase: { id: kb.id, name: kb.name, writable: kb.scope === "user" && kb.ownerId === userId } };
}
export async function documentDetail(userId: string, kbId: string, id: string) {
  const doc = await requireDocument(userId, kbId, id);
  const [summary, sets, tasks] = await Promise.all([
    documentSummary(id),
    prisma.documentChunkSet.findMany({ where: { documentId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, status: true, strategyVersion: true, qualityIssues: true, createdAt: true, _count: { select: { chunks: true } } } }),
    prisma.documentProcessingTask.findMany({ where: { documentId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 30, select: taskSelect }),
  ]);
  const kb = await requireKnowledgeBase(userId, kbId);
  return { ...summary, writable: kb.scope === "user" && kb.ownerId === userId, sourceIdentifier: doc.sourceIdentifier.startsWith("upload:") ? doc.sourceIdentifier : doc.originalFilename,
    sourceUri: doc.sourceUri && /^https?:\/\//i.test(doc.sourceUri) ? doc.sourceUri : null,
    parserVersion: doc.parserVersion, normalizationVersion: doc.normalizationVersion,
    chunkSets: sets.map(({ _count, createdAt, ...set }) => ({ ...set, chunkCount: _count.chunks, createdAt: createdAt.toISOString() })), tasks: tasks.map(serializeTask) };
}

export async function uploadDocument(userId: string, kbId: string, file: { name: string; buffer: Buffer }) {
  await requireKnowledgeBase(userId, kbId, true);
  const valid = validateUpload(file.name, file.buffer);
  const uri = await storeOriginal(valid.extension, file.buffer);
  let retained = false;
  try {
    const result = await prisma.$transaction(async (db) => {
      // Serialize version registration within a knowledge base, including different hashes of one source.
      await db.$queryRaw(Prisma.sql`SELECT "id" FROM "KnowledgeBase" WHERE "id" = ${kbId} FOR UPDATE`);
      await requireKnowledgeBase(userId, kbId, true, db);
      const sourceIdentifier = `upload:${valid.filename.toLocaleLowerCase("en-US")}`;
      const existing = await db.document.findUnique({ where: { knowledgeBaseId_sourceIdentifier_contentHash: { knowledgeBaseId: kbId, sourceIdentifier, contentHash: valid.hash } } });
      if (existing) {
        // A repeat upload can restore a missing controlled original without reparsing implicitly.
        let hasReadableOriginal = false;
        if (existing.originalFileUri) {
          try { await controlledFile(uploadRoot(), existing.originalFileUri); hasReadableOriginal = true; }
          catch { /* Restore only the unavailable managed copy, never overwrite an immutable original. */ }
        }
        if (!hasReadableOriginal) {
          await db.document.update({ where: { id: existing.id }, data: { originalFileUri: uri } });
        }
        return { documentId: existing.id, duplicate: true, taskId: null, restoredOriginal: !hasReadableOriginal };
      }
      const [version] = await db.$queryRaw<{ highest: number }[]>(Prisma.sql`
        SELECT COALESCE(MAX(SUBSTRING("documentVersion" FROM '^v([0-9]{1,9})$')::integer), 0) AS highest
        FROM "Document" WHERE "knowledgeBaseId" = ${kbId} AND "sourceIdentifier" = ${sourceIdentifier}
      `);
      const doc = await db.document.create({ data: { knowledgeBaseId: kbId, uploadedByUserId: userId, originalFilename: valid.filename, originalFileUri: uri,
        title: valid.filename, sourceIdentifier, sourceType: valid.sourceType, contentHash: valid.hash, documentVersion: `v${(version?.highest ?? 0) + 1}` } });
      const task = await db.documentProcessingTask.create({ data: { documentId: doc.id, requestedByUserId: userId, action: "parse" } });
      return { documentId: doc.id, duplicate: false, taskId: task.id };
    });
    retained = !result.duplicate || Boolean("restoredOriginal" in result && result.restoredOriginal);
    return result;
  } finally { if (!retained) await discardOriginal(uri); }
}

export async function enqueueDocumentTask(userId: string, kbId: string, id: string, action: ProcessingAction) {
  return prisma.$transaction(async (db) => {
    await lockDocument(db, id);
    const doc = await requireDocument(userId, kbId, id, true, db);
    const active = await db.documentProcessingTask.findFirst({ where: { documentId: id, status: { in: activeStatuses } } });
    if (active) {
      if (active.action !== action) throw new KnowledgeError("文档正在执行其他任务，请等待结束。", 409);
      return serializeTask(active);
    }
    if (action === "parse") {
      if (!doc.originalFileUri) throw new KnowledgeError("该文档没有受控原件，请重新上传。", 422);
      await controlledFile(uploadRoot(), doc.originalFileUri);
    } else {
      if (!doc.normalizedUri || !doc.normalizedContentHash || doc.status !== "succeeded") throw new KnowledgeError("请先成功解析文档。", 422);
      if (doc.extractionMethod === "ocr" && doc.reviewedNormalizedHash !== doc.normalizedContentHash) throw new KnowledgeError("请先审核并确认 OCR 正文，再生成切片或索引。", 422);
      if (action === "embed" && !await db.documentChunkSet.findFirst({ where: { documentId: id, status: "active", normalizedContentHash: doc.normalizedContentHash } })) throw new KnowledgeError("请先生成质量合格的当前切片。", 422);
    }
    return serializeTask(await db.documentProcessingTask.create({ data: { documentId: id, requestedByUserId: userId, action } }));
  });
}
export async function normalizedPreview(userId: string, kbId: string, id: string, params: URLSearchParams) {
  const doc = await requireDocument(userId, kbId, id);
  if (!doc.normalizedUri) throw new KnowledgeError("文档尚无规范化正文，请先解析。", 422);
  const normalized = await readControlledJson(getIngestionConfig().artifactRoot, doc.normalizedUri);
  assertSupportedNormalizedDocument(normalized);
  const { page, pageSize, skip } = pagination(params);
  return { items: normalized.pages.slice(skip, skip + pageSize).map((p) => ({ pageNumber: p.pageNumber, text: p.text })), total: normalized.pages.length, page, pageSize };
}
export async function chunksPreview(userId: string, kbId: string, id: string, params: URLSearchParams) {
  await requireDocument(userId, kbId, id);
  const setId = params.get("chunkSetId");
  const set = await prisma.documentChunkSet.findFirst({ where: { documentId: id, ...(setId ? { id: setId } : { status: "active" }) }, orderBy: { createdAt: "desc" } });
  const { page, pageSize, skip } = pagination(params);
  if (!set && setId) throw new KnowledgeError("该文档不存在指定的切片集。", 404);
  if (!set) return { items: [], total: 0, page, pageSize };
  const [items, total] = await Promise.all([
    prisma.documentChunk.findMany({ where: { chunkSetId: set.id }, orderBy: [{ ordinal: "asc" }, { id: "asc" }], skip, take: pageSize, select: { id: true, ordinal: true, text: true, sectionPath: true, locator: true, pageFrom: true, pageTo: true } }),
    prisma.documentChunk.count({ where: { chunkSetId: set.id } }),
  ]);
  return { items, total, page, pageSize };
}
export async function deleteDocument(userId: string, kbId: string, id: string) {
  return prisma.$transaction(async (db) => {
    await lockDocument(db, id);
    await requireDocument(userId, kbId, id, true, db);
    if (await db.documentProcessingTask.findFirst({ where: { documentId: id, status: { in: activeStatuses } } })) throw new KnowledgeError("文档仍有处理任务，请等待任务结束后删除。", 409);
    await db.embeddingTask.deleteMany({ where: { documentId: id } });
    await db.document.delete({ where: { id } });
    return { deleted: true, filesRetained: true };
  });
}
