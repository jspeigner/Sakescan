import { describe, expect, test } from 'bun:test';
import { isReusableWineEngineCacheStatus } from './wineEngineSearchCache.ts';

describe('isReusableWineEngineCacheStatus', () => {
  test('only ok live searches are reusable cache hits', () => {
    expect(isReusableWineEngineCacheStatus('ok')).toBe(true);
  });

  test('failures and empty/unknown statuses must not poison the cache', () => {
    expect(isReusableWineEngineCacheStatus('fail')).toBe(false);
    expect(isReusableWineEngineCacheStatus('error')).toBe(false);
    expect(isReusableWineEngineCacheStatus('')).toBe(false);
    expect(isReusableWineEngineCacheStatus(null)).toBe(false);
    expect(isReusableWineEngineCacheStatus(undefined)).toBe(false);
  });
});
