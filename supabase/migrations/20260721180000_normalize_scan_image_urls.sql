-- Reject/normalize non-http scan image URLs so catalog promote can fetch them.
-- Local file:// paths from iOS are not reachable by OpenAI or Storage mirroring.

-- Clear existing unusable local paths (cannot be recovered server-side).
UPDATE public.scans
SET scanned_image_url = NULL
WHERE scanned_image_url IS NOT NULL
  AND scanned_image_url !~* '^https?://';

CREATE OR REPLACE FUNCTION public.normalize_scan_image_url()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scanned_image_url IS NOT NULL
     AND btrim(NEW.scanned_image_url) <> ''
     AND NEW.scanned_image_url !~* '^https?://' THEN
    -- Drop unusable local/device paths; clients must upload via /api/upload-scan-image.
    NEW.scanned_image_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scans_normalize_image_url ON public.scans;
CREATE TRIGGER scans_normalize_image_url
  BEFORE INSERT OR UPDATE OF scanned_image_url ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_scan_image_url();

COMMENT ON FUNCTION public.normalize_scan_image_url() IS
  'Nulls non-http(s) scanned_image_url values (e.g. file://) so only Storage URLs are persisted';
