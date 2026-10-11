import { prisma } from "@/lib/db";
import { sha256Text } from "../ingestion/storage";
import { DocumentChunkingError } from "./errors";
import { assertChunkingEligibility, loadChunkingDocument } from "./input";
import {
  createChunkingService,
  type ChunkingTransaction,
} from "./service-core";

export { createChunkingService } from "./service-core";
export type {
  ChunkingServiceDependencies,
  ChunkingTransaction,
} from "./service-core";

export const chunkDocument = createChunkingService({
  loadDocument: loadChunkingDocument,
  sha256: sha256Text,
  runInTransaction: async (operation) =>
    prisma.$transaction((transaction) =>
      operation(transaction as unknown as ChunkingTransaction),
    ),
});

export async function previewDocumentChunks(input: {
  documentId: string;
  userId: string;
  chunkSetId?: string;
}) {
  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      title: true,
      originalFilename: true,
      status: true,
      normalizedUri: true,
      normalizedContentHash: true,
      knowledgeBase: { select: { scope: true, ownerId: true } },
      chunkSets: {
        where: input.chunkSetId ? { id: input.chunkSetId } : { status: "active" },
        select: {
          id: true, status: true, strategyVersion: true, normalizedContentHash: true,
          qualityIssues: true, createdAt: true, activatedAt: true,
          chunks: { orderBy: { ordinal: "asc" }, select: { ordinal: true, text: true, sectionPath: true, locator: true, pageFrom: true, pageTo: true, contentHash: true } },
        },
      },
    },
  });
  if (!document) throw new DocumentChunkingError("文档不存在或无权访问。", "UNAUTHORIZED");
  assertChunkingEligibility(document, input.userId);
  const chunkSet = document.chunkSets[0];
  if (!chunkSet) throw new DocumentChunkingError(input.chunkSetId ? "该文档不存在指定的切片集。" : "该文档尚未生成可预览的激活切片集。", "INVALID_INPUT");
  return { document: { id: document.id, title: document.title, originalFilename: document.originalFilename }, chunkSet };
}
