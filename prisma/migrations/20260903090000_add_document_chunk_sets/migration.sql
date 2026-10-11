-- Create versioned, activatable chunk sets without changing source documents.
CREATE TABLE IF NOT EXISTS "DocumentChunkSet" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "normalizedContentHash" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "qualityIssues" JSONB,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunkSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentChunkSet_documentId_normalizedContentHash_strategyVersion_key"
  ON "DocumentChunkSet"("documentId", "normalizedContentHash", "strategyVersion");

-- Preserve any pre-existing chunks by placing them in a non-active legacy set.
INSERT INTO "DocumentChunkSet" (
    "id", "documentId", "normalizedContentHash", "strategyVersion", "status", "createdAt", "updatedAt"
)
SELECT
    md5('legacy:' || c."documentId" || ':' || c."chunkStrategyVersion"),
    c."documentId",
    COALESCE(d."normalizedContentHash", d."contentHash"),
    c."chunkStrategyVersion",
    'legacy',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "DocumentChunk" c
INNER JOIN "Document" d ON d."id" = c."documentId"
GROUP BY c."documentId", c."chunkStrategyVersion", d."normalizedContentHash", d."contentHash"
ON CONFLICT ("documentId", "normalizedContentHash", "strategyVersion") DO NOTHING;

ALTER TABLE "DocumentChunk" ADD COLUMN "chunkSetId" TEXT;

UPDATE "DocumentChunk" c
SET "chunkSetId" = s."id"
FROM "DocumentChunkSet" s
WHERE s."documentId" = c."documentId"
  AND s."strategyVersion" = c."chunkStrategyVersion"
  AND s."status" = 'legacy';

DROP INDEX "DocumentChunk_documentId_ordinal_key";

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentChunkSet_documentId_normalizedContentHash_strategyVersion_key"
  ON "DocumentChunkSet"("documentId", "normalizedContentHash", "strategyVersion");
CREATE INDEX IF NOT EXISTS "DocumentChunkSet_documentId_status_updatedAt_idx"
  ON "DocumentChunkSet"("documentId", "status", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentChunk_chunkSetId_ordinal_key"
  ON "DocumentChunk"("chunkSetId", "ordinal");
CREATE INDEX IF NOT EXISTS "DocumentChunk_chunkSetId_createdAt_idx"
  ON "DocumentChunk"("chunkSetId", "createdAt");

ALTER TABLE "DocumentChunk"
  ADD CONSTRAINT "DocumentChunk_chunkSetId_fkey"
  FOREIGN KEY ("chunkSetId") REFERENCES "DocumentChunkSet"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentChunkSet"
  ADD CONSTRAINT "DocumentChunkSet_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
