import { describe, expect, test } from 'bun:test';
import {
  WINEENGINE_IDENTIFY_SEARCH_RESERVE,
  identifySearchBudget,
  type WineEngineQuotaSnapshot,
} from './wineEngineQuota.ts';

function snapshot(partial: {
  remainingSearches: number;
  remainingSearchesToday: number;
}): WineEngineQuotaSnapshot {
  return {
    state: {
      period: '2026-08',
      day: '2026-08-30',
      images: 0,
      searches: 0,
      imagesToday: 0,
      searchesToday: 0,
    },
    remainingImages: 4800,
    remainingSearches: partial.remainingSearches,
    remainingImagesToday: 160,
    remainingSearchesToday: partial.remainingSearchesToday,
    imagesExhausted: false,
    searchesExhausted: false,
  };
}

describe('identifySearchBudget', () => {
  test('does not reserve idle cron search quota after discover live search removal', () => {
    expect(WINEENGINE_IDENTIFY_SEARCH_RESERVE).toBe(0);
    // Previously a 100-search reserve blocked identify while remainingSearches was 50–99.
    expect(identifySearchBudget(snapshot({ remainingSearches: 50, remainingSearchesToday: 10 }))).toBe(
      1
    );
  });

  test('still respects daily remaining searches', () => {
    expect(identifySearchBudget(snapshot({ remainingSearches: 50, remainingSearchesToday: 0 }))).toBe(
      0
    );
  });
});
