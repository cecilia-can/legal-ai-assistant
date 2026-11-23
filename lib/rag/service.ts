// Used by both server routes and standalone document workers.

import { randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { assertKnowledgeBaseAccess } from "./access";
import { getEmbeddingConfig } from "./config";
import { createEmbeddings, toVectorLiteral } from "./embeddings";

export type EmbeddingExecution = {
  transaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  progress(completed: number, total: number): Promise<void>;
};

async function writeEmbedding(input: { chunkId: string; contentHash: string; vector: number[] }, db: Prisma.TransactionClient = prisma) {
  const config = getEmbeddingConfig();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "Embedding" ("id", "chunkId", "model", "dimensions", "contentHash", "vector", "createdAt")
    VALUES (${randomUUID()}, ${input.chunkId}, ${config.model}, ${config.dimensions}, ${input.contentHash}, ${toVectorLiteral(input.vector)}::vector, CURRENT_TIMESTAMP)
    ON CONFLICT ("chunkId", "model", "contentHash") DO UPDATE
      SET "dimensions" = EXCLUDED."dimensions", "vector" = EXCLUDED."vector", "createdAt" = CURRENT_TIMESTAMP
  `);
}

async function findCandidates(input: { userId: string; knowledgeBaseId?: string; documentId?: string }) {
  if (input.knowledgeBaseId) await assertKnowledgeBaseAccess(input.userId, input.knowledgeBaseId);
  const config = getEmbeddingConfig();
  const chunks = await prisma.documentChunk.findMany({
    where: {
      ...(input.documentId ? { documentId: input.documentId } : {}),
      chunkSet: { status: "active" },
      document: {
        ...(input.knowledgeBaseId ? { knowledgeBaseId: input.knowledgeBaseId } : {}),
        knowledgeBase: { OR: [{ scope: "system" }, { ownerId: input.userId }] },
        OR: [{ extractionMethod: null }, { extractionMethod: { not: "ocr" } }, { reviewedNormalizedHash: { not: null } }],
      },
    },
    select: { id: true, text: true, contentHash: true, embeddings: { where: { model: config.model, dimensions: config.dimensions }, select: { contentHash: true } } },
    orderBy: { id: "asc" },
  });
  const valid = chunks.length ? await prisma.$queryRaw<{ chunkId: string; contentHash: string }[]>(Prisma.sql`
    SELECT "chunkId", "contentHash" FROM "Embedding" WHERE "chunkId" IN (${Prisma.join(chunks.map((chunk) => chunk.id))})
    AND "model" = ${config.model} AND "dimensions" = ${config.dimensions} AND "vector" IS NOT NULL
  `) : [];
  const validKeys = new Set(valid.map((entry) => `${entry.chunkId}:${entry.contentHash}`));
  return chunks
    .filter((chunk) => !validKeys.has(`${chunk.id}:${chunk.contentHash}`))
    .map(({ id, text, contentHash }) => ({ id, text, contentHash }));
}

export async function embedAvailableChunks(input: { userId: string; knowledgeBaseId?: string; documentId?: string }, execution?: EmbeddingExecution) {
  const transact = <T>(operation: (db: Prisma.TransactionClient) => Promise<T>) => execution ? execution.transaction(operation) : operation(prisma);
  const config = getEmbeddingConfig();
  if (input.documentId) {
    const document = await prisma.document.findFirst({ where: { id: input.documentId, knowledgeBase: { OR: [{ scope: "system" }, { ownerId: input.userId }] } }, select: { id: true, knowledgeBaseId: true, extractionMethod: true, reviewedNormalizedHash: true, normalizedContentHash: true } });
    if (!document) throw new Error("文档不存在或无权访问。");
    if (input.knowledgeBaseId && document.knowledgeBaseId !== input.knowledgeBaseId) throw new Error("文档不属于指定知识库。");
    if (document.extractionMethod === "ocr" && document.reviewedNormalizedHash !== document.normalizedContentHash) throw new Error("请先审核并确认 OCR 正文。");
  }
  const candidates = await findCandidates(input);
  const task = await transact((db) => db.embeddingTask.create({ data: { requestedByUserId: input.userId, knowledgeBaseId: input.knowledgeBaseId, documentId: input.documentId, model: config.model, dimensions: config.dimensions, status: "running", totalChunks: candidates.length, startedAt: new Date() } }));
  let completed = 0;
  const failed: { chunkId: string; message: string }[] = [];
  for (let offset = 0; offset < candidates.length; offset += config.batchSize) {
    const batch = candidates.slice(offset, offset + config.batchSize);
    try {
      const vectors = await createEmbeddings(batch.map((chunk) => chunk.text));
      await transact((db) => Promise.all(batch.map((chunk, index) => writeEmbedding({ chunkId: chunk.id, contentHash: chunk.contentHash, vector: vectors[index]! }, db))));
      completed += batch.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding 批次失败。";
      failed.push(...batch.map((chunk) => ({ chunkId: chunk.id, message })));
    }
    await transact((db) => db.embeddingTask.update({ where: { id: task.id }, data: { completedChunks: completed, failedChunks: failed.length, retryCount: config.maxRetries, failureDetails: failed } }));
    await execution?.progress(completed, candidates.length);
  }
  const status = failed.length === 0 ? "completed" : completed > 0 ? "partial" : "failed";
  return transact((db) => db.embeddingTask.update({ where: { id: task.id }, data: { status, completedAt: new Date(), errorMessage: failed[0]?.message ?? null, failureDetails: failed } }));
}
