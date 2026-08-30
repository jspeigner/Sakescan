/**
 * WineEngine Starter plan quotas (stay under billed overage):
 * - Images (add): 5,000 / month
 * - Searches: 1,000 / month
 *
 * Soft caps leave a small buffer. Daily / per-run budgets spread usage across the month.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBackfillState } from './backfillState.js';

export const WINEENGINE_MONTHLY_IMAGE_LIMIT = 5000;
export const WINEENGINE_MONTHLY_SEARCH_LIMIT = 1000;

/** Stay under plan overage ($0.01 each). */
export const WINEENGINE_IMAGE_SOFT_CAP = 4800;
export const WINEENGINE_SEARCH_SOFT_CAP = 900;

/** Spread usage: ~160 images/day, ~30 searches/day. */
export const WINEENGINE_DAILY_IMAGE_CAP = 160;
export const WINEENGINE_DAILY_SEARCH_CAP = 30;

/** Per cron/admin batch ceilings (further limited by remaining daily/monthly). */
export const WINEENGINE_SYNC_BATCH_MAX = 8;
export const WINEENGINE_DISCOVER_SEARCH_MAX = 2;
export const WINEENGINE_PROMOTE_SEARCH_MAX = 0; // searches are scarce; promote uses vision
/**
 * Monthly soft-cap reserve held back from identify for cron search consumers.
 * After #44, discover no longer spends WineEngine searches (promote max is 0),
 * so a non-zero reserve only causes false identify 429s while quota sits idle.
 */
export const WINEENGINE_IDENTIFY_SEARCH_RESERVE = 0;

const QUOTA_STATE_KEY = 'wineengine_quota';
const QUOTA_CAS_ATTEMPTS = 8;

export type WineEngineQuotaState = {
  period: string; // YYYY-MM (UTC)
  day: string; // YYYY-MM-DD (UTC)
  images: number;
  searches: number;
  imagesToday: number;
  searchesToday: number;
  updatedAt?: string;
};

export type WineEngineQuotaSnapshot = {
  state: WineEngineQuotaState;
  remainingImages: number;
  remainingSearches: number;
  remainingImagesToday: number;
  remainingSearchesToday: number;
  imagesExhausted: boolean;
  searchesExhausted: boolean;
};

function utcPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function emptyState(now = new Date()): WineEngineQuotaState {
  return {
    period: utcPeriod(now),
    day: utcDay(now),
    images: 0,
    searches: 0,
    imagesToday: 0,
    searchesToday: 0,
  };
}

function normalizeState(raw: WineEngineQuotaState, now = new Date()): WineEngineQuotaState {
  const period = utcPeriod(now);
  const day = utcDay(now);
  const samePeriod = raw.period === period;
  const sameDay = raw.day === day;
  return {
    period,
    day,
    images: samePeriod ? raw.images || 0 : 0,
    searches: samePeriod ? raw.searches || 0 : 0,
    imagesToday: samePeriod && sameDay ? raw.imagesToday || 0 : 0,
    searchesToday: samePeriod && sameDay ? raw.searchesToday || 0 : 0,
    updatedAt: raw.updatedAt,
  };
}

function toSnapshot(state: WineEngineQuotaState): WineEngineQuotaSnapshot {
  const remainingImages = Math.max(0, WINEENGINE_IMAGE_SOFT_CAP - state.images);
  const remainingSearches = Math.max(0, WINEENGINE_SEARCH_SOFT_CAP - state.searches);
  const remainingImagesToday = Math.max(
    0,
    Math.min(WINEENGINE_DAILY_IMAGE_CAP - state.imagesToday, remainingImages)
  );
  const remainingSearchesToday = Math.max(
    0,
    Math.min(WINEENGINE_DAILY_SEARCH_CAP - state.searchesToday, remainingSearches)
  );
  return {
    state,
    remainingImages,
    remainingSearches,
    remainingImagesToday,
    remainingSearchesToday,
    imagesExhausted: remainingImagesToday <= 0,
    searchesExhausted: remainingSearchesToday <= 0,
  };
}

async function readQuotaRow(
  supabase: SupabaseClient
): Promise<{ state: WineEngineQuotaState; rowUpdatedAt: string | null }> {
  const { data, error } = await supabase
    .from('backfill_state')
    .select('value, updated_at')
    .eq('key', QUOTA_STATE_KEY)
    .maybeSingle();
  if (error) throw new Error(`wineengine_quota read: ${error.message}`);
  if (!data?.value) {
    return { state: emptyState(), rowUpdatedAt: null };
  }
  return {
    state: normalizeState(data.value as WineEngineQuotaState),
    rowUpdatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
  };
}

/** Compare-and-swap write; returns false when another writer won the race. */
async function casWriteQuota(
  supabase: SupabaseClient,
  next: WineEngineQuotaState,
  expectedRowUpdatedAt: string | null
): Promise<boolean> {
  const updatedAt = next.updatedAt || new Date().toISOString();
  const payload = {
    key: QUOTA_STATE_KEY,
    value: next,
    updated_at: updatedAt,
  };

  if (expectedRowUpdatedAt == null) {
    const { error } = await supabase.from('backfill_state').insert(payload);
    if (!error) return true;
    // Unique violation — row appeared concurrently.
    if ((error as { code?: string }).code === '23505') return false;
    throw new Error(`wineengine_quota insert: ${error.message}`);
  }

  const { data, error } = await supabase
    .from('backfill_state')
    .update({ value: next, updated_at: updatedAt })
    .eq('key', QUOTA_STATE_KEY)
    .eq('updated_at', expectedRowUpdatedAt)
    .select('key');
  if (error) throw new Error(`wineengine_quota cas: ${error.message}`);
  return Boolean(data && data.length > 0);
}

