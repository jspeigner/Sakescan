-- Phase 1: persist WineEngine search outcomes + track which catalog images are indexed on TinEye.

ALTER TABLE public.sake
  ADD COLUMN IF NOT EXISTS wineengine_indexed_at timestamptz;

COMMENT ON COLUMN public.sake.wineengine_indexed_at IS
  'When this sake.image_url was successfully added to the TinEye WineEngine collection';

CREATE TABLE IF NOT EXISTS public.wineengine_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_sha256 text NOT NULL,
  query_image_url text,
  source text NOT NULL,
  status text NOT NULL,
  top_sake_id uuid,
  top_score real,
  top_score_text real,
  match_count integer NOT NULL DEFAULT 0,
  raw_result jsonb NOT NULL DEFAULT '[]'::jsonb,
  cache_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wineengine_search_log_sha256_idx
  ON public.wineengine_search_log (query_sha256, created_at DESC);

CREATE INDEX IF NOT EXISTS wineengine_search_log_created_at_idx
  ON public.wineengine_search_log (created_at DESC);

CREATE INDEX IF NOT EXISTS wineengine_search_log_top_sake_idx
  ON public.wineengine_search_log (top_sake_id)
  WHERE top_sake_id IS NOT NULL;

COMMENT ON TABLE public.wineengine_search_log IS
  'WineEngine search outcomes for cache/eval; query_sha256 enables unpaid repeat lookups';

ALTER TABLE public.wineengine_search_log ENABLE ROW LEVEL SECURITY;

-- Service role / backend only (no public policies).
