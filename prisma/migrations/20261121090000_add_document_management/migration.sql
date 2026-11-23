ALTER TABLE "Document" ADD COLUMN "originalFileUri" TEXT;

CREATE TABLE "DocumentProcessingTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestedByUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('parse', 'chunk', 'embed')),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed')),
  "stage" TEXT NOT NULL DEFAULT 'queued',
  "completed" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "result" JSONB,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DocumentProcessingTask_status_createdAt_idx" ON "DocumentProcessingTask"("status", "createdAt");
CREATE INDEX "DocumentProcessingTask_documentId_createdAt_idx" ON "DocumentProcessingTask"("documentId", "createdAt");
CREATE UNIQUE INDEX "DocumentProcessingTask_one_active_per_document" ON "DocumentProcessingTask"("documentId") WHERE "status" IN ('pending', 'running');
