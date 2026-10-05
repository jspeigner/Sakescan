-- Identify must ignore sticky embeddings after catalog image clear/replace.
-- match_* previously returned sake_image_embeddings rows with no check that
-- sake.image_url still matches, so cleared whisky photos kept hashing to the
-- wrong sake and pinned the sha256 unique index.

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
  INNER JOIN public.sake s ON s.id = e.sake_id
  WHERE e.image_sha256 = p_sha256
    AND s.image_url IS NOT NULL
    AND btrim(s.image_url) <> ''
    AND s.image_url = e.image_url
  LIMIT 1;
$$;

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
  INNER JOIN public.sake s ON s.id = e.sake_id
  WHERE s.image_url IS NOT NULL
    AND btrim(s.image_url) <> ''
    AND s.image_url = e.image_url
    AND (1.0 - (e.embedding <=> query_embedding)) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT greatest(match_count, 1);
$$;
