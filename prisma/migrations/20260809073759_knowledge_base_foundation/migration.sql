CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'user',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "originalFilename" TEXT NOT NULL,
    "title" TEXT,
    "sourceIdentifier" TEXT NOT NULL,
    "sourceUri" TEXT,
    "sourceType" TEXT NOT NULL,
    "category" TEXT,
    "documentVersion" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "parserVersion" TEXT,
    "normalizationVersion" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "sectionPath" TEXT,
    "locator" JSONB,
    "pageFrom" INTEGER,
    "pageTo" INTEGER,
    "contentHash" TEXT NOT NULL,
    "chunkStrategyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "vector" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeBase_ownerId_updatedAt_idx" ON "KnowledgeBase"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeBase_scope_updatedAt_idx" ON "KnowledgeBase"("scope", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_knowledgeBaseId_updatedAt_idx" ON "Document"("knowledgeBaseId", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_status_updatedAt_idx" ON "Document"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_category_updatedAt_idx" ON "Document"("category", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_knowledgeBaseId_sourceIdentifier_contentHash_key" ON "Document"("knowledgeBaseId", "sourceIdentifier", "contentHash");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_createdAt_idx" ON "DocumentChunk"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_ordinal_key" ON "DocumentChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "Embedding_model_dimensions_idx" ON "Embedding"("model", "dimensions");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_chunkId_model_contentHash_key" ON "Embedding"("chunkId", "model", "contentHash");

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
