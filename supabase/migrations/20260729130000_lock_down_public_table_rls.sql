-- Critical: anon key could write/delete breweries, scans, and ratings, and read all user emails.
-- service_role bypasses RLS; these policies only gate anon/authenticated PostgREST access.

-- ---------------------------------------------------------------------------
-- breweries: public read OK; drop the misnamed FOR ALL USING (true) write grant
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access on breweries" ON public.breweries;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'breweries'
      AND policyname = 'Allow public read access on breweries'
  ) THEN
    CREATE POLICY "Allow public read access on breweries"
      ON public.breweries FOR SELECT
      USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- users: no anon access; own-row for authenticated; admin email for full manage
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "users_select_own_or_admin"
  ON public.users FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );

CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own_or_admin"
  ON public.users FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  )
  WITH CHECK (
    auth.uid() = id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );

CREATE POLICY "users_delete_admin"
  ON public.users FOR DELETE TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com');

REVOKE ALL ON TABLE public.users FROM anon;

-- ---------------------------------------------------------------------------
-- scans: owner-only (+ admin); cron/APIs use service_role
-- ---------------------------------------------------------------------------
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scans'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.scans', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "scans_select_own_or_admin"
  ON public.scans FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );

CREATE POLICY "scans_insert_own"
  ON public.scans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scans_update_own_or_admin"
  ON public.scans FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );

CREATE POLICY "scans_delete_own_or_admin"
  ON public.scans FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );

REVOKE ALL ON TABLE public.scans FROM anon;

-- ---------------------------------------------------------------------------
-- ratings: public read OK; writes only by owner (or admin)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ratings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ratings', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "ratings_select_public"
  ON public.ratings FOR SELECT
  USING (true);

CREATE POLICY "ratings_insert_own"
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ratings_update_own_or_admin"
  ON public.ratings FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );

CREATE POLICY "ratings_delete_own_or_admin"
  ON public.ratings FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR lower(coalesce(auth.jwt()->>'email', '')) = 'jspeigner@gmail.com'
  );
