/**
 * Discover spend / retry policy: hunt missing images, park hopeless rows,
 * and avoid repeating searches that do not place photos.
 */

export const EXHAUSTED_REASON = 'exhausted';
export const NO_CANDIDATES_EXHAUST_AFTER = 3;
export const FAILED_DISCOVER_EXHAUST_AFTER = 5;

const HOUR = 60 * 60 * 1000;
export const BACKOFF_QUOTA_MS = 30 * 60 * 1000;
export const BACKOFF_TIME_BUDGET_MS = 45 * 60 * 1000;
export const BACKOFF_FIRST_MS = 6 * HOUR;
export const BACKOFF_SECOND_MS = 24 * HOUR;
export const BACKOFF_LATER_MS = 7 * 24 * HOUR;
export const EXHAUSTED_HOLD_MS = 90 * 24 * HOUR;

export const DISCOVER_ROW_CAP_DEFAULT = 12;
export const DISCOVER_ROW_CAP_LOW_YIELD = 6;
export const DISCOVER_ELIGIBLE_BUFFER_MULTIPLIER = 4;
export const DISCOVER_ELIGIBLE_BUFFER_MIN = 24;

/**
 * PostgREST silently truncates any page to `max-rows` (Supabase default 1000).
 * The missing-image pool must page in chunks no larger than that, otherwise a
 * truncated first page looks like the end of the pool and discover never
 * reaches the rows behind it.
 */
export const POSTGREST_MAX_ROWS = 1000;
export const DISCOVER_POOL_PAGE_SIZE = POSTGREST_MAX_ROWS;
/** Enough pages to walk the whole missing-image pool (~11k rows) when needed. */
export const DISCOVER_POOL_PAGE_LIMIT = 12;

export type DiscoverAttemptHistory = {
  attempt_count: number;
  success_count: number;
  next_retry_at: string | null;
  last_failure_reason?: string | null;
};

export function isMissingImageUrl(imageUrl: string | null | undefined): boolean {
  return !imageUrl || !imageUrl.trim();
}

export function isExhaustedReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return reason === EXHAUSTED_REASON || reason.startsWith(`${EXHAUSTED_REASON}:`);
}

export function isQuotaOutageFailure(reason: string | null | undefined): boolean {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return (
    lower.includes('openai_quota') ||
    lower.includes('openai vision http 429') ||
    (lower.includes('openai') && lower.includes('quota')) ||
    lower.includes('firecrawl_quota') ||
    lower.includes('firecrawl_error') ||
    lower.includes('rate_limited')
  );
}

export function isTimeBudgetFailure(reason: string | null | undefined): boolean {
  return (reason ?? '').toLowerCase().includes('time_budget');
}

/**
 * Accelerated discover stops after DISCOVER_VISION_MAX_PER_ROW_ACCELERATED
 * vision checks. That is our spend cap, not evidence the bottle has no image —
 * treat it like a time budget so we never 90-day park the row.
 */
export function isVisionCapFailure(reason: string | null | undefined): boolean {
  return (reason ?? '').toLowerCase().includes('vision_cap');
}

/** Failures caused by us/the platform, not by a missing bottle image. */
export function isTransientDiscoverFailure(reason: string | null | undefined): boolean {
  return (
    isQuotaOutageFailure(reason) ||
    isTimeBudgetFailure(reason) ||
    isVisionCapFailure(reason)
  );
}

/**
 * Firecrawl messages that mean the search stack failed — not "this bottle has
 * no images on the web". Empty-result strings like "No image search results"
 * must NOT match, or true no_candidates would never park.
 */
export function looksLikeFirecrawlInfrastructureError(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes('no image search results')) return false;
  return (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('limit exceeded') ||
    lower.includes('bypass active') ||
    lower.includes('insufficient credits') ||
    lower.includes('payment required') ||
    /(?:^|[^\d])(?:402|429|500|502|503|504)(?:[^\d]|$)/.test(lower) ||
    lower.includes('network:') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed')
  );
}

