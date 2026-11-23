-- Keep the exact RAG evidence shown to the model with its assistant reply.
-- Existing messages have no verifiable source snapshot.
ALTER TABLE "Message" ADD COLUMN "sources" JSONB;
