// Also runs outside Next.js; do not import its compiler-only server marker here.
import { randomUUID } from "node:crypto";
import { Prisma, type DocumentProcessingTask } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ingestDocument } from "@/lib/documents/ingestion/service";
import { createChunkingService, type ChunkingTransaction } from "@/lib/documents/chunking/service-core";
import { loadChunkingDocument } from "@/lib/documents/chunking/input";
import { sha256Text, sha256File } from "@/lib/documents/ingestion/storage";
import { getIngestionConfig } from "@/lib/documents/ingestion/config";
import { embedAvailableChunks } from "@/lib/rag/service";
import { KnowledgeError } from "./contracts";
import { lockDocument, requireDocument, type Db } from "./service";
import { controlledFile, uploadRoot } from "./storage";

const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;
export function leaseIsCurrent(task: Pick<DocumentProcessingTask, "status" | "leaseToken" | "leaseExpiresAt">, token: string, now = new Date()) {
  return task.status === "running" && task.leaseToken === token && task.leaseExpiresAt !== null && task.leaseExpiresAt > now;
}
export async function withLease<T>(task: DocumentProcessingTask, operation: (db: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (db) => {
    await lockDocument(db, task.documentId);
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "DocumentProcessingTask" WHERE "id" = ${task.id} FOR UPDATE`);
    const current = await db.documentProcessingTask.findUnique({ where: { id: task.id } });
    if (!current || !task.leaseToken || !leaseIsCurrent(current, task.leaseToken)) throw new KnowledgeError("任务执行权已失效，结果未发布。", 409);
    return operation(db);
  }, { timeout: 30_000 });
}

export async function claimTask(documentId?: string) {
  return prisma.$transaction(async (db) => {
    // SKIP LOCKED permits multiple worker processes without double claiming.
    const rows = await db.$queryRaw<DocumentProcessingTask[]>(Prisma.sql`
      SELECT * FROM "DocumentProcessingTask"
      WHERE ("status" = 'pending' OR ("status" = 'running' AND "leaseExpiresAt" < CURRENT_TIMESTAMP))
      ${documentId ? Prisma.sql`AND "documentId" = ${documentId}` : Prisma.empty}
      ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
    `);
    const task = rows[0];
    if (!task) return null;
    if (task.attempts >= MAX_ATTEMPTS) {
      await db.documentProcessingTask.update({ where: { id: task.id }, data: { status: "failed", errorMessage: "任务多次中断，请检查 worker 后重新提交。", completedAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
      return null;
    }
    return db.documentProcessingTask.update({ where: { id: task.id }, data: { status: "running", stage: task.action, attempts: { increment: 1 }, startedAt: new Date(), leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + LEASE_MS), errorMessage: null } });
  });
}

export function publicProcessingError(error: unknown, action: string) {
  if (error instanceof KnowledgeError) return error.message;
  const text = error instanceof Error ? error.message : "";
  if (/EMBEDDING_API_KEY/.test(text)) return "未配置 Embedding 服务凭证，请配置后重试索引。";
  if (/OCR|tesseract|ocrmypdf/i.test(text)) return "OCR 处理失败，请检查 OCRmyPDF、Tesseract、语言包与执行时限。";
  if (/soffice|libreoffice|DOC 转换/i.test(text)) return "文档转换失败，请检查 LibreOffice 是否安装并可执行。";
  if (/429|rate.limit/i.test(text)) return "模型服务限流，请稍后重试。";
  if (/401|403/.test(text)) return "模型服务拒绝访问，请检查服务端凭证与权限。";
  if (/维度/.test(text)) return "Embedding 维度与配置不匹配，请检查模型和维度。";
  return `${action === "parse" ? "文档解析" : action === "chunk" ? "切片" : "索引"}失败，请检查文件格式、系统依赖及服务配置后重试。`;
}

export async function processTask(task: DocumentProcessingTask) {
  let heartbeatBusy = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      await prisma.documentProcessingTask.updateMany({ where: { id: task.id, status: "running", leaseToken: task.leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
    } catch { /* Publication still checks the durable lease after a transient DB failure. */ }
    finally { heartbeatBusy = false; }
  }, 10_000);
  heartbeat.unref();
  const progress = (stage: string, completed = 0, total = 0) => withLease(task, async (db) => {
    await db.documentProcessingTask.update({ where: { id: task.id }, data: { stage, completed, total } });
  });
  try {
    const raw = await prisma.document.findUnique({ where: { id: task.documentId }, select: { knowledgeBaseId: true } });
    if (!raw) throw new KnowledgeError("文档已不存在。", 404);
    const doc = await requireDocument(task.requestedByUserId, raw.knowledgeBaseId, task.documentId, true);
    let result: Prisma.InputJsonValue = {};
    if (task.action === "parse") {
      if (!doc.originalFileUri) throw new KnowledgeError("原件缺失，请重新上传。", 422);
      const filePath = await controlledFile(uploadRoot(), doc.originalFileUri);
      if (await sha256File(filePath) !== doc.contentHash) throw new KnowledgeError("原件哈希不匹配，请重新上传。", 422);
      const parsed = await ingestDocument({ knowledgeBaseId: doc.knowledgeBaseId, userId: task.requestedByUserId, filePath,
        sourceIdentifier: doc.sourceIdentifier, sourceUri: doc.sourceUri ?? undefined, title: doc.title ?? undefined,
        category: doc.category ?? undefined, config: { sourceRoot: uploadRoot() } }, {
        documentId: doc.id, artifactId: `${doc.id}-${task.leaseToken}`, originalFilename: doc.originalFilename,
        report: (stage) => progress(stage),
        publish: (data) => withLease(task, async (db) => {
          await requireDocument(task.requestedByUserId, doc.knowledgeBaseId, doc.id, true, db);
          if (doc.normalizedContentHash !== data.normalizedContentHash || doc.extractionMethod === "ocr" || data.extractionMethod === "ocr") {
            await db.documentChunkSet.updateMany({ where: { documentId: doc.id, status: "active" }, data: { status: "superseded", activatedAt: null } });
          }
          await db.document.update({ where: { id: doc.id }, data: { ...data, ocrOriginalNormalizedUri: null, reviewedNormalizedHash: null, reviewedAt: null, reviewedByUserId: null } });
        }),
      });
      result = { message: "解析完成，请查看正文后生成切片。", status: parsed.status };
    } else if (task.action === "chunk") {
      if (doc.normalizedUri) await controlledFile(getIngestionConfig().artifactRoot, doc.normalizedUri);
      const chunk = createChunkingService({ loadDocument: loadChunkingDocument, sha256: sha256Text,
        runInTransaction: (operation) => withLease(task, async (db) => {
          await requireDocument(task.requestedByUserId, doc.knowledgeBaseId, doc.id, true, db);
          return operation(db as unknown as ChunkingTransaction);
        }) });
      const chunks = await chunk({ documentId: doc.id, userId: task.requestedByUserId });
      if (!chunks.active) throw new KnowledgeError("切片质量未通过，请在切片预览中查看具体原因。", 422);
      result = { chunkSetId: chunks.chunkSetId, message: chunks.created ? `已生成 ${chunks.chunkCount} 个切片。` : "已复用相同内容与策略的切片。" };
    } else if (task.action === "embed") {
      const embedding = await embedAvailableChunks({ userId: task.requestedByUserId, knowledgeBaseId: doc.knowledgeBaseId, documentId: doc.id }, {
        transaction: (operation) => withLease(task, async (db) => {
          await requireDocument(task.requestedByUserId, doc.knowledgeBaseId, doc.id, true, db);
          return operation(db);
        }), progress: (completed, total) => progress("embed", completed, total),
      });
      if (embedding.failedChunks) throw new KnowledgeError(`索引有 ${embedding.failedChunks} 个切片失败，已保留成功结果；请检查服务配置后补齐索引。`, 422);
      result = { embeddingTaskId: embedding.id, message: embedding.totalChunks ? `已补齐 ${embedding.completedChunks} 个切片的向量。` : "当前模型索引已完整，已跳过现有向量。" };
    } else throw new KnowledgeError("不支持的任务操作。");
    await withLease(task, async (db) => {
      await db.documentProcessingTask.update({ where: { id: task.id }, data: { status: "succeeded", result, completedAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
    });
  } catch (error) {
    const message = publicProcessingError(error, task.action);
    try {
      await withLease(task, async (db) => {
        await db.documentProcessingTask.update({ where: { id: task.id }, data: { status: "failed", errorMessage: message, completedAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
        if (task.action === "parse") {
          await db.document.updateMany({ where: { id: task.documentId, normalizedUri: null }, data: { status: /OCR/.test(message) ? "ocr_failed" : "failed", errorMessage: message } });
        }
      });
    } catch { /* A recovered task owns publication; stale attempts must not change its status. */ }
    console.error(JSON.stringify({ event: "knowledge_task_failed", taskId: task.id, action: task.action, message }));
  } finally { clearInterval(heartbeat); }
}
