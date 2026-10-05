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
    period: '2026-09',
    day: '2026-09-09',
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
  test('reports disabled when WineEngine is not configured', () => {
    expect(buildProcessImagesWineEngineSummary(null, null)).toEqual({ disabled: true });
  });

  test('builds the summary from config + quota only', () => {
    expect(buildProcessImagesWineEngineSummary(cfg, quota)).toEqual({
      activeInDiscover: false,
      quota: {
        period: '2026-09',
        images: 10,
        searches: 2,
        remainingImagesToday: 159,
        remainingSearchesToday: 30,
      },
    });
  });

  test('tolerates a missing quota snapshot', () => {
    expect(buildProcessImagesWineEngineSummary(cfg, null)).toEqual({
      activeInDiscover: false,
      quota: null,
    });
  });
});
