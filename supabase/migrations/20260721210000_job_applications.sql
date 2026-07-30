-- Career applications with resume storage.
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_slug text NOT NULL,
  job_title text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  location text,
  portfolio_url text,
  cover_note text NOT NULL,
  prompt_answer text,
  resume_url text NOT NULL,
  resume_file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_applications_job_slug_idx ON public.job_applications (job_slug);
CREATE INDEX IF NOT EXISTS job_applications_created_at_idx ON public.job_applications (created_at DESC);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Public inserts go through service-role API only; no direct anon policies.
CREATE POLICY "Service role full access job_applications"
  ON public.job_applications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO storage.buckets (id, name, public)
VALUES ('career-resumes', 'career-resumes', false)
ON CONFLICT (id) DO NOTHING;
