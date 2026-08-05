import { describe, expect, test } from 'bun:test';
import { matchesExisting, productNamesCompatible } from './importSakuraBatch.ts';
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

describe('productNamesCompatible', () => {
  test('exact and grade-token extensions match', () => {
    expect(productNamesCompatible('Dassai 23', 'Dassai 23')).toBe(true);
    expect(productNamesCompatible('Dassai 23', 'Dassai 23 Junmai Daiginjo')).toBe(true);
  });

  test('rejects substring SKU collisions', () => {
    expect(productNamesCompatible('Kubota', 'Kubota Manju')).toBe(false);
    expect(productNamesCompatible('Dassai', 'Dassai 23')).toBe(false);
    expect(productNamesCompatible('Junmai', 'Junmai Ginjo Yamadanishiki')).toBe(false);
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

  test('does not match a longer product name that merely contains a short catalog name', () => {
    const shortExisting = { ...baseExisting, name: 'Kubota', name_japanese: null };
    const scraped: ScrapedSake = {
      name: 'Kubota Manju',
      brewery: 'Asahi Shuzo',
    };
    expect(matchesExisting(scraped, shortExisting)).toBe(false);
  });

  test('rejects name match when breweries disagree', () => {
    const scraped: ScrapedSake = {
      name: 'Dassai 23',
      brewery: 'Other Brewery',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(false);
  });

  test('allows corporate-suffix brewery variants when the product name matches', () => {
    const scraped: ScrapedSake = {
      name: 'Dassai 23',
      brewery: 'Asahi Shuzo Co.,Ltd',
    };
    expect(matchesExisting(scraped, baseExisting)).toBe(true);
  });
});
