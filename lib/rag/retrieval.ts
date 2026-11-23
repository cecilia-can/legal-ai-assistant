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
  const indexedVector = config.dimensions === 1_536
    ? Prisma.sql`embedding."vector"::vector(1536)`
    : Prisma.sql`embedding."vector"`;
  const queryVectorSql = config.dimensions === 1_536
    ? Prisma.sql`${queryVector}::vector(1536)`
    : Prisma.sql`${queryVector}::vector`;
  const conditions = [
    Prisma.sql`embedding."model" = ${config.model}`,
    Prisma.sql`embedding."dimensions" = ${config.dimensions}`,
    Prisma.sql`embedding."contentHash" = chunk."contentHash"`,
    Prisma.sql`embedding."vector" IS NOT NULL`,
    Prisma.sql`chunk_set."status" = 'active'`,
    Prisma.sql`chunk_set."normalizedContentHash" = document."normalizedContentHash"`,
    Prisma.sql`(document."extractionMethod" IS DISTINCT FROM 'ocr' OR document."reviewedNormalizedHash" = document."normalizedContentHash")`,
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
      1 - (${indexedVector} <=> ${queryVectorSql}) AS "similarity"
    FROM "Embedding" embedding
    INNER JOIN "DocumentChunk" chunk ON chunk."id" = embedding."chunkId"
    INNER JOIN "DocumentChunkSet" chunk_set ON chunk_set."id" = chunk."chunkSetId"
    INNER JOIN "Document" document ON document."id" = chunk."documentId"
    INNER JOIN "KnowledgeBase" knowledge_base ON knowledge_base."id" = document."knowledgeBaseId"
    WHERE ${Prisma.join(conditions, " AND ")}
      AND (${indexedVector} <=> ${queryVectorSql}) <= ${1 - retrieval.minSimilarity}
    ORDER BY ${indexedVector} <=> ${queryVectorSql} ASC, chunk."id" ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}
