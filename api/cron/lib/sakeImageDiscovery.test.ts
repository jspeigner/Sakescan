import { describe, expect, test } from 'bun:test';
import {
  isTrustedImageUrl,
  isTrustedRetailerSource,
  shouldClearCatalogUrlAsNonSakeProduct,
  shouldSkipWebSearchAfterTrustedDirect,
  shouldSpendVisionOnUntrustedCandidate,
  urlLooksLikeNonSakeProduct,
} from './sakeImageDiscovery';

describe('shouldSkipWebSearchAfterTrustedDirect', () => {
  // Exactly what export.sakurasaketen.com returns for *every* keyword (observed 2026-09-09).
  const sakuraGenericAssets = [
    'https://cdn.prod.website-files.com/6335b41be5d1086e0d313d2d/650d3fd28e53468a7ecdf0f2_web.png',
    'https://cdn.prod.website-files.com/6335b41be5d1086933313d52/6a16dcbf9ee68bd1541f47ef_Zaku%20for%202126%20(2).png',
    'https://cdn.prod.website-files.com/6335b41be5d1086933313d52/6a16dcbf9ee68bd1541f47ef_Zaku%20for%202126%20(2)-p-500.png',
    'https://cdn.prod.website-files.com/6335b41be5d1086933313d52/6a16dcbf9ee68bd1541f47ef_Zaku%20for%202126%20(2)-p-800.png',
    'https://cdn.prod.website-files.com/6335b41be5d1086933313d52/6a16dcbf9ee68bd1541f47ef_Zaku%20for%202126%20(2)-p-1080.png',
  ].map((url) => ({ url, source: 'Sakura Search' }));

  test('generic retailer site assets do not short-circuit the web search', () => {
    expect(
      shouldSkipWebSearchAfterTrustedDirect(
        'trusted-first',
        sakuraGenericAssets,
        '花の舞 純米酒超辛口',
        null,
        '花の舞酒造'
      )
    ).toBe(false);
  });

  test('relevant retailer hits still skip the paid web search', () => {
    const relevant = [
      { url: 'https://cdn.prod.website-files.com/abc/dassai-23-junmai-daiginjo-bottle.jpg', source: 'Sakura Search' },
      { url: 'https://umamimart.com/cdn/shop/products/dassai-23-sake_800x.jpg', source: 'Umami Search' },
    ];
    expect(
      shouldSkipWebSearchAfterTrustedDirect('trusted-first', relevant, 'Dassai 23', '獺祭', 'Asahi Shuzo')
    ).toBe(true);
  });

  test('only applies to trusted-first mode', () => {
    const relevant = [
      { url: 'https://cdn.prod.website-files.com/abc/dassai-23-bottle.jpg', source: 'Sakura Search' },
      { url: 'https://umamimart.com/cdn/shop/products/dassai-23_800x.jpg', source: 'Umami Search' },
    ];
    expect(shouldSkipWebSearchAfterTrustedDirect('full', relevant, 'Dassai 23')).toBe(false);
    expect(shouldSkipWebSearchAfterTrustedDirect('google-only', relevant, 'Dassai 23')).toBe(false);
  });
});

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

  test('skips vision on weak untrusted URLs and allows strong name matches', () => {
    expect(
      shouldSpendVisionOnUntrustedCandidate(
        'https://cdn.example.com/random-bottle.jpg',
        'Bottle',
        'Dassai 45',
        '獺祭',
        'Asahi Shuzo'
      )
    ).toBe(false);
    expect(
      shouldSpendVisionOnUntrustedCandidate(
        'https://cdn.example.com/products/dassai-45-asahi-shuzo-sake.jpg',
        'Dassai 45 Asahi Shuzo sake',
        'Dassai 45',
        null,
        'Asahi Shuzo'
      )
    ).toBe(true);
  });

  test('search-page source labels are not vision-exempt', () => {
    expect(isTrustedRetailerSource('Sakura Search')).toBe(false);
    expect(isTrustedRetailerSource('Umami Search')).toBe(false);
    expect(isTrustedRetailerSource('Sake Times Search')).toBe(false);
    // Legacy product-detail labels are unused by SERP extractors now.
    expect(isTrustedRetailerSource('Sakura Sake Shop')).toBe(false);
  });
});
