-- Ensure the `sake-images` bucket exists and is public.
-- The app uses getPublicUrl() so images load in <img> without signed URLs.
-- Server-side uploads (service role) bypass storage RLS — no INSERT policy required for the API.

INSERT INTO storage.buckets (id, name, public)
VALUES ('sake-images', 'sake-images', true)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  name = EXCLUDED.name;
