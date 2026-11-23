ALTER TABLE "Document"
  ADD COLUMN "ocrOriginalNormalizedUri" TEXT,
  ADD COLUMN "reviewedNormalizedHash" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT;
