import { describe, expect, test } from 'bun:test';
import { buildProcessImagesWineEngineSummary } from './processImagesWineEngineSummary.ts';
import type { WineEngineQuotaSnapshot } from './wineEngineQuota.ts';

const cfg = {
  baseUrl: 'https://wineengine.example/sakescan',
  username: 'u',
  password: 'p',
};

const quota: WineEngineQuotaSnapshot = {
  state: {
    period: '2026-08',
    day: '2026-08-24',
    images: 10,
    searches: 2,
    imagesToday: 1,
    searchesToday: 0,
  },
  remainingImages: 4790,
  remainingSearches: 898,
  remainingImagesToday: 159,
  remainingSearchesToday: 30,
  imagesExhausted: false,
  searchesExhausted: false,
};

describe('buildProcessImagesWineEngineSummary', () => {
  test('disabled when WineEngine config is missing', () => {
    expect(buildProcessImagesWineEngineSummary(null, null)).toEqual({ disabled: true });
  });

  test('does not reference removed collectionCount locals when enabled', () => {
    const summary = buildProcessImagesWineEngineSummary(cfg, quota);
    expect(summary).toEqual({
      activeInDiscover: false,
      quota: {
        period: '2026-08',
        images: 10,
        searches: 2,
        remainingImagesToday: 159,
        remainingSearchesToday: 30,
      },
    });
    expect(JSON.stringify(summary)).not.toContain('collectionCount');
  });

  test('allows null quota snapshot without throwing', () => {
    expect(buildProcessImagesWineEngineSummary(cfg, null)).toEqual({
      activeInDiscover: false,
      quota: null,
    });
  });
});
