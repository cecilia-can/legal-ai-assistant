-- Add derived document artifact and OCR metadata without changing existing document content.
ALTER TABLE "Document"
  ADD COLUMN "normalizedUri" TEXT,
  ADD COLUMN "normalizedContentHash" TEXT,
  ADD COLUMN "extractionMethod" TEXT,
  ADD COLUMN "ocrEngine" TEXT,
  ADD COLUMN "ocrVersion" TEXT,
  ADD COLUMN "ocrLanguages" TEXT,
  ADD COLUMN "ocrConfidence" DOUBLE PRECISION;

CREATE INDEX "Document_extractionMethod_updatedAt_idx"
  ON "Document"("extractionMethod", "updatedAt");
