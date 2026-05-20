import type { SupabaseClient } from '@supabase/supabase-js';

export type BackfillRunStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export type DiscoverHealthState = {
  yields: number[];
  lowYieldStreak: number;
  lastAdaptedAt?: string;
};

export type SakuraImportState = {
  filterIndex: number;
  runsAtFilter: number;
};

export type WineEngineSyncState = {
  offset: number;
};

export async function getBackfillState<T>(
  supabase: SupabaseClient,
  key: string,
  fallback: T
): Promise<T> {
  const { data, error } = await supabase
    .from('backfill_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data?.value) return fallback;
  return { ...fallback, ...(data.value as T) };
}

export async function setBackfillState(
  supabase: SupabaseClient,
  key: string,
  value: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('backfill_state').upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (error) throw new Error(`backfill_state upsert ${key}: ${error.message}`);
}

export async function logBackfillRun(
  supabase: SupabaseClient,
  params: {
    job: string;
    status: BackfillRunStatus;
    stats?: Record<string, unknown>;
    errors?: string[];
  }
): Promise<void> {
  const { error } = await supabase.from('backfill_run_log').insert({
    job: params.job,
    status: params.status,
    stats: params.stats ?? {},
    errors: params.errors ?? [],
  });
  if (error) {
    console.warn(`[backfill] run log insert failed: ${error.message}`);
  }
}

export function recordDiscoverYield(
  prior: DiscoverHealthState,
  attempts: number,
  placed: number
): DiscoverHealthState {
  const yieldRatio = attempts > 0 ? placed / attempts : 0;
  const yields = [...prior.yields, yieldRatio].slice(-5);
  const lowYield = attempts >= 4 && yieldRatio < 0.1;
  const lowYieldStreak = lowYield ? prior.lowYieldStreak + 1 : 0;
  return { yields, lowYieldStreak };
}

export function shouldUseAdaptiveDiscover(health: DiscoverHealthState): boolean {
  return health.lowYieldStreak >= 5;
}
