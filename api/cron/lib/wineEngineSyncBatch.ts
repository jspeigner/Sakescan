import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getBackfillState,
  setBackfillState,
  type WineEngineSyncState,
} from './backfillState.js';
import {
  getWineEngineConfig,
  wineEngineAddByUrl,
  wineEngineCount,
  type WineEngineConfig,
} from './wineEngine.js';

const WINEENGINE_STATE_KEY = 'wineengine_sync';

export type WineEngineBatchResult = {
  offset: number;
  processed: number;
  added: number;
  failed: number;
  collectionCount: number;
  hasMore: boolean;
  errors: string[];
};

export async function runWineEngineSyncBatch(
  supabase: SupabaseClient,
  _supabaseUrl: string,
  options?: { batchSize?: number }
): Promise<WineEngineBatchResult> {
  const cfg = getWineEngineConfig();
  if (!cfg) {
    return {
      offset: 0,
      processed: 0,
      added: 0,
      failed: 0,
      collectionCount: 0,
      hasMore: false,
      errors: ['WineEngine not configured'],
    };
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 35, 5), 60);
  const state = await getBackfillState<WineEngineSyncState>(supabase, WINEENGINE_STATE_KEY, {
    offset: 0,
  });
  const offset = state.offset;

  // Hosted catalog images in Supabase Storage (do not AND a second host filter —
  // mismatched VITE_SUPABASE_URL previously yielded empty sync batches).
  const query = supabase
    .from('sake')
    .select('id, name, image_url, image_quality')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .ilike('image_url', '%supabase.co%')
    .order('updated_at', { ascending: true });

  const { data: rows, error } = await query.range(offset, offset + batchSize - 1);
  if (error) throw new Error(error.message);

  let added = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    if (!row.image_url) continue;
    try {
      const result = await wineEngineAddByUrl(cfg, { sakeId: row.id, imageUrl: row.image_url });
      if (result.status === 'ok') added++;
      else {
        failed++;
        if (errors.length < 6) {
          errors.push(`${row.name}: ${(result.error || []).join('; ').slice(0, 100)}`);
        }
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errors.length < 6) errors.push(`${row.name}: ${msg.slice(0, 100)}`);
    }
  }

  const processed = (rows || []).length;
  const hasMore = processed === batchSize;
  const nextOffset = hasMore ? offset + batchSize : 0;

  await setBackfillState(supabase, WINEENGINE_STATE_KEY, { offset: nextOffset });

  let collectionCount = 0;
  try {
    collectionCount = await wineEngineCount(cfg);
  } catch {
    collectionCount = 0;
  }

  return {
    offset,
    processed,
    added,
    failed,
    collectionCount,
    hasMore,
    errors,
  };
}

export async function getWineEngineCollectionCount(cfg?: WineEngineConfig | null): Promise<number> {
  const resolved = cfg ?? getWineEngineConfig();
  if (!resolved) return 0;
  try {
    return await wineEngineCount(resolved);
  } catch {
    return 0;
  }
}
