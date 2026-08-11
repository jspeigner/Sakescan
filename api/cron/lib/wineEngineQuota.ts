/**
 * WineEngine Starter plan quotas (stay under billed overage):
 * - Images (add): 5,000 / month
 * - Searches: 1,000 / month
 *
 * Soft caps leave a small buffer. Daily / per-run budgets spread usage across the month.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBackfillState, setBackfillState } from './backfillState.js';

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
export const WINEENGINE_IDENTIFY_SEARCH_RESERVE = 100;

const QUOTA_STATE_KEY = 'wineengine_quota';

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
  const snapshot = await getWineEngineQuota(supabase);

  if (images > snapshot.remainingImagesToday) {
    return { ok: false, snapshot, reason: 'wineengine_image_quota_exhausted' };
  }
  if (searches > snapshot.remainingSearchesToday) {
    return { ok: false, snapshot, reason: 'wineengine_search_quota_exhausted' };
  }
  if (images === 0 && searches === 0) {
    return { ok: true, snapshot };
  }

  const next: WineEngineQuotaState = {
    ...snapshot.state,
    images: snapshot.state.images + images,
    searches: snapshot.state.searches + searches,
    imagesToday: snapshot.state.imagesToday + images,
    searchesToday: snapshot.state.searchesToday + searches,
    updatedAt: new Date().toISOString(),
  };
  await setBackfillState(supabase, QUOTA_STATE_KEY, next);
  return { ok: true, snapshot: toSnapshot(next) };
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
 * Identify endpoint may use searches only while keeping a reserve for cron.
 * Returns 0 when at/under the reserve floor.
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