/**
 * Classify a discover attempt for `sake_image_attempts`.
 *
 * Critical: empty results during Firecrawl/OpenAI outages must not be recorded
 * as `no_candidates` — three of those park the row as exhausted for 90 days,
 * and `resetEnvironmentalBackoffOnStartup` only clears `firecrawl_quota` /
 * `openai_quota` patterns.
 */
export function resolveDiscoverAttemptFailure(params: {
  timedOutDuringRow: boolean;
  sawCandidates: boolean;
  failureReason: string;
  firecrawlErrors: string[];
  firecrawlBypassActive: boolean;
  openaiVisionQuotaExceeded: boolean;
}): string {
  if (params.timedOutDuringRow) return 'time_budget_reached';

  if (!params.sawCandidates) {
    if (params.firecrawlBypassActive) return 'firecrawl_quota';
    if (params.firecrawlErrors.some(looksLikeFirecrawlInfrastructureError)) {
      const joined = params.firecrawlErrors.join(' ').toLowerCase();
      if (
        joined.includes('quota') ||
        joined.includes('429') ||
        joined.includes('402') ||
        joined.includes('bypass') ||
        joined.includes('insufficient credits') ||
        joined.includes('payment required') ||
        joined.includes('rate limit')
      ) {
        return 'firecrawl_quota';
      }
      return 'firecrawl_error';
    }
    return 'no_candidates';
  }

  // Vision quota emptied the untrusted queue (TRUSTED_RETAILER_SOURCES is empty),
  // so the candidate loop never runs and failureReason stays the initial
  // 'no_candidates' — do not count that toward 90-day exhaust.
  if (
    params.openaiVisionQuotaExceeded &&
    (params.failureReason === 'no_candidates' ||
      params.failureReason === 'no_strong_candidates' ||
      params.failureReason === 'openai_quota_exceeded' ||
      !params.failureReason)
  ) {
    return 'openai_quota_exceeded';
  }

  return params.failureReason || 'discover_failed';
}

export function failedDiscoverCount(history: DiscoverAttemptHistory | undefined): number {
  if (!history) return 0;
  return Math.max(0, (history.attempt_count ?? 0) - (history.success_count ?? 0));
}

export function shouldExhaustDiscoverRow(
  nextFailedCount: number,
  failureReason: string
): boolean {
  if (isTransientDiscoverFailure(failureReason) || isExhaustedReason(failureReason)) {
    return false;
  }
  if (failureReason === 'no_candidates' || failureReason === 'no_strong_candidates') {
    return nextFailedCount >= NO_CANDIDATES_EXHAUST_AFTER;
  }
  return nextFailedCount >= FAILED_DISCOVER_EXHAUST_AFTER;
}

export function backoffMsForDiscoverFailure(
  nextFailedCount: number,
  failureReason: string
): number {
  if (isQuotaOutageFailure(failureReason)) return BACKOFF_QUOTA_MS;
  if (isTimeBudgetFailure(failureReason) || isVisionCapFailure(failureReason)) {
    return BACKOFF_TIME_BUDGET_MS;
  }
  if (shouldExhaustDiscoverRow(nextFailedCount, failureReason)) return EXHAUSTED_HOLD_MS;
  if (nextFailedCount <= 1) return BACKOFF_FIRST_MS;
  if (nextFailedCount === 2) return BACKOFF_SECOND_MS;
  return BACKOFF_LATER_MS;
}

