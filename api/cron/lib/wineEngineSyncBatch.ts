/**
 * WineEngine collection sync batch — capped by Starter plan image quota.
 */

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
import {
  getWineEngineQuota,
  releaseWineEngineQuota,
  reserveWineEngineQuota,
  syncBatchImageBudget,
  type WineEngineQuotaSnapshot,
} from './wineEngineQuota.js';
import { markWineEngineIndexed } from './wineEngineSearchCache.js';

const WINEENGINE_STATE_KEY = 'wineengine_sync';

export type WineEngineBatchResult = {
  offset: number;
  processed: number;
  added: number;
  failed: number;
  skippedQuota: number;
  collectionCount: number;
  hasMore: boolean;
  quota?: WineEngineQuotaSnapshot;
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
      skippedQuota: 0,
      collectionCount: 0,
      hasMore: false,
      errors: ['WineEngine not configured'],
    };
  }

  const quota = await getWineEngineQuota(supabase);
  const batchSize = syncBatchImageBudget(quota, options?.batchSize);
  if (batchSize <= 0) {
    return {
      offset: 0,
      processed: 0,
      added: 0,
      failed: 0,
      skippedQuota: 0,
      collectionCount: 0,
      hasMore: true,
      quota,
      errors: ['WineEngine image quota exhausted for today/month — sync paused'],
    };
  }

  const state = await getBackfillState<WineEngineSyncState>(supabase, WINEENGINE_STATE_KEY, {
    offset: 0,
  });
  const offset = state.offset;

  // Prefer rows not yet marked indexed on TinEye.
  const query = supabase
    .from('sake')
    .select('id, name, image_url, image_quality, wineengine_indexed_at')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .ilike('image_url', '%supabase.co%')
    .is('wineengine_indexed_at', null)
    .order('updated_at', { ascending: true });

  const { data: initialRows, error } = await query.range(offset, offset + batchSize - 1);
  if (error) throw new Error(error.message);
  let rows = initialRows;

  // If cursor passed the unindexed set, wrap once and retry from start.
  if ((rows || []).length === 0 && offset > 0) {
    await setBackfillState(supabase, WINEENGINE_STATE_KEY, { offset: 0 });
    const retry = await query.range(0, batchSize - 1);
    if (retry.error) throw new Error(retry.error.message);
    rows = retry.data;
  }

  let added = 0;
  let failed = 0;
  let skippedQuota = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    if (!row.image_url) continue;

    const reserved = await reserveWineEngineQuota(supabase, { images: 1 });
    if (!reserved.ok) {
      skippedQuota++;
      if (errors.length < 6) errors.push(reserved.reason || 'image quota exhausted');
      break;
    }

    let addSucceeded = false;
    try {
      const result = await wineEngineAddByUrl(cfg, { sakeId: row.id, imageUrl: row.image_url });
      if (result.status === 'ok') {
        added++;
        addSucceeded = true;
        await markWineEngineIndexed(supabase, row.id);
      } else {
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

    if (!addSucceeded) {
      const released = await releaseWineEngineQuota(supabase, { images: 1 });
      if (!released.ok && errors.length < 6) {
        errors.push(`${row.name}: ${released.reason || 'wineengine_quota_release_failed'}`);
      }
    }
  }

  const processed = (rows || []).length;
  const hasMore = processed === batchSize && skippedQuota === 0;
  // Advance past processed rows; do not wrap to 0 on a successful last page (re-adds burn image quota).
  const nextOffset =
    skippedQuota > 0 ? offset + added + failed : offset + processed;

  await setBackfillState(supabase, WINEENGINE_STATE_KEY, { offset: nextOffset });

  let collectionCount = 0;
  try {
    collectionCount = await wineEngineCount(cfg);
  } catch {
    collectionCount = 0;
  }

  const finalQuota = await getWineEngineQuota(supabase);

  return {
    offset,
    processed,
    added,
    failed,
    skippedQuota,
    collectionCount,
    hasMore,
    quota: finalQuota,
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
