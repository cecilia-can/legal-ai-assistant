CREATE TABLE "ConversationMemory" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "sourceMessageIds" JSONB NOT NULL,
    "coveredUntilMessageId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "invalidatedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryCompactionTask" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceStartMessageId" TEXT NOT NULL,
    "sourceEndMessageId" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemoryCompactionTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationRecallChunk" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "startMessageId" TEXT NOT NULL,
    "endMessageId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vector" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationRecallChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationMemory_conversationId_key" ON "ConversationMemory"("conversationId");
CREATE INDEX "ConversationMemory_conversationId_status_idx" ON "ConversationMemory"("conversationId", "status");
CREATE INDEX "MemoryCompactionTask_conversationId_status_createdAt_idx" ON "MemoryCompactionTask"("conversationId", "status", "createdAt");
CREATE INDEX "MemoryCompactionTask_status_updatedAt_idx" ON "MemoryCompactionTask"("status", "updatedAt");
CREATE UNIQUE INDEX "ConversationRecallChunk_conversationId_startMessageId_endMessageId_model_contentHash_key" ON "ConversationRecallChunk"("conversationId", "startMessageId", "endMessageId", "model", "contentHash");
CREATE INDEX "ConversationRecallChunk_conversationId_model_dimensions_idx" ON "ConversationRecallChunk"("conversationId", "model", "dimensions");
CREATE INDEX "ConversationRecallChunk_text_embedding_3_small_hnsw_idx"
  ON "ConversationRecallChunk" USING hnsw (("vector"::vector(1536)) vector_cosine_ops)
  WHERE "model" = 'text-embedding-3-small' AND "dimensions" = 1536;

ALTER TABLE "ConversationMemory" ADD CONSTRAINT "ConversationMemory_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryCompactionTask" ADD CONSTRAINT "MemoryCompactionTask_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationRecallChunk" ADD CONSTRAINT "ConversationRecallChunk_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
