import { describe, expect, test } from 'bun:test';
import { looksLikeNonSakeUrl } from './nonSakeUrl.ts';

describe('looksLikeNonSakeUrl', () => {
  test('does not flag sake product filenames that contain "wine"', () => {
    expect(
      looksLikeNonSakeUrl(
        'https://example.supabase.co/storage/v1/object/public/sake-images/pure-rice-wine-1779880297269.png'
      )
    ).toBe(false);
    expect(
      looksLikeNonSakeUrl(
        'https://example.supabase.co/storage/v1/object/public/sake-images/wine-cell-sparkling-1784584263274.png'
      )
    ).toBe(false);
  });

  test('does not flag retailer category paths like /wine-and-sake/', () => {
    expect(
      looksLikeNonSakeUrl('https://shop.example/collections/wine-and-sake/products/dassai-45.jpg')
    ).toBe(false);
    expect(looksLikeNonSakeUrl('https://cdn.example/wine/products/junmai.jpg')).toBe(false);
  });

  test('still flags clear whisky / spirit brand URLs', () => {
    expect(looksLikeNonSakeUrl('https://cdn.example/products/johnnie-walker-black.jpg')).toBe(true);
    expect(looksLikeNonSakeUrl('https://cdn.example/macallan-12-scotch.jpg')).toBe(true);
    expect(looksLikeNonSakeUrl('https://cdn.example/jack-daniels-old-no-7.jpg')).toBe(true);
  });
});
