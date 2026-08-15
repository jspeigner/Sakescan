import { describe, expect, test } from 'bun:test';
import { breweryNamesCompatible, matchesExisting } from './importSakuraBatch.ts';
import type { ScrapedSake } from './scrapeSakuraCore.ts';

const baseExisting = {
  id: 'sake-1',
  name: 'Dassai 23',
  name_japanese: '獺祭 磨き二割三分',
  brewery: 'Asahi Shuzo',
  image_url: 'https://cdn.example/dassai-23.jpg',
  description: null,
  type: 'Junmai Daiginjo',
  prefecture: 'Yamaguchi',
};

describe('breweryNamesCompatible', () => {
  test('allows corporate-suffix and shuzo/shuzou spelling variants', () => {
    expect(breweryNamesCompatible('Asahi Shuzo', 'Asahi Shuzo Co.,Ltd')).toBe(true);
    expect(breweryNamesCompatible('Asahi Shuzo', 'Asahi Shuzou')).toBe(true);
  });

  test('rejects substring traps across different houses', () => {
    expect(breweryNamesCompatible('Asahi', 'Tamaasahi Shuzou')).toBe(false);
    expect(breweryNamesCompatible('Ito', 'Itou Shuzo')).toBe(false);
  });
});

describe('matchesExisting', () => {
  test('matches the same product by English name', () => {
    const scraped: ScrapedSake = {
      name: 'Dassai 23',
      brewery: 'Asahi Shuzo',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(true);
  });

  test('does not match a different product from the same brewery', () => {
    // Regression: brewery-only fallback used to attach every Asahi Shuzo SKU
    // onto the first existing Asahi row, corrupting images and blocking inserts.
    const scraped: ScrapedSake = {
      name: 'Dassai 45',
      brewery: 'Asahi Shuzo',
      imageUrl: 'https://cdn.example/dassai-45.jpg',
      nameJapanese: '獺祭 磨き四割五分',
      type: 'Junmai Daiginjo',
      prefecture: 'Yamaguchi',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(false);
  });

  test('rejects name match when breweries disagree', () => {
    const scraped: ScrapedSake = {
      name: 'Dassai 23',
      brewery: 'Other Brewery',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(false);
  });

  test('rejects name-only overlap when brewery is missing on the scrape', () => {
    // Sakura brewery-line parse often fails; previously returned true and
    // updated the first catalog hit instead of inserting.
    const scraped: ScrapedSake = {
      name: 'Dassai 23',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(false);
  });

  test('rejects brewery substring collisions (Asahi ⊆ Tamaasahi)', () => {
    const scraped: ScrapedSake = {
      name: 'Special Junmai',
      brewery: 'Asahi',
    };
    expect(
      matchesExisting(scraped, {
        ...baseExisting,
        name: 'Special Junmai',
        brewery: 'Tamaasahi Shuzou',
      })
    ).toBe(false);
  });

  test('allows corporate-suffix brewery variants when the product name matches', () => {
    const scraped: ScrapedSake = {
      name: 'Dassai 23',
      brewery: 'Asahi Shuzo Co.,Ltd',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(true);
  });
});
