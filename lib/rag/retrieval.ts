import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { assertKnowledgeBaseAccess } from "./access";
import { getEmbeddingConfig, getRetrievalConfig } from "./config";
import { createEmbedding, toVectorLiteral } from "./embeddings";

export type RetrievalResult = {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  documentTitle: string;
  category: string | null;
  text: string;
  sectionPath: string | null;
  locator: unknown;
  pageFrom: number | null;
  pageTo: number | null;
  similarity: number;
};

type RawRetrievalResult = Omit<RetrievalResult, "similarity"> & { similarity: number | string };

export async function retrieveRelevantChunks(input: {
  userId: string;
  query: string;
  knowledgeBaseId?: string;
  category?: string;
  limit?: number;
}) {
  if (input.knowledgeBaseId) await assertKnowledgeBaseAccess(input.userId, input.knowledgeBaseId);
  const config = getEmbeddingConfig();
  const retrieval = getRetrievalConfig();
  const queryVector = toVectorLiteral(await createEmbedding(input.query));
  const limit = Math.min(Math.max(input.limit ?? retrieval.topK, 1), 20);
  const conditions = [
    Prisma.sql`e."model" = ${config.model}`,
    Prisma.sql`e."dimensions" = ${config.dimensions}`,
    Prisma.sql`e."vector" IS NOT NULL`,
    Prisma.sql`chunk_set."status" = 'active'`,
    Prisma.sql`(knowledge_base."scope" = 'system' OR knowledge_base."ownerId" = ${input.userId})`,
  ];
  if (input.knowledgeBaseId) conditions.push(Prisma.sql`knowledge_base."id" = ${input.knowledgeBaseId}`);
  if (input.category) conditions.push(Prisma.sql`document."category" = ${input.category}`);

  const rows = await prisma.$queryRaw<RawRetrievalResult[]>(Prisma.sql`
    SELECT
      chunk."id" AS "chunkId", chunk."documentId" AS "documentId",
      document."knowledgeBaseId" AS "knowledgeBaseId",
      COALESCE(document."title", document."originalFilename") AS "documentTitle",
      document."category" AS "category", chunk."text" AS "text",
      chunk."sectionPath" AS "sectionPath", chunk."locator" AS "locator",
      chunk."pageFrom" AS "pageFrom", chunk."pageTo" AS "pageTo",
      1 - (embedding."vector" <=> ${queryVector}::vector) AS "similarity"
    FROM "Embedding" embedding
    INNER JOIN "DocumentChunk" chunk ON chunk."id" = embedding."chunkId"
    INNER JOIN "DocumentChunkSet" chunk_set ON chunk_set."id" = chunk."chunkSetId"
    INNER JOIN "Document" document ON document."id" = chunk."documentId"
    INNER JOIN "KnowledgeBase" knowledge_base ON knowledge_base."id" = document."knowledgeBaseId"
    WHERE ${Prisma.join(conditions, " AND ")}
      AND (embedding."vector" <=> ${queryVector}::vector) <= ${1 - retrieval.minSimilarity}
    ORDER BY embedding."vector" <=> ${queryVector}::vector ASC, chunk."id" ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}
