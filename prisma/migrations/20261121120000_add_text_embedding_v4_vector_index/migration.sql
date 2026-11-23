-- Model Studio text-embedding-v4 can emit 1536-dimensional vectors.
-- Keep its index separate from the existing OpenAI model index.
CREATE INDEX "Embedding_text_embedding_v4_hnsw_idx"
  ON "Embedding" USING hnsw (("vector"::vector(1536)) vector_cosine_ops)
  WHERE "model" = 'text-embedding-v4' AND "dimensions" = 1536;
