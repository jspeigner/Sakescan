import { describe, expect, test } from 'bun:test';
import { isReusableWineEngineCacheRow } from './wineEngineSearchCache.ts';

describe('isReusableWineEngineCacheRow', () => {
  test('requires status ok and at least one match', () => {
    expect(
      isReusableWineEngineCacheRow({
        status: 'ok',
        match_count: 1,
        raw_result: [{ filepath: 'sake/x.jpg', score: 50 }],
      })
    ).toBe(true);
  });

  test('rejects fail/error statuses even when match_count is positive', () => {
    expect(
      isReusableWineEngineCacheRow({
        status: 'fail',
        match_count: 1,
        raw_result: [{ filepath: 'sake/x.jpg' }],
      })
    ).toBe(false);
    expect(isReusableWineEngineCacheRow({ status: 'error', match_count: 2 })).toBe(false);
    expect(isReusableWineEngineCacheRow({ status: '', match_count: 1 })).toBe(false);
    expect(isReusableWineEngineCacheRow({ status: null, match_count: 1 })).toBe(false);
  });

  test('rejects successful empty searches so collection growth can be retried', () => {
    expect(
      isReusableWineEngineCacheRow({
        status: 'ok',
        match_count: 0,
        raw_result: [],
      })
    ).toBe(false);
    expect(
      isReusableWineEngineCacheRow({
        status: 'ok',
        match_count: 0,
        raw_result: null,
      })
    ).toBe(false);
  });

  test('accepts ok rows when raw_result has matches even if match_count is missing', () => {
    expect(
      isReusableWineEngineCacheRow({
        status: 'ok',
        raw_result: [{ filepath: 'sake/y.jpg', score: 40 }],
      })
    ).toBe(true);
  });
});
