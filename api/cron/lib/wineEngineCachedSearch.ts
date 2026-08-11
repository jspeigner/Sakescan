/**
 * WineEngine search with SHA-256 cache: unpaid repeats + always log outcomes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashImageUrl } from './imageHash.js';
import {
  getWineEngineConfig,
  wineEngineSearchByUrl,
  type WineEngineConfig,
  type WineEngineMatch,
  type WineEngineResponse,
} from './wineEngine.js';
import { releaseWineEngineQuota, reserveWineEngineQuota } from './wineEngineQuota.js';
import {
  cachedSearchToWineEngineResponse,
  getCachedSearch,
  logWineEngineSearch,
  type WineEngineSearchSource,
} from './wineEngineSearchCache.js';

export type CachedSearchResult = {
  response: WineEngineResponse<WineEngineMatch[]>;
  querySha256: string;
  cacheHit: boolean;
  quotaSkipped?: boolean;
  reason?: string;
};

/**
 * Search WineEngine for imageUrl, using content-hash cache first.
 * Live searches reserve 1 search quota unit.
 */
export async function searchWineEngineCached(
  supabase: SupabaseClient,
  imageUrl: string,
  options: {
    source: WineEngineSearchSource;
    limit?: number;
    cfg?: WineEngineConfig | null;
    /** When false, skip live TinEye call if cache miss (still returns empty). */
    allowLive?: boolean;
  }
): Promise<CachedSearchResult> {
  const cfg = options.cfg === undefined ? getWineEngineConfig() : options.cfg;
  const { sha256 } = await hashImageUrl(imageUrl);

  const cached = await getCachedSearch(supabase, sha256);
  if (cached) {
    const response = cachedSearchToWineEngineResponse(cached);
    await logWineEngineSearch(supabase, {
      querySha256: sha256,
      queryImageUrl: imageUrl,
      source: options.source,
      response,
      cacheHit: true,
    });
    return { response, querySha256: sha256, cacheHit: true };
  }

  if (!cfg || options.allowLive === false) {
    return {
      response: {
        method: 'search',
        status: 'fail',
        error: [cfg ? 'cache_miss_live_disabled' : 'WineEngine not configured'],
        result: [],
      },
      querySha256: sha256,
      cacheHit: false,
      quotaSkipped: true,
      reason: cfg ? 'cache_miss_live_disabled' : 'not_configured',
    };
  }

  const reserved = await reserveWineEngineQuota(supabase, { searches: 1 });
  if (!reserved.ok) {
    return {
      response: {
        method: 'search',
        status: 'fail',
        error: [reserved.reason || 'wineengine_search_quota_exhausted'],
        result: [],
      },
      querySha256: sha256,
      cacheHit: false,
      quotaSkipped: true,
      reason: reserved.reason,
    };
  }

  try {
    const response = await wineEngineSearchByUrl(cfg, imageUrl, {
      limit: options.limit ?? 1,
    });

    if (response.status !== 'ok') {
      await releaseWineEngineQuota(supabase, { searches: 1 });
    }

    await logWineEngineSearch(supabase, {
      querySha256: sha256,
      queryImageUrl: imageUrl,
      source: options.source,
      response,
      cacheHit: false,
    });

    return { response, querySha256: sha256, cacheHit: false };
  } catch (e) {
    try {
      await releaseWineEngineQuota(supabase, { searches: 1 });
    } catch {
      /* best-effort */
    }
    throw e;
  }
}
