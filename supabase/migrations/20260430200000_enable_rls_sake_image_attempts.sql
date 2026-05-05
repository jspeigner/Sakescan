-- Attempt history is written only by server-side cron (service_role). PostgREST roles must not read/write it.
ALTER TABLE public.sake_image_attempts ENABLE ROW LEVEL SECURITY;

-- With RLS on and no policies for anon/authenticated, API access is denied for those roles.
-- Explicit revokes reduce accidental exposure if RLS were toggled off later.
REVOKE ALL ON TABLE public.sake_image_attempts FROM anon;
REVOKE ALL ON TABLE public.sake_image_attempts FROM authenticated;
