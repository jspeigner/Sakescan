import { describe, expect, test } from 'bun:test';
import {
  BACKOFF_FIRST_MS,
  BACKOFF_LATER_MS,
  BACKOFF_QUOTA_MS,
  BACKOFF_SECOND_MS,
  BACKOFF_TIME_BUDGET_MS,
  DISCOVER_POOL_PAGE_LIMIT,
  DISCOVER_POOL_PAGE_SIZE,
  DISCOVER_ROW_CAP_DEFAULT,
  DISCOVER_ROW_CAP_LOW_YIELD,
  EXHAUSTED_HOLD_MS,
  POSTGREST_MAX_ROWS,
  computeDiscoverRetry,
  discoverEligibleBufferTarget,
  discoverRowCapForRun,
  discoverSkipReason,
  exhaustedHoldReleasePayload,
  isMissingImageUrl,
  prioritizeDiscoverRows,
  resolveDiscoverAttemptFailure,
  looksLikeFirecrawlInfrastructureError,
  shouldExhaustDiscoverRow,
  shouldScanNextDiscoverPoolPage,
  shouldRunDiscoverFallback,
} from './discoverPolicy.ts';

describe('isMissingImageUrl', () => {
  test('treats null/empty as missing and keeps real urls', () => {
    expect(isMissingImageUrl(null)).toBe(true);
    expect(isMissingImageUrl('')).toBe(true);
    expect(isMissingImageUrl('  ')).toBe(true);
    expect(isMissingImageUrl('https://cdn.example.com/sake.jpg')).toBe(false);
  });
});

