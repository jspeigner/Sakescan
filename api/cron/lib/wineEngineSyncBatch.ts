/**
 * WineEngine collection sync batch — disabled (subscription not active).
 * Kept so any lingering imports compile; never calls TinEye.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WineEngineConfig } from './wineEngine.js';

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
  _supabase: SupabaseClient,
  _supabaseUrl: string,
  _options?: { batchSize?: number }
): Promise<WineEngineBatchResult> {
  return {
    offset: 0,
    processed: 0,
    added: 0,
    failed: 0,
    collectionCount: 0,
    hasMore: false,
    errors: ['WineEngine disabled — subscription not active'],
  };
}

export async function getWineEngineCollectionCount(_cfg?: WineEngineConfig | null): Promise<number> {
  return 0;
}