export function computeDiscoverRetry(params: {
  prior?: DiscoverAttemptHistory;
  placed: boolean;
  failureReason: string;
  nowMs?: number;
}): {
  nextRetryAt: string | null;
  exhausted: boolean;
  reason: string | null;
  nextFailedCount: number;
} {
  if (params.placed) {
    return { nextRetryAt: null, exhausted: false, reason: null, nextFailedCount: 0 };
  }
  const nowMs = params.nowMs ?? Date.now();
  const nextFailedCount = failedDiscoverCount(params.prior) + 1;
  const exhausted = shouldExhaustDiscoverRow(nextFailedCount, params.failureReason);
  const reason = exhausted ? `${EXHAUSTED_REASON}:${params.failureReason}` : params.failureReason;
  const waitMs = backoffMsForDiscoverFailure(nextFailedCount, params.failureReason);
  return {
    nextRetryAt: new Date(nowMs + waitMs).toISOString(),
    exhausted,
    reason,
    nextFailedCount,
  };
}

export function discoverSkipReason(
  history: DiscoverAttemptHistory | undefined,
  nowMs = Date.now()
): 'exhausted' | 'backoff' | null {
  if (!history) return null;
  if (history.next_retry_at) {
    const retryAtMs = Date.parse(history.next_retry_at);
    // Hold / backoff window still active.
    if (!Number.isNaN(retryAtMs) && retryAtMs > nowMs) {
      return isExhaustedReason(history.last_failure_reason) ? 'exhausted' : 'backoff';
    }
    // next_retry_at reached — eligible again (including after exhausted:* 90-day hold).
    return null;
  }
  // No retry timestamp: permanent park only when already marked exhausted.
  if (isExhaustedReason(history.last_failure_reason)) return 'exhausted';
  return null;
}

export function prioritizeDiscoverRows<T extends { id: string }>(
  rows: T[],
  historyById: Map<string, DiscoverAttemptHistory>,
  hotIds: Set<string>
): T[] {
  const neverTriedHot: T[] = [];
  const neverTriedRest: T[] = [];
  const retryHot: T[] = [];
  const retryRest: T[] = [];

  for (const row of rows) {
    const history = historyById.get(row.id);
    const neverTried = !history || (history.attempt_count ?? 0) === 0;
    const hot = hotIds.has(row.id);
    if (neverTried && hot) neverTriedHot.push(row);
    else if (neverTried) neverTriedRest.push(row);
    else if (hot) retryHot.push(row);
    else retryRest.push(row);
  }

  return [...neverTriedHot, ...neverTriedRest, ...retryHot, ...retryRest];
}

export function lastDiscoverYield(yields: number[] | undefined): number | null {
  if (!yields?.length) return null;
  const last = yields[yields.length - 1];
  return typeof last === 'number' && Number.isFinite(last) ? last : null;
}

export function discoverRowCapForRun(
  requested: number,
  yields?: number[]
): number {
  const lastYield = lastDiscoverYield(yields);
  const cap = lastYield === 0 ? DISCOVER_ROW_CAP_LOW_YIELD : DISCOVER_ROW_CAP_DEFAULT;
  return Math.max(1, Math.min(requested, cap));
}

export function discoverEligibleBufferTarget(rowCap: number): number {
  const normalizedCap = Math.max(1, Math.floor(rowCap));
  return Math.max(DISCOVER_ELIGIBLE_BUFFER_MIN, normalizedCap * DISCOVER_ELIGIBLE_BUFFER_MULTIPLIER);
}

export function shouldScanNextDiscoverPoolPage(params: {
  pagesScanned: number;
  maxPages: number;
  eligibleRows: number;
  rowCap: number;
  lastPageRows: number;
  pageSize: number;
}): boolean {
  if (params.pagesScanned >= params.maxPages) return false;
  if (params.lastPageRows < params.pageSize) return false;
  return params.eligibleRows < discoverEligibleBufferTarget(params.rowCap);
}

export function shouldRunDiscoverFallback(params: {
  accelerated: boolean;
  trustedFirst: boolean;
  chunked: boolean;
}): boolean {
  // Cron / accelerated / trusted-first already spent a search. Do not double-bill.
  return !params.accelerated && !params.trustedFirst && !params.chunked;
}
