import { describe, expect, test } from 'bun:test';
import { collectProductImageUrls, parseSakuraScrapeContent } from './scrapeSakuraCore.ts';

describe('collectProductImageUrls', () => {
  test('extracts markdown images in document order', () => {
    const fragment = `
![Dassai 45](https://cdn.example.com/images/dassai-45.jpg)
![Dassai 23](https://cdn.example.com/images/dassai-23.png)
`;
    expect(collectProductImageUrls(fragment)).toEqual([
      'https://cdn.example.com/images/dassai-45.jpg',
      'https://cdn.example.com/images/dassai-23.png',
    ]);
  });

  test('skips logos and non-product assets', () => {
    const fragment = `
![logo](https://cdn.example.com/logo.png)
<img src="https://cdn.example.com/images/bottle.webp" />
`;
    expect(collectProductImageUrls(fragment)).toEqual([
      'https://cdn.example.com/images/bottle.webp',
    ]);
  });
});

describe('parseSakuraScrapeContent', () => {
  test('binds images from the same product block only (no global index zip)', () => {
    const markdown = `
Modern-Light
Asahi Shuzou - Yamaguchi
Dassai 45
だっさい
Junmai Daiginjo
![Dassai 45](https://cdn.example.com/images/dassai-45.jpg)

Classic-Medium
Kizakura - Kyoto
Nigori Coconut
にごり
Junmai
![Nigori](https://cdn.example.com/images/nigori.jpg)
`;
    // Global HTML list intentionally in reverse product order — old zip would
    // assign nigori.jpg to Dassai 45.
    const html = `
<img src="https://cdn.example.com/images/nigori.jpg" />
<img src="https://cdn.example.com/images/dassai-45.jpg" />
`;

    const sakes = parseSakuraScrapeContent(markdown, html);
    expect(sakes).toHaveLength(2);
    expect(sakes[0]?.name).toBe('Dassai 45');
    expect(sakes[0]?.imageUrl).toBe('https://cdn.example.com/images/dassai-45.jpg');
    expect(sakes[1]?.name).toBe('Nigori Coconut');
    expect(sakes[1]?.imageUrl).toBe('https://cdn.example.com/images/nigori.jpg');
  });

  test('omits imageUrl when the product block has no image (does not steal from HTML list)', () => {
    const markdown = `
Modern-Light
Asahi Shuzou - Yamaguchi
Dassai 45
だっさい
Junmai Daiginjo
`;
    const html = `<img src="https://cdn.example.com/images/unrelated-bottle.jpg" />`;
    const sakes = parseSakuraScrapeContent(markdown, html);
    expect(sakes).toHaveLength(1);
    expect(sakes[0]?.name).toBe('Dassai 45');
    expect(sakes[0]?.imageUrl).toBeUndefined();
  });

  test('keeps numeric English product names and does not promote type labels', () => {
    const markdown = `
Modern-Light
Asahi Shuzou - Yamaguchi
Dassai 45
だっさい
Junmai Daiginjo
`;
    const sakes = parseSakuraScrapeContent(markdown);
    expect(sakes[0]?.name).toBe('Dassai 45');
    expect(sakes[0]?.type).toBe('Junmai Daiginjo');
  });
});
