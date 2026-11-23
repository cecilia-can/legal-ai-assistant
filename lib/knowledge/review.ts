import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertSupportedNormalizedDocument } from "@/lib/documents/chunking/input";
import { getIngestionConfig } from "@/lib/documents/ingestion/config";
import { writeNormalizedArtifact } from "@/lib/documents/ingestion/storage";
import { KnowledgeError, activeStatuses } from "./contracts";
import { lockDocument, requireDocument, type Db } from "./service";
import { readControlledJson } from "./storage";

const hashPattern = /^[a-f0-9]{64}$/;

function expectedHash(value: unknown) {
  if (typeof value !== "string" || !hashPattern.test(value)) throw new KnowledgeError("正文版本无效，请刷新后重试。");
  return value;
}

async function editableDocument(userId: string, kbId: string, id: string, hash: string, db: Db) {
  const doc = await requireDocument(userId, kbId, id, true, db);
  if (doc.extractionMethod !== "ocr" || !doc.normalizedUri || !doc.normalizedContentHash || doc.status !== "succeeded") throw new KnowledgeError("只有成功解析的 OCR 文档可人工审核。", 422);
  if (doc.normalizedContentHash !== hash) throw new KnowledgeError("正文已更新，请刷新后重试。", 409);
  if (await db.documentProcessingTask.findFirst({ where: { documentId: id, status: { in: activeStatuses } } })) throw new KnowledgeError("文档正在处理，请等待任务结束。", 409);
  return doc;
}

export async function editOcrPage(userId: string, kbId: string, id: string, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["pageIndex", "text", "expectedHash"].includes(key))) throw new KnowledgeError("编辑请求包含未知字段。");
  if (!Number.isSafeInteger(body.pageIndex) || (body.pageIndex as number) < 0 || (body.pageIndex as number) > 1999) throw new KnowledgeError("页码无效。");
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 30_000 || body.text.includes("\0")) throw new KnowledgeError("正文须为 1–30000 个字符，且不能包含空字符。");
  const text = body.text;
  const hash = expectedHash(body.expectedHash);
  return prisma.$transaction(async (db) => {
    await lockDocument(db, id);
    const doc = await editableDocument(userId, kbId, id, hash, db);
    const normalized = await readControlledJson(getIngestionConfig().artifactRoot, doc.normalizedUri!);
    assertSupportedNormalizedDocument(normalized);
    const page = normalized.pages[body.pageIndex as number];
    if (!page) throw new KnowledgeError("指定页面不存在。", 404);
    if (page.text === text) return { normalizedContentHash: hash, changed: false };
    page.text = text;
    page.blocks = [{ kind: "text", text, sourcePage: page.pageNumber, locator: `page:${page.pageNumber ?? (body.pageIndex as number) + 1}:reviewed` }];
    const artifact = await writeNormalizedArtifact(`${id}-review-${randomUUID()}`, normalized, getIngestionConfig());
    await db.documentChunkSet.updateMany({ where: { documentId: id, status: "active" }, data: { status: "superseded", activatedAt: null } });
    await db.document.update({ where: { id }, data: {
      ocrOriginalNormalizedUri: doc.ocrOriginalNormalizedUri ?? doc.normalizedUri,
      normalizedUri: artifact.relativeUri, normalizedContentHash: artifact.contentHash,
      reviewedNormalizedHash: null, reviewedAt: null, reviewedByUserId: null,
    } });
    return { normalizedContentHash: artifact.contentHash, changed: true };
  }, { timeout: 30_000 });
}

export async function confirmOcrReview(userId: string, kbId: string, id: string, body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => key !== "expectedHash")) throw new KnowledgeError("审核请求只接受正文版本。");
  const hash = expectedHash(body.expectedHash);
  return prisma.$transaction(async (db) => {
    await lockDocument(db, id);
    const doc = await editableDocument(userId, kbId, id, hash, db);
    const normalized = await readControlledJson(getIngestionConfig().artifactRoot, doc.normalizedUri!);
    assertSupportedNormalizedDocument(normalized);
    if (!normalized.pages.some((page) => page.text.trim())) throw new KnowledgeError("正文为空，无法确认审核。", 422);
    if (doc.reviewedNormalizedHash === hash) return { reviewed: true, normalizedContentHash: hash };
    await db.document.update({ where: { id }, data: { reviewedNormalizedHash: hash, reviewedAt: new Date(), reviewedByUserId: userId } });
    return { reviewed: true, normalizedContentHash: hash };
  }, { timeout: 30_000 });
}
