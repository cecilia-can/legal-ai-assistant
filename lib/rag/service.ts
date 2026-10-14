import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { assertKnowledgeBaseAccess } from "./access";
import { getEmbeddingConfig } from "./config";
import { createEmbeddings, toVectorLiteral } from "./embeddings";

type CandidateChunk = { id: string; text: string; contentHash: string };

async function writeEmbedding(input: { chunkId: string; contentHash: string; vector: number[] }) {
  const config = getEmbeddingConfig();
  await prisma.$executeRaw(Prisma.sql`
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
      },
    },
    select: { id: true, text: true, contentHash: true, embeddings: { where: { model: config.model, dimensions: config.dimensions }, select: { contentHash: true } } },
    orderBy: { id: "asc" },
  });
  return chunks
    .filter((chunk) => !chunk.embeddings.some((embedding) => embedding.contentHash === chunk.contentHash))
    .map(({ id, text, contentHash }) => ({ id, text, contentHash }));
}

export async function embedAvailableChunks(input: { userId: string; knowledgeBaseId?: string; documentId?: string }) {
  const config = getEmbeddingConfig();
  if (input.documentId) {
    const document = await prisma.document.findFirst({ where: { id: input.documentId, knowledgeBase: { OR: [{ scope: "system" }, { ownerId: input.userId }] } }, select: { id: true, knowledgeBaseId: true } });
    if (!document) throw new Error("文档不存在或无权访问。");
    if (input.knowledgeBaseId && document.knowledgeBaseId !== input.knowledgeBaseId) throw new Error("文档不属于指定知识库。");
  }
  const candidates = await findCandidates(input);
  const task = await prisma.embeddingTask.create({ data: { requestedByUserId: input.userId, knowledgeBaseId: input.knowledgeBaseId, documentId: input.documentId, model: config.model, dimensions: config.dimensions, status: "running", totalChunks: candidates.length, startedAt: new Date() } });
  let completed = 0;
  const failed: { chunkId: string; message: string }[] = [];
  for (let offset = 0; offset < candidates.length; offset += config.batchSize) {
    const batch = candidates.slice(offset, offset + config.batchSize);
    try {
      const vectors = await createEmbeddings(batch.map((chunk) => chunk.text));
      await Promise.all(batch.map((chunk, index) => writeEmbedding({ chunkId: chunk.id, contentHash: chunk.contentHash, vector: vectors[index]! })));
      completed += batch.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding 批次失败。";
      failed.push(...batch.map((chunk) => ({ chunkId: chunk.id, message })));
    }
    await prisma.embeddingTask.update({ where: { id: task.id }, data: { completedChunks: completed, failedChunks: failed.length, retryCount: config.maxRetries, failureDetails: failed } });
  }
  const status = failed.length === 0 ? "completed" : completed > 0 ? "partial" : "failed";
  return prisma.embeddingTask.update({ where: { id: task.id }, data: { status, completedAt: new Date(), errorMessage: failed[0]?.message ?? null, failureDetails: failed } });
}