describe('discover retry / exhaust', () => {
  test('parks after 3 no-candidate failures', () => {
    expect(shouldExhaustDiscoverRow(2, 'no_candidates')).toBe(false);
    expect(shouldExhaustDiscoverRow(3, 'no_candidates')).toBe(true);
    expect(shouldExhaustDiscoverRow(3, 'no_strong_candidates')).toBe(true);
  });

  test('parks after 5 mixed failures but not for quota, timeout, or vision cap', () => {
    expect(shouldExhaustDiscoverRow(5, 'vision_rejected')).toBe(true);
    expect(shouldExhaustDiscoverRow(4, 'vision_rejected')).toBe(false);
    expect(shouldExhaustDiscoverRow(8, 'openai_quota_exceeded')).toBe(false);
    expect(shouldExhaustDiscoverRow(8, 'firecrawl_quota')).toBe(false);
    expect(shouldExhaustDiscoverRow(8, 'firecrawl_error')).toBe(false);
    expect(shouldExhaustDiscoverRow(8, 'time_budget_reached')).toBe(false);
    expect(shouldExhaustDiscoverRow(8, 'vision_cap_reached')).toBe(false);
  });

  test('uses a long ladder, then a 90-day hold when exhausted', () => {
    const first = computeDiscoverRetry({
      prior: { attempt_count: 0, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'no_candidates',
      nowMs: 0,
    });
    expect(first.exhausted).toBe(false);
    expect(Date.parse(first.nextRetryAt ?? '') - 0).toBe(BACKOFF_FIRST_MS);

    const second = computeDiscoverRetry({
      prior: { attempt_count: 1, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'no_candidates',
      nowMs: 0,
    });
    expect(Date.parse(second.nextRetryAt ?? '') - 0).toBe(BACKOFF_SECOND_MS);

    const third = computeDiscoverRetry({
      prior: { attempt_count: 2, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'no_candidates',
      nowMs: 0,
    });
    expect(third.exhausted).toBe(true);
    expect(third.reason?.startsWith('exhausted:')).toBe(true);
    expect(Date.parse(third.nextRetryAt ?? '') - 0).toBe(EXHAUSTED_HOLD_MS);
    expect(Date.parse(third.nextRetryAt ?? '') - 0).toBeGreaterThan(BACKOFF_LATER_MS);
  });

  test('quota, time-budget, and vision-cap stay short and do not park the row', () => {
    const quota = computeDiscoverRetry({
      prior: { attempt_count: 4, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'openai_quota_exceeded',
      nowMs: 0,
    });
    expect(quota.exhausted).toBe(false);
    expect(Date.parse(quota.nextRetryAt ?? '') - 0).toBe(BACKOFF_QUOTA_MS);

    const firecrawl = computeDiscoverRetry({
      prior: { attempt_count: 4, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'firecrawl_error',
      nowMs: 0,
    });
    expect(firecrawl.exhausted).toBe(false);
    expect(Date.parse(firecrawl.nextRetryAt ?? '') - 0).toBe(BACKOFF_QUOTA_MS);

    const timeout = computeDiscoverRetry({
      prior: { attempt_count: 4, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'time_budget_reached',
      nowMs: 0,
    });
    expect(timeout.exhausted).toBe(false);
    expect(Date.parse(timeout.nextRetryAt ?? '') - 0).toBe(BACKOFF_TIME_BUDGET_MS);

    // Accelerated discover always hits a 2-check vision cap; that must not
    // become exhausted:vision_cap_reached + a 90-day hold.
    const visionCap = computeDiscoverRetry({
      prior: { attempt_count: 4, success_count: 0, next_retry_at: null },
      placed: false,
      failureReason: 'vision_cap_reached',
      nowMs: 0,
    });
    expect(visionCap.exhausted).toBe(false);
    expect(visionCap.reason).toBe('vision_cap_reached');
    expect(Date.parse(visionCap.nextRetryAt ?? '') - 0).toBe(BACKOFF_TIME_BUDGET_MS);
  });

  test('skips exhausted and not-yet-due rows', () => {
    expect(
      discoverSkipReason({
        attempt_count: 3,
        success_count: 0,
        next_retry_at: new Date(Date.now() + 1000).toISOString(),
        last_failure_reason: 'exhausted:no_candidates',
      })
    ).toBe('exhausted');
    expect(
      discoverSkipReason({
        attempt_count: 1,
        success_count: 0,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        last_failure_reason: 'no_candidates',
      })
    ).toBe('backoff');
    expect(
      discoverSkipReason({
        attempt_count: 1,
        success_count: 0,
        next_retry_at: new Date(Date.now() - 1000).toISOString(),
        last_failure_reason: 'no_candidates',
      })
    ).toBeNull();
    expect(
      discoverSkipReason({
        attempt_count: 3,
        success_count: 0,
        next_retry_at: new Date(Date.now() - 1000).toISOString(),
        last_failure_reason: 'exhausted:no_candidates',
      })
    ).toBeNull();
    expect(
      discoverSkipReason({
        attempt_count: 3,
        success_count: 0,
        next_retry_at: null,
        last_failure_reason: 'exhausted:no_candidates',
      })
    ).toBe('exhausted');
  });

  test('exhausted hold release payload clears park without touching backoff policy', () => {
    const payload = exhaustedHoldReleasePayload('2026-10-05T12:00:00.000Z');
    expect(payload).toEqual({
      next_retry_at: null,
      last_failure_reason: null,
      attempt_count: 0,
      updated_at: '2026-10-05T12:00:00.000Z',
    });
    // After release, a row is eligible even if it previously had a future hold.
    expect(
      discoverSkipReason({
        attempt_count: payload.attempt_count,
        success_count: 0,
        next_retry_at: payload.next_retry_at,
        last_failure_reason: payload.last_failure_reason,
      })
    ).toBeNull();
    // Ordinary backoff (non-exhausted) still skips until next_retry_at.
    expect(
      discoverSkipReason({
        attempt_count: 1,
        success_count: 0,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        last_failure_reason: 'openai_quota_exceeded',
      })
    ).toBe('backoff');
  });

  test('allows retry after exhausted 90-day hold expires', () => {
    expect(
      discoverSkipReason({
        attempt_count: 3,
        success_count: 0,
        next_retry_at: new Date(Date.now() - 1000).toISOString(),
        last_failure_reason: 'exhausted:no_candidates',
      })
    ).toBeNull();
    expect(
      discoverSkipReason(
        {
          attempt_count: 3,
          success_count: 0,
          next_retry_at: new Date(EXHAUSTED_HOLD_MS).toISOString(),
          last_failure_reason: 'exhausted:no_candidates',
        },
        EXHAUSTED_HOLD_MS + 1
      )
    ).toBeNull();
    // Legacy rows marked exhausted with no hold timestamp stay parked.
    expect(
      discoverSkipReason({
        attempt_count: 3,
        success_count: 0,
        next_retry_at: null,
        last_failure_reason: 'exhausted:no_candidates',
      })
    ).toBe('exhausted');
  });
});

describe('resolveDiscoverAttemptFailure', () => {
  test('does not treat empty Firecrawl outages as no_candidates', () => {
    expect(
      resolveDiscoverAttemptFailure({
        timedOutDuringRow: false,
        sawCandidates: false,
        failureReason: 'no_candidates',
        firecrawlErrors: ['googleImages (Dassai 45): search HTTP 429: rate limit'],
        firecrawlBypassActive: false,
        openaiVisionQuotaExceeded: false,
      })
    ).toBe('firecrawl_quota');

    expect(
      resolveDiscoverAttemptFailure({
        timedOutDuringRow: false,
        sawCandidates: false,
        failureReason: 'no_candidates',
        firecrawlErrors: ['googleImages: search HTTP 503: upstream'],
        firecrawlBypassActive: false,
        openaiVisionQuotaExceeded: false,
      })
    ).toBe('firecrawl_error');

    expect(
      resolveDiscoverAttemptFailure({
        timedOutDuringRow: false,
        sawCandidates: false,
        failureReason: 'no_candidates',
        firecrawlErrors: ['Firecrawl bypass active; direct Google returned no URLs'],
        firecrawlBypassActive: true,
        openaiVisionQuotaExceeded: false,
      })
    ).toBe('firecrawl_quota');
  });

  test('keeps true empty searches as no_candidates', () => {
    expect(
      resolveDiscoverAttemptFailure({
        timedOutDuringRow: false,
        sawCandidates: false,
        failureReason: 'no_candidates',
        firecrawlErrors: [
          'googleImages (Foo): No image search results (Firecrawl search + direct Google)',
        ],
        firecrawlBypassActive: false,
        openaiVisionQuotaExceeded: false,
      })
    ).toBe('no_candidates');

    expect(
      resolveDiscoverAttemptFailure({
        timedOutDuringRow: false,
        sawCandidates: false,
        failureReason: 'no_candidates',
        firecrawlErrors: [],
        firecrawlBypassActive: false,
        openaiVisionQuotaExceeded: false,
      })
    ).toBe('no_candidates');
  });

  test('maps vision-quota emptied queues away from no_candidates', () => {
    expect(
      resolveDiscoverAttemptFailure({
        timedOutDuringRow: false,
        sawCandidates: true,
        failureReason: 'no_candidates',
        firecrawlErrors: [],
        firecrawlBypassActive: false,
        openaiVisionQuotaExceeded: true,
      })
    ).toBe('openai_quota_exceeded');
  });

  test('infra detector ignores benign empty-result strings', () => {
    expect(
      looksLikeFirecrawlInfrastructureError(
        'No image search results (Firecrawl search + direct Google)'
      )
    ).toBe(false);
    expect(looksLikeFirecrawlInfrastructureError('search HTTP 402: Payment Required')).toBe(true);
  });
});

describe('prioritizeDiscoverRows', () => {
  test('puts never-tried rows ahead of previous failures', () => {
    const rows = [{ id: 'failed' }, { id: 'fresh' }, { id: 'hot-fresh' }, { id: 'hot-failed' }];
    const history = new Map([
      ['failed', { attempt_count: 2, success_count: 0, next_retry_at: null }],
      ['hot-failed', { attempt_count: 1, success_count: 0, next_retry_at: null }],
    ]);
    const ordered = prioritizeDiscoverRows(rows, history, new Set(['hot-fresh', 'hot-failed']));
    expect(ordered.map((r) => r.id)).toEqual(['hot-fresh', 'fresh', 'hot-failed', 'failed']);
  });
});

describe('discoverRowCapForRun', () => {
  test('shrinks the batch when the last run placed nothing', () => {
    expect(discoverRowCapForRun(20, [0.3, 0])).toBe(DISCOVER_ROW_CAP_LOW_YIELD);
    expect(discoverRowCapForRun(20, [0.3])).toBe(DISCOVER_ROW_CAP_DEFAULT);
    expect(discoverRowCapForRun(4, [0])).toBe(4);
  });
});

describe('discover pool paging', () => {
  test('keeps scanning while the eligible buffer is under target', () => {
    expect(discoverEligibleBufferTarget(6)).toBe(24);
    expect(
      shouldScanNextDiscoverPoolPage({
        pagesScanned: 1,
        maxPages: 8,
        eligibleRows: 0,
        rowCap: 6,
        lastPageRows: 2000,
        pageSize: 2000,
      })
    ).toBe(true);
    expect(
      shouldScanNextDiscoverPoolPage({
        pagesScanned: 2,
        maxPages: 8,
        eligibleRows: 24,
        rowCap: 6,
        lastPageRows: 2000,
        pageSize: 2000,
      })
    ).toBe(false);
    expect(
      shouldScanNextDiscoverPoolPage({
        pagesScanned: 8,
        maxPages: 8,
        eligibleRows: 0,
        rowCap: 6,
        lastPageRows: 2000,
        pageSize: 2000,
      })
    ).toBe(false);
    expect(
      shouldScanNextDiscoverPoolPage({
        pagesScanned: 1,
        maxPages: 8,
        eligibleRows: 0,
        rowCap: 6,
        lastPageRows: 25,
        pageSize: 2000,
      })
    ).toBe(false);
  });

  test('pool pages never exceed the PostgREST max-rows cap', () => {
    // A page larger than max-rows is truncated by the server, so a full first
    // page would look like the end of the pool and stop scanning early.
    expect(DISCOVER_POOL_PAGE_SIZE).toBeLessThanOrEqual(POSTGREST_MAX_ROWS);
    expect(POSTGREST_MAX_ROWS).toBe(1000);
    expect(
      shouldScanNextDiscoverPoolPage({
        pagesScanned: 1,
        maxPages: DISCOVER_POOL_PAGE_LIMIT,
        eligibleRows: 0,
        rowCap: 6,
        lastPageRows: POSTGREST_MAX_ROWS,
        pageSize: DISCOVER_POOL_PAGE_SIZE,
      })
    ).toBe(true);
  });

  test('page limit can cover the current missing-image pool', () => {
    expect(DISCOVER_POOL_PAGE_LIMIT * DISCOVER_POOL_PAGE_SIZE).toBeGreaterThanOrEqual(11_500);
  });
});

describe('shouldRunDiscoverFallback', () => {
  test('blocks a second search on cron/accelerated/trusted-first', () => {
    expect(shouldRunDiscoverFallback({ accelerated: true, trustedFirst: true, chunked: true })).toBe(
      false
    );
    expect(shouldRunDiscoverFallback({ accelerated: false, trustedFirst: true, chunked: true })).toBe(
      false
    );
    expect(shouldRunDiscoverFallback({ accelerated: false, trustedFirst: false, chunked: false })).toBe(
      true
    );
  });
});
