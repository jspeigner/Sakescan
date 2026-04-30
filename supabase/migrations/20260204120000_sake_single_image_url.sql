-- Single product image for sake: merge label + bottle into image_url.
-- Idempotent: skips legacy merge when bottle_image_url / label_image_url are already gone.

ALTER TABLE sake ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN sake.image_url IS 'Primary product photo (label or bottle shot).';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sake' AND column_name = 'bottle_image_url'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sake' AND column_name = 'label_image_url'
  ) THEN
    EXECUTE $u$
      UPDATE sake
      SET image_url = COALESCE(
        NULLIF(trim(bottle_image_url), ''),
        NULLIF(trim(label_image_url), '')
      )
    $u$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sake' AND column_name = 'bottle_image_url'
  ) THEN
    EXECUTE $u$
      UPDATE sake SET image_url = COALESCE(NULLIF(trim(bottle_image_url), ''), image_url)
    $u$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sake' AND column_name = 'label_image_url'
  ) THEN
    EXECUTE $u$
      UPDATE sake SET image_url = COALESCE(NULLIF(trim(label_image_url), ''), image_url)
    $u$;
  END IF;
END $$;

ALTER TABLE sake DROP COLUMN IF EXISTS label_image_url;
ALTER TABLE sake DROP COLUMN IF EXISTS bottle_image_url;
