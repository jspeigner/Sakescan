-- Applicants state their own expected pay (no posted salary bands on careers pages).
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS expected_pay text;

COMMENT ON COLUMN public.job_applications.expected_pay IS
  'Applicant-stated expected monthly compensation (USD), free text';
