-- Image provenance for tiered catalog photos (T1 retailer > T2 user scan > T3 web discover).
ALTER TABLE public.sake
  ADD COLUMN IF NOT EXISTS image_source text,
  ADD COLUMN IF NOT EXISTS image_quality text,
  ADD COLUMN IF NOT EXISTS image_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS image_contributor_scan_id uuid;

COMMENT ON COLUMN public.sake.image_source IS 'retailer | user_scan | web_discover | admin';
COMMENT ON COLUMN public.sake.image_quality IS 't1 | t2 | t3 — upgrade rules replace lower with higher';
COMMENT ON COLUMN public.sake.image_verified_at IS 'Last vision/WineEngine verification timestamp';
COMMENT ON COLUMN public.sake.image_contributor_scan_id IS 'Optional scans.id when image_source=user_scan';

CREATE INDEX IF NOT EXISTS sake_image_quality_idx ON public.sake (image_quality);
CREATE INDEX IF NOT EXISTS sake_missing_image_hot_idx ON public.sake (id) WHERE image_url IS NULL;

-- Opt-in flag for sharing scan photos into the public catalog.
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS catalog_share_opt_in boolean DEFAULT false;

COMMENT ON COLUMN public.scans.catalog_share_opt_in IS
  'User opted in to share this scan photo for catalog image fill when sake.image_url is missing';
