-- Single product image for sake: merge label + bottle into image_url.
-- Run in the same window as deploying app + API code that uses `image_url` only.
-- Shipped mobile apps must be updated to read `image_url` (old columns are dropped).

ALTER TABLE sake ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN sake.image_url IS 'Primary product photo (label or bottle shot).';

UPDATE sake
SET image_url = COALESCE(
  NULLIF(trim(bottle_image_url), ''),
  NULLIF(trim(label_image_url), '')
);

ALTER TABLE sake DROP COLUMN IF EXISTS label_image_url;
ALTER TABLE sake DROP COLUMN IF EXISTS bottle_image_url;
