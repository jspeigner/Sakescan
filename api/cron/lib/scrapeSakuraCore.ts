/**
 * Shared Sakura Sake Shop export scraper (Firecrawl).
 */

export type ScrapedSake = {
  name: string;
  nameJapanese?: string;
  brewery?: string;
  type?: string;
  prefecture?: string;
  imageUrl?: string;
  taste?: string;
  foodPairing?: string[];
};

export type SakuraScrapeFilter = {
  category?: string;
  prefecture?: string;
};

function decodeEscapedUrl(url: string): string {
  return url
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .trim();
}

function isLikelyProductImage(url: string): boolean {
  const lower = url.toLowerCase();
  const looksLikeImage =
    /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(lower) ||
    lower.includes('/images/') ||
    lower.includes('/uploads/') ||
    lower.includes('cdn') ||
    lower.includes('cloudfront');

  const excluded =
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('arrow') ||
    lower.includes('close') ||
    lower.includes('favicon') ||
    lower.includes('sprite') ||
    lower.endsWith('.svg');

  return looksLikeImage && !excluded;
}

export async function scrapeSakuraListing(
  firecrawlApiKey: string,
  filter?: SakuraScrapeFilter
): Promise<{ sakes: ScrapedSake[]; url: string }> {
  let url = 'https://export.sakurasaketen.com/sake';
  const params = new URLSearchParams();

  if (filter?.category) {
    params.append('Select by Sake Category', filter.category);
  }
  if (filter?.prefecture) {
    params.append('Select by Prefecture', filter.prefecture);
  }

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firecrawlApiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl scrape failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const html = data.data?.html || '';
  const markdown = data.data?.markdown || '';
  const sakes: ScrapedSake[] = [];
  const sakeBlocks = markdown.split(/(?=Modern-|Classic-)/g);

  for (const block of sakeBlocks) {
    if (block.length < 20) continue;

    const matrixMatch = block.match(/(Modern|Classic)-(Light|Medium|Full|Rich)/i);
    const lines = block.split('\n').filter((line: string) => line.trim());

    let englishName = '';
    let japaneseName = '';
    let brewery = '';
    let prefecture = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(Modern|Classic)-(Light|Medium|Full|Rich)/i.test(trimmed)) continue;
      if (trimmed.includes('arrow') || trimmed.includes('icon') || trimmed.includes('close')) {
        continue;
      }

      const breweryMatch = trimmed.match(
        /^([A-Za-z\s]+(?:Shuzo|Brewery|Sake|Brewing|酒造)?)\s*\\?-\s*([A-Za-z]+)$/i
      );
      if (breweryMatch) {
        brewery = breweryMatch[1].trim();
        prefecture = breweryMatch[2].trim();
        continue;
      }

      if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(trimmed) && !japaneseName) {
        japaneseName = trimmed;
        continue;
      }

      if (
        /^[A-Z][A-Za-z\s"'()-]+$/.test(trimmed) &&
        trimmed.length > 3 &&
        trimmed.length < 100 &&
        !englishName
      ) {
        if (
          !/^(Junmai|Ginjo|Daiginjo|Honjozo|Fruity|Light|Bold|Fresh|Sweet|Rich|Meaty|White|Seafood|Spicy)/i.test(
            trimmed
          )
        ) {
          englishName = trimmed;
        }
      }
    }

    if (englishName || japaneseName) {
      const sake: ScrapedSake = {
        name: englishName || japaneseName,
        nameJapanese: japaneseName || undefined,
        brewery: brewery || undefined,
        prefecture: prefecture || undefined,
      };

      const typeMatch = block.match(
        /(Junmai Daiginjo|Junmai Ginjo|Tokubetsu Junmai|Junmai|Daiginjo|Ginjo|Tokubetsu Honjozo|Honjozo)/i
      );
      if (typeMatch) sake.type = typeMatch[1];

      const tasteMatch = block.match(
        /(Fruity & Aromatic|Light & Dry|Bold & Aged|Fresh & Vivid|Sweet|Rich & Savory)/i
      );
      if (tasteMatch) sake.taste = tasteMatch[1];

      const foodMatches = block.match(
        /(Meaty Food|White Meats and Salty Food|Seafood|Spicy Food|Sweet Food)/gi
      );
      if (foodMatches) {
        sake.foodPairing = [...new Set(foodMatches.map((item) => String(item)))];
      }

      if (matrixMatch) {
        /* matrix label only — type may come from typeMatch */
      }

      sakes.push(sake);
    }
  }

  const candidateUrls = new Set<string>();
  const directUrlRegex = /https?:\/\/[^"'\\s)]+/gi;
  const srcAttrRegex = /(?:src|data-src|data-image|data-original|poster)=["']([^"']+)["']/gi;
  const srcSetRegex = /srcset=["']([^"']+)["']/gi;
  const jsonUrlRegex = /"url"\s*:\s*"([^"]+)"/gi;

  const directMatches = html.match(directUrlRegex) || [];
  directMatches.forEach((raw: string) => candidateUrls.add(decodeEscapedUrl(raw)));

  for (const match of html.matchAll(srcAttrRegex)) {
    if (match[1]) candidateUrls.add(decodeEscapedUrl(match[1]));
  }

  for (const match of html.matchAll(srcSetRegex)) {
    if (!match[1]) continue;
    const srcSetParts = match[1].split(',').map((part: string) => part.trim().split(' ')[0]);
    srcSetParts.forEach((part: string) => candidateUrls.add(decodeEscapedUrl(part)));
  }

  for (const match of html.matchAll(jsonUrlRegex)) {
    if (match[1]) candidateUrls.add(decodeEscapedUrl(match[1]));
  }

  const productImages = Array.from(candidateUrls)
    .map((u) => {
      if (u.startsWith('//')) return `https:${u}`;
      if (u.startsWith('/')) return `https://export.sakurasaketen.com${u}`;
      return u;
    })
    .filter((u) => u.startsWith('http'))
    .filter((u) => isLikelyProductImage(u))
    .filter((u) => !u.includes('google') && !u.includes('gstatic'));

  const uniqueProductImages = productImages.filter(
    (u, index, self) => index === self.findIndex((x) => x === u)
  );

  sakes.forEach((sake, index) => {
    if (index < uniqueProductImages.length) {
      sake.imageUrl = uniqueProductImages[index];
    }
  });

  const uniqueSakes = sakes.filter(
    (sake, index, self) => index === self.findIndex((s) => s.name === sake.name)
  );

  return { sakes: uniqueSakes, url };
}

/** Rotating filters for paginated cron import. */
export const SAKURA_FILTER_ROTATION: SakuraScrapeFilter[] = [
  {},
  { category: 'Junmai Ginjo' },
  { category: 'Junmai' },
  { category: 'Daiginjo' },
  { category: 'Ginjo' },
  { category: 'Honjozo' },
  { prefecture: 'Yamagata' },
  { prefecture: 'Niigata' },
  { prefecture: 'Hyogo' },
  { prefecture: 'Kyoto' },
  { prefecture: 'Hiroshima' },
  { prefecture: 'Fukushima' },
  { prefecture: 'Nagano' },
];
