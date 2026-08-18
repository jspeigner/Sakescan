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
    lower.includes('rate_limited')
  );
}

export function isTimeBudgetFailure(reason: string | null | undefined): boolean {
  return (reason ?? '').toLowerCase().includes('time_budget');
}

/** Failures caused by us/the platform, not by a missing bottle image. */
export function isTransientDiscoverFailure(reason: string | null | undefined): boolean {
  return isQuotaOutageFailure(reason) || isTimeBudgetFailure(reason);
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
  if (isTimeBudgetFailure(failureReason)) return BACKOFF_TIME_BUDGET_MS;
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
  if (isExhaustedReason(history.last_failure_reason)) return 'exhausted';
  if (!history.next_retry_at) return null;
  const retryAtMs = Date.parse(history.next_retry_at);
  if (Number.isNaN(retryAtMs) || retryAtMs <= nowMs) return null;
  return 'backoff';
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

export function shouldRunDiscoverFallback(params: {
  accelerated: boolean;
  trustedFirst: boolean;
  chunked: boolean;
}): boolean {
  // Cron / accelerated / trusted-first already spent a search. Do not double-bill.
  return !params.accelerated && !params.trustedFirst && !params.chunked;
}