export async function getWineEngineQuota(supabase: SupabaseClient): Promise<WineEngineQuotaSnapshot> {
  const raw = await getBackfillState<WineEngineQuotaState>(supabase, QUOTA_STATE_KEY, emptyState());
  return toSnapshot(normalizeState(raw));
}

export async function reserveWineEngineQuota(
  supabase: SupabaseClient,
  usage: { images?: number; searches?: number }
): Promise<{ ok: boolean; snapshot: WineEngineQuotaSnapshot; reason?: string }> {
  const images = Math.max(0, usage.images ?? 0);
  const searches = Math.max(0, usage.searches ?? 0);

  if (images === 0 && searches === 0) {
    return { ok: true, snapshot: await getWineEngineQuota(supabase) };
  }

  for (let attempt = 0; attempt < QUOTA_CAS_ATTEMPTS; attempt++) {
    const { state, rowUpdatedAt } = await readQuotaRow(supabase);
    const snapshot = toSnapshot(state);

    if (images > snapshot.remainingImagesToday) {
      return { ok: false, snapshot, reason: 'wineengine_image_quota_exhausted' };
    }
    if (searches > snapshot.remainingSearchesToday) {
      return { ok: false, snapshot, reason: 'wineengine_search_quota_exhausted' };
    }

    const next: WineEngineQuotaState = {
      ...state,
      images: state.images + images,
      searches: state.searches + searches,
      imagesToday: state.imagesToday + images,
      searchesToday: state.searchesToday + searches,
      updatedAt: new Date().toISOString(),
    };

    const wrote = await casWriteQuota(supabase, next, rowUpdatedAt);
    if (wrote) {
      return { ok: true, snapshot: toSnapshot(next) };
    }
  }

  const snapshot = await getWineEngineQuota(supabase);
  return { ok: false, snapshot, reason: 'wineengine_quota_contention' };
}

/** Roll back a prior reservation when the TinEye call did not succeed. */
export async function releaseWineEngineQuota(
  supabase: SupabaseClient,
  usage: { images?: number; searches?: number }
): Promise<{ ok: boolean; snapshot: WineEngineQuotaSnapshot; reason?: string }> {
  const images = Math.max(0, usage.images ?? 0);
  const searches = Math.max(0, usage.searches ?? 0);
  if (images === 0 && searches === 0) {
    return { ok: true, snapshot: await getWineEngineQuota(supabase) };
  }

  for (let attempt = 0; attempt < QUOTA_CAS_ATTEMPTS; attempt++) {
    const { state, rowUpdatedAt } = await readQuotaRow(supabase);
    const next: WineEngineQuotaState = {
      ...state,
      images: Math.max(0, state.images - images),
      searches: Math.max(0, state.searches - searches),
      imagesToday: Math.max(0, state.imagesToday - images),
      searchesToday: Math.max(0, state.searchesToday - searches),
      updatedAt: new Date().toISOString(),
    };
    const wrote = await casWriteQuota(supabase, next, rowUpdatedAt);
    if (wrote) return { ok: true, snapshot: toSnapshot(next) };
  }

  const snapshot = await getWineEngineQuota(supabase);
  return { ok: false, snapshot, reason: 'wineengine_quota_contention' };
}

/** How many image adds a sync batch may attempt this run. */
export function syncBatchImageBudget(snapshot: WineEngineQuotaSnapshot, requested?: number): number {
  const want = Math.min(Math.max(requested ?? WINEENGINE_SYNC_BATCH_MAX, 0), WINEENGINE_SYNC_BATCH_MAX);
  return Math.min(want, snapshot.remainingImagesToday);
}

/** How many discover searches this process-images run may use. */
export function discoverSearchBudget(snapshot: WineEngineQuotaSnapshot): number {
  return Math.min(WINEENGINE_DISCOVER_SEARCH_MAX, snapshot.remainingSearchesToday);
}

/**
 * Identify may use one live search when monthly + daily remaining allow it.
 * Reserve stays zero until a cron path actually consumes search quota again.
 */
export function identifySearchBudget(snapshot: WineEngineQuotaSnapshot): number {
  const aboveReserve = Math.max(0, snapshot.remainingSearches - WINEENGINE_IDENTIFY_SEARCH_RESERVE);
  return Math.min(1, aboveReserve, snapshot.remainingSearchesToday);
}

export function promoteSearchBudget(snapshot: WineEngineQuotaSnapshot): number {
  const envMax = process.env.WINEENGINE_PROMOTE_SEARCH_MAX?.trim();
  const configured = envMax != null && envMax !== '' ? parseInt(envMax, 10) : WINEENGINE_PROMOTE_SEARCH_MAX;
  const max = Number.isFinite(configured) ? Math.max(0, configured) : WINEENGINE_PROMOTE_SEARCH_MAX;
  return Math.min(max, snapshot.remainingSearchesToday);
}
