-- Track resumable embedding batches without modifying existing source data.
CREATE TABLE "EmbeddingTask" (
    "id" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "knowledgeBaseId" TEXT,
    "documentId" TEXT,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "failedChunks" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureDetails" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmbeddingTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmbeddingTask_status_updatedAt_idx" ON "EmbeddingTask"("status", "updatedAt");
CREATE INDEX "EmbeddingTask_knowledgeBaseId_createdAt_idx" ON "EmbeddingTask"("knowledgeBaseId", "createdAt");
CREATE INDEX "EmbeddingTask_documentId_createdAt_idx" ON "EmbeddingTask"("documentId", "createdAt");

ALTER TABLE "EmbeddingTask" ADD CONSTRAINT "EmbeddingTask_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmbeddingTask" ADD CONSTRAINT "EmbeddingTask_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- text-embedding-3-small uses 1536 dimensions. A partial expression index keeps
-- models with other dimensions isolated until they receive their own migration.
CREATE INDEX "Embedding_text_embedding_3_small_hnsw_idx"
  ON "Embedding" USING hnsw (("vector"::vector(1536)) vector_cosine_ops)
  WHERE "model" = 'text-embedding-3-small' AND "dimensions" = 1536;
