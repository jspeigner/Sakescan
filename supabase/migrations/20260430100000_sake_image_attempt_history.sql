create table if not exists public.sake_image_attempts (
  sake_id uuid primary key references public.sake(id) on delete cascade,
  attempt_count integer not null default 0,
  success_count integer not null default 0,
  last_attempt_at timestamptz null,
  last_success_at timestamptz null,
  last_failure_reason text null,
  next_retry_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sake_image_attempts_next_retry_idx
  on public.sake_image_attempts (next_retry_at);

create index if not exists sake_image_attempts_updated_at_idx
  on public.sake_image_attempts (updated_at desc);
