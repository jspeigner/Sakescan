-- Cursor + diagnostics for automated backfill (service_role only via RLS).
create table if not exists public.backfill_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.backfill_run_log (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null,
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists backfill_run_log_job_created_idx
  on public.backfill_run_log (job, created_at desc);

create index if not exists backfill_run_log_created_at_idx
  on public.backfill_run_log (created_at desc);

alter table public.backfill_state enable row level security;
alter table public.backfill_run_log enable row level security;

revoke all on table public.backfill_state from anon;
revoke all on table public.backfill_state from authenticated;
revoke all on table public.backfill_run_log from anon;
revoke all on table public.backfill_run_log from authenticated;
