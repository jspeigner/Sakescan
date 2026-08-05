import { describe, expect, test } from 'bun:test';
import {
  isTrustedImageUrl,
  isTrustedRetailerSource,
  shouldClearCatalogUrlAsNonSakeProduct,
  urlLooksLikeNonSakeProduct,
} from './sakeImageDiscovery';

describe('urlLooksLikeNonSakeProduct', () => {
  test('flags known spirit brand URLs', () => {
    expect(urlLooksLikeNonSakeProduct('https://cdn.example.com/johnnie-walker-black.jpg')).toBe(
      true
    );
  });

  test('false-positives on common sake retailer category paths', () => {
    // These are legitimate places sake bottle images live. Mirror must not wipe them.
    expect(
      urlLooksLikeNonSakeProduct(
        'https://shop.example.com/collections/wine-and-sake/products/dassai-23.jpg'
      )
    ).toBe(true);
    expect(
      urlLooksLikeNonSakeProduct('https://cdn.example.com/wine/products/dassai-23.jpg')
    ).toBe(true);
    expect(
      urlLooksLikeNonSakeProduct(
        'https://retailer.com/beer-wine-spirits/sake/kubota.jpg'
      )
    ).toBe(true);
  });

  test('allows clean sake product URLs', () => {
    expect(
      urlLooksLikeNonSakeProduct('https://images.umamimart.com/products/dassai.jpg')
    ).toBe(false);
  });
});

describe('shouldClearCatalogUrlAsNonSakeProduct', () => {
  test('never clears catalog URLs from the URL heuristic alone', () => {
    expect(
      shouldClearCatalogUrlAsNonSakeProduct(
        'https://shop.example.com/collections/wine-and-sake/products/dassai-23.jpg'
      )
    ).toBe(false);
    expect(
      shouldClearCatalogUrlAsNonSakeProduct(
        'https://cdn.example.com/johnnie-walker-black.jpg'
      )
    ).toBe(false);
  });
});

describe('trusted image vision exemptions', () => {
  test('does not trust generic shared CDNs by hostname alone', () => {
    expect(isTrustedImageUrl('https://cdn.website-files.com/abc/bottle.jpg')).toBe(false);
    expect(
      isTrustedImageUrl('https://cdn.shopify.com/s/files/1/0000/products/random.jpg')
    ).toBe(false);
  });

  test('still trusts first-party retailer hosts', () => {
    expect(isTrustedImageUrl('https://export.sakurasaketen.com/images/dassai.jpg')).toBe(true);
    expect(isTrustedImageUrl('https://images.umamimart.com/products/dassai.jpg')).toBe(true);
  });

  test('search-page source labels are not vision-exempt', () => {
    expect(isTrustedRetailerSource('Sakura Search')).toBe(false);
    expect(isTrustedRetailerSource('Umami Search')).toBe(false);
    expect(isTrustedRetailerSource('Sake Times Search')).toBe(false);
    // Legacy product-detail labels are unused by SERP extractors now.
    expect(isTrustedRetailerSource('Sakura Sake Shop')).toBe(false);
  });
});
