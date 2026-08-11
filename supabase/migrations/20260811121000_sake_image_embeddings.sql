-- Phase 2: own identify index (vision-extracted label text → OpenAI embeddings → pgvector).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.sake_image_embeddings (
  sake_id uuid PRIMARY KEY REFERENCES public.sake(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  image_sha256 text NOT NULL,
  label_text text,
  embedding vector(1536) NOT NULL,
  model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sake_image_embeddings_sha256_uidx
  ON public.sake_image_embeddings (image_sha256);

CREATE INDEX IF NOT EXISTS sake_image_embeddings_updated_at_idx
  ON public.sake_image_embeddings (updated_at DESC);

-- Cosine distance ANN index for local identify.
CREATE INDEX IF NOT EXISTS sake_image_embeddings_embedding_hnsw_idx
  ON public.sake_image_embeddings
  USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE public.sake_image_embeddings IS
  'Local identify index: OpenAI text-embedding-3-small over vision-extracted label text + name/brewery';

ALTER TABLE public.sake_image_embeddings ENABLE ROW LEVEL SECURITY;

-- Exact duplicate lookup by content hash (catalog image already known).
CREATE OR REPLACE FUNCTION public.match_sake_by_image_sha256(p_sha256 text)
RETURNS TABLE (
  sake_id uuid,
  image_url text,
  label_text text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT e.sake_id, e.image_url, e.label_text, 1.0::float AS similarity
  FROM public.sake_image_embeddings e
  WHERE e.image_sha256 = p_sha256
  LIMIT 1;
$$;

-- Vector KNN for local identify.
CREATE OR REPLACE FUNCTION public.match_sake_embeddings(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.55
)
RETURNS TABLE (
  sake_id uuid,
  image_url text,
  label_text text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.sake_id,
    e.image_url,
    e.label_text,
    (1.0 - (e.embedding <=> query_embedding))::float AS similarity
  FROM public.sake_image_embeddings e
  WHERE (1.0 - (e.embedding <=> query_embedding)) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT greatest(match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_sake_by_image_sha256(text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.match_sake_embeddings(vector, int, float) TO service_role, authenticated;
