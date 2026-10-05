import type { SupabaseClient } from '@supabase/supabase-js';
import type { WineEngineMatch, WineEngineResponse } from './wineEngine.js';

export type WineEngineSearchSource = 'identify' | 'discover' | 'promote' | 'admin';

export type CachedWineEngineSearch = {
  querySha256: string;
  status: string;
  topSakeId: string | null;
  topScore: number | null;
  topScoreText: number | null;
  matchCount: number;
  matches: WineEngineMatch[];
  cacheHit: true;
};

type TrimmedMatch = {
  filepath?: string;
  score?: number;
  score_text?: number;
  match_percent?: number;
  metadata?: { image_id?: string };
};

function trimMatches(matches: WineEngineMatch[], limit = 5): TrimmedMatch[] {
  return (matches || []).slice(0, limit).map((m) => ({
    filepath: m.filepath,
    score: m.score,
    score_text: m.score_text,
    match_percent: m.match_percent,
    metadata: m.metadata?.image_id ? { image_id: m.metadata.image_id } : undefined,
  }));
}

function toResponse(cached: CachedWineEngineSearch): WineEngineResponse<WineEngineMatch[]> {
  return {
    method: 'search',
    status: cached.status === 'ok' ? 'ok' : cached.status,
    error: [],
    result: cached.matches,
  };
}

/**
 * Pure helper: only successful live searches *with at least one match* are reusable.
 * - `fail` / errors must not poison the cache (transient TinEye outages).
 * - `ok` with zero matches must not poison either — the WineEngine collection grows
 *   via sync, so an early empty search would otherwise permanently false-negative
 *   identify for that image hash.
 */
export function isReusableWineEngineCacheRow(row: {
  status?: string | null;
  match_count?: number | null;
  raw_result?: unknown;
}): boolean {
  if (row.status !== 'ok') return false;
  const matches = Array.isArray(row.raw_result) ? row.raw_result : [];
  const count =
    typeof row.match_count === 'number' && Number.isFinite(row.match_count)
      ? row.match_count
      : matches.length;
  return count > 0 || matches.length > 0;
}

/**
 * Latest reusable live search for this image hash (unpaid cache).
 * Skips failures and empty-ok rows so identify can retry as the collection grows.
 */
export async function getCachedSearch(
  supabase: SupabaseClient,
  querySha256: string
): Promise<CachedWineEngineSearch | null> {
  // Prefer a DB-side filter so empty-ok / fail rows do not hide older useful hits.
  const { data, error } = await supabase
    .from('wineengine_search_log')
    .select(
      'query_sha256, status, top_sake_id, top_score, top_score_text, match_count, raw_result, created_at'
    )
    .eq('query_sha256', querySha256)
    .eq('cache_hit', false)
    .eq('status', 'ok')
    .gt('match_count', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  if (!isReusableWineEngineCacheRow(data)) return null;

  const matches = Array.isArray(data.raw_result) ? (data.raw_result as WineEngineMatch[]) : [];
  return {
    querySha256: data.query_sha256,
    status: 'ok',
    topSakeId: data.top_sake_id ?? null,
    topScore: data.top_score ?? null,
    topScoreText: data.top_score_text ?? null,
    matchCount: data.match_count ?? matches.length,
    matches,
    cacheHit: true,
  };
}

export function cachedSearchToWineEngineResponse(
  cached: CachedWineEngineSearch
): WineEngineResponse<WineEngineMatch[]> {
  return toResponse(cached);
}

export async function logWineEngineSearch(
  supabase: SupabaseClient,
  params: {
    querySha256: string;
    queryImageUrl?: string | null;
    source: WineEngineSearchSource;
    response: WineEngineResponse<WineEngineMatch[]>;
    cacheHit?: boolean;
  }
): Promise<void> {
  const matches = params.response.result || [];
  const top = matches[0];
  const topSakeId =
    typeof top?.metadata?.image_id === 'string' && top.metadata.image_id.length > 0
      ? top.metadata.image_id
      : null;

  const { error } = await supabase.from('wineengine_search_log').insert({
    query_sha256: params.querySha256,
    query_image_url: params.queryImageUrl ?? null,
    source: params.source,
    status: params.response.status || 'fail',
    top_sake_id: topSakeId,
    top_score: typeof top?.score === 'number' ? top.score : null,
    top_score_text: typeof top?.score_text === 'number' ? top.score_text : null,
    match_count: matches.length,
    raw_result: trimMatches(matches),
    cache_hit: Boolean(params.cacheHit),
  });

  if (error) {
    console.warn('[wineEngineSearchCache] log insert failed:', error.message);
  }
}

/** Mark sake as indexed in TinEye after a successful add. */
export async function markWineEngineIndexed(
  supabase: SupabaseClient,
  sakeId: string
): Promise<void> {
  const { error } = await supabase
    .from('sake')
    .update({ wineengine_indexed_at: new Date().toISOString() })
    .eq('id', sakeId);
  if (error) {
    console.warn('[wineEngineSearchCache] indexed_at update failed:', error.message);
  }
}

export async function getWineEngineCacheStats(
  supabase: SupabaseClient,
  hours = 24
): Promise<{ liveSearches: number; cacheHits: number; hitRate: number }> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('wineengine_search_log')
    .select('cache_hit')
    .gte('created_at', since)
    .limit(5000);

  if (error || !data) {
    return { liveSearches: 0, cacheHits: 0, hitRate: 0 };
  }
  let liveSearches = 0;
  let cacheHits = 0;
  for (const row of data) {
    if (row.cache_hit) cacheHits++;
    else liveSearches++;
  }
  const total = liveSearches + cacheHits;
  return {
    liveSearches,
    cacheHits,
    hitRate: total > 0 ? cacheHits / total : 0,
  };
}
