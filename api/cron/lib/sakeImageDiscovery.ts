/**
 * Firecrawl-backed image discovery for sake rows (used by /api/search-sake and sake cron).
 */

export type SearchImageRow = {
  url: string;
  thumbnail?: string;
  source: string;
  title?: string;
};

export type SakeSearchMeta = {
  type?: string;
  prefecture?: string;
  polishingRatio?: number;
  alcoholPercentage?: number;
};

export type SakeSearchDebug = {
  sourceCounts: {
    google: number;
    bing: number;
    sakura: number;
    umami: number;
    sakeTimes: number;
  };
  firecrawlErrors: string[];
};

const JUNK_URL_REGEXES = [
  /shutterstock|gettyimages|istockphoto|dreamstime|alamy|123rf|depositphotos/i,
  /avatar|gravatar|favicon|emoji|sprite|profile[_-]?pic/i,
  /\/blog\/|\/news\/|\/articles?\/|infographic|diagram\.|chart\.png/i,
  /\.svg(\?|$)/i,
  /youtube\.|ytimg\.|facebook\.|fbcdn|instagram\.|cdninstagram|tiktok|pinterest\.|pinimg\./i,
  /wikipedia\.org\/static|wikimedia\.org\/.*\/thumb\/.*\/\d+px-/i,
];

/** URL/title hints that the asset is probably not Japanese sake. */
const NON_SAKE_PRODUCT_REGEXES = [
  /johnnie|walker|jwalker|jw\s*black|jw\s*red/i,
  /chivas|ballantine|macallan|glenfiddich|glenlivet|lagavulin|laphroaig|talisker/i,
  /\bwhisk(e)?y\b|\bscotch\b|\bbourbon\b|\brye\s+whisk/i,
  /\bvodka\b|\bgin\b|\brum\b|\btequila\b|\bmezcal\b|\bcognac\b|\bbrandy\b/i,
  /\bwine\b|\bchampagne\b|\bprosecco\b|\bcabernet\b|\bmerlot\b|\bchardonnay\b/i,
  /\bbeer\b|\blager\b|\bstout\b|\bipa\b|\bheineken\b|\bcorona\b|\bbudweiser\b/i,
  /jack\s*daniels|jim\s*beam|hennessy|martell|remy\s*martin/i,
];

function searchTokens(name: string, nameJapanese?: string, brewery?: string): string[] {
  const raw = [name, nameJapanese ?? '', brewery ?? ''].join(' ').toLowerCase();
  const parts = raw
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  return [...new Set(parts)];
}

function relevanceScore(url: string, title: string | undefined, tokens: string[]): number {
  const hay = `${url} ${title ?? ''}`.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (hay.includes(t)) s += 3;
  }
  if (hay.includes('nihonshu') || hay.includes('japanese sake')) s += 2;
  if (hay.includes('sake')) s += 1;
  if (hay.includes('/products/') || hay.includes('product')) s += 1;
  return s;
}

function sourcePriority(source: string): number {
  if (source === 'Google Images') return 48;
  if (source === 'Bing Images') return 46;
  if (source === 'Sakura Sake Shop') return 28;
  if (source === 'Umami Mart') return 28;
  if (source === 'Sake Times') return 24;
  return 15;
}

function haystackForNonSakeCheck(url: string, title?: string): string {
  return `${url} ${title ?? ''}`.toLowerCase();
}

export function filterAndRankImages(
  images: SearchImageRow[],
  name: string,
  nameJapanese: string | undefined,
  brewery: string | undefined
): SearchImageRow[] {
  const tokens = searchTokens(name, nameJapanese, brewery);

  const kept = images.filter((img) => {
    if (!img.url.startsWith('http')) return false;
    if (JUNK_URL_REGEXES.some((re) => re.test(img.url))) return false;
    const nonHay = haystackForNonSakeCheck(img.url, img.title);
    if (NON_SAKE_PRODUCT_REGEXES.some((re) => re.test(nonHay))) return false;
    const u = img.url.toLowerCase();
    if (u.includes('logo') && !u.includes('bottle') && !u.includes('product')) return false;

    const rel = relevanceScore(img.url, img.title, tokens);

    if (img.source === 'Google Images') {
      // Be permissive for Google candidates; OpenAI vision is the final quality gate.
      // Strict thresholds here were causing 0 candidates in production.
      if (tokens.length === 0) return rel >= 1;
      if (tokens.length === 1) return rel >= 1;
      return rel >= 2;
    }

    if (
      img.source === 'Sakura Sake Shop' ||
      img.source === 'Umami Mart' ||
      img.source === 'Sake Times'
    ) {
      const urlRel = relevanceScore(img.url, undefined, tokens);
      if (tokens.length > 0 && urlRel < 3) return false;
    }

    return true;
  });

  const scored = kept.map((img) => ({
    img,
    score: relevanceScore(img.url, img.title, tokens) + sourcePriority(img.source),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.img).slice(0, 20);
}

export function buildSakeImageSearchQuery(
  name: string,
  nameJapanese?: string | null,
  brewery?: string | null
): string {
  const searchTerms = [name];
  if (nameJapanese) searchTerms.push(nameJapanese);
  if (brewery) searchTerms.push(brewery);
  searchTerms.push('nihonshu', 'sake bottle');
  return searchTerms.join(' ');
}

function buildSakeImageSearchQueries(
  name: string,
  nameJapanese?: string | null,
  brewery?: string | null
): string[] {
  const baseName = name.trim();
  const jpName = (nameJapanese ?? '').trim();
  const breweryName = (brewery ?? '').trim();
  const queries: string[] = [];
  const pushUnique = (q: string): void => {
    const v = q.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (!queries.includes(v)) queries.push(v);
  };

  pushUnique(buildSakeImageSearchQuery(baseName, jpName || undefined, breweryName || undefined));
  if (jpName) pushUnique(`${jpName} ${breweryName || ''} 日本酒 商品 ボトル`.trim());
  if (breweryName) pushUnique(`${baseName} ${breweryName} nihonshu bottle`);
  pushUnique(`${baseName} nihonshu bottle label`);
  pushUnique(`${baseName} sake bottle product`);

  return queries.slice(0, 5);
}

/** Reject obvious non-sake URLs before vision (cheap guard). */
export function urlLooksLikeNonSakeProduct(url: string): boolean {
  const h = url.toLowerCase();
  return NON_SAKE_PRODUCT_REGEXES.some((re) => re.test(h));
}

async function firecrawlScrape(
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ html?: string; markdown?: string; _error?: string } | null> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { _error: `HTTP ${res.status}: ${errText.slice(0, 180)}` };
    }
    const json = (await res.json()) as { data?: { html?: string; markdown?: string } };
    return json.data ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { _error: `Network error: ${msg.slice(0, 180)}` };
  }
}

async function scrapeGoogleImages(
  firecrawlApiKey: string,
  searchQuery: string
): Promise<{ rows: SearchImageRow[]; error?: string }> {
  const googleImagesUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;
  const data = await firecrawlScrape(firecrawlApiKey, {
    url: googleImagesUrl,
    formats: ['html'],
    onlyMainContent: false,
    maxAge: 0,
  });
  if (!data?.html) return { rows: [], error: data?._error || 'No HTML from Firecrawl scrape' };

  const htmlContent = data.html;
  const patterns = [
    /"ou":"(https?:\/\/[^"]+)"/g,
    /\["(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))",[0-9]+,[0-9]+\]/g,
    /data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi,
  ];

  const foundUrls = new Set<string>();
  for (const pattern of patterns) {
    const matches = [...htmlContent.matchAll(pattern)];
    matches.forEach((match: RegExpMatchArray) => {
      const url = match[1];
      if (url && !url.includes('google.com') && !url.includes('gstatic') && url.startsWith('http')) {
        foundUrls.add(url);
      }
    });
  }

  return {
    rows: [...foundUrls].slice(0, 24).map((url) => ({
      url,
      source: 'Google Images',
      title: searchQuery,
    })),
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/');
}

async function scrapeBingImages(searchQuery: string): Promise<SearchImageRow[]> {
  const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}`;
  const res = await fetch(bingUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
    },
    redirect: 'follow',
  });
  if (!res.ok) return [];
  const html = await res.text();

  const regexes = [
    /murl&quot;:&quot;(https:[^"]+?)&quot;/gi,
    /"murl":"(https:[^"]+?)"/gi,
  ];

  const foundUrls = new Set<string>();
  for (const re of regexes) {
    const matches = [...html.matchAll(re)];
    matches.forEach((m) => {
      const raw = m[1];
      if (!raw) return;
      const url = decodeHtmlEntities(raw);
      if (!url.startsWith('http')) return;
      if (url.includes('bing.com') || url.includes('microsoft.com')) return;
      foundUrls.add(url);
    });
  }

  return [...foundUrls].slice(0, 24).map((url) => ({
    url,
    source: 'Bing Images',
    title: searchQuery,
  }));
}

export async function searchSakeImageCandidates(
  firecrawlApiKey: string,
  params: { name: string; nameJapanese?: string | null; brewery?: string | null },
  mode: 'google-only' | 'full'
): Promise<{ images: SearchImageRow[]; sakeData?: SakeSearchMeta; debug: SakeSearchDebug }> {
  const { name, nameJapanese, brewery } = params;
  const searchQueries = buildSakeImageSearchQueries(name, nameJapanese ?? undefined, brewery ?? undefined);
  const results: SearchImageRow[] = [];
  let sakeData: SakeSearchMeta | undefined;
  const debug: SakeSearchDebug = {
    sourceCounts: { google: 0, bing: 0, sakura: 0, umami: 0, sakeTimes: 0 },
    firecrawlErrors: [],
  };

  if (mode === 'full') {
    const sakuraSakeUrl = `https://export.sakurasaketen.com/sake?Keyword=${encodeURIComponent(name)}`;
    try {
      const sakuraData = await firecrawlScrape(firecrawlApiKey, {
        url: sakuraSakeUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        maxAge: 0,
      });
      if (sakuraData?.html) {
        const imgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
        const imageMatches = sakuraData.html.match(imgRegex) || [];
        const productImages = imageMatches
          .filter(
            (url: string) =>
              !url.includes('logo') &&
              !url.includes('icon') &&
              !url.includes('badge') &&
              !url.includes('arrow') &&
              !url.includes('close') &&
              (url.includes('uploads') || url.includes('cdn') || url.includes('sake'))
          )
          .slice(0, 5);
        productImages.forEach((url: string) => {
          results.push({ url, source: 'Sakura Sake Shop' });
        });
        debug.sourceCounts.sakura += productImages.length;

        const markdown = sakuraData.markdown || '';
        const typeMatch = markdown.match(
          /(?:Junmai Daiginjo|Junmai Ginjo|Junmai|Daiginjo|Ginjo|Honjozo|Tokubetsu Junmai|Tokubetsu Honjozo|Nigori|Sparkling|Nama|Futsushu)/i
        );
        const prefectureMatch = markdown.match(
          /(?:Miyagi|Yamagata|Niigata|Fukuoka|Saga|Hiroshima|Yamaguchi|Nagasaki|Kochi|Shiga|Mie|Gifu|Saitama|Gunma|Akita|Aomori|Osaka)/i
        );
        const polishMatch = markdown.match(/(\d+)%?\s*(?:精米|polishing|seimaibuai)/i);
        const abvMatch = markdown.match(/(?:ABV|Alcohol|ALC)[:\s]*(\d+(?:\.\d+)?)\s*%/i);
        if (typeMatch || prefectureMatch || polishMatch || abvMatch) {
          sakeData = {
            type: typeMatch?.[0],
            prefecture: prefectureMatch?.[0],
            polishingRatio: polishMatch ? parseInt(polishMatch[1], 10) : undefined,
            alcoholPercentage: abvMatch ? parseFloat(abvMatch[1]) : undefined,
          };
        }
      }
      if (sakuraData?._error) {
        debug.firecrawlErrors.push(`sakura: ${sakuraData._error}`);
      }
    } catch (e) {
      console.error('Sakura Sake scrape error:', e);
    }

    const umamiMartUrl = `https://umamimart.com/search?q=${encodeURIComponent(name + ' sake')}&type=product`;
    try {
      const umamiData = await firecrawlScrape(firecrawlApiKey, {
        url: umamiMartUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        maxAge: 0,
      });
      if (umamiData?.html) {
        const imgRegex = /https:\/\/[^"'\s]+cdn\.shopify\.com[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
        const imageMatches = umamiData.html.match(imgRegex) || [];
        const productImages = imageMatches
          .filter(
            (url: string) =>
              url.includes('products') &&
              !url.includes('logo') &&
              !url.includes('icon') &&
              !url.includes('badge') &&
              !url.includes('collection')
          )
          .map((url: string) => url.replace(/_\d+x\d*\./, '_800x.'))
          .slice(0, 4);
        productImages.forEach((url: string) => {
          results.push({ url, source: 'Umami Mart' });
        });
        debug.sourceCounts.umami += productImages.length;

        if (!sakeData) {
          const markdown = umamiData.markdown || '';
          const typeMatch = markdown.match(
            /(?:Type|Category|Style)[:\s]*(Junmai|Daiginjo|Ginjo|Honjozo|Nigori|Sparkling|Nama|Futsushu)[^\n]*/i
          );
          const prefectureMatch = markdown.match(/(?:Prefecture|Region|Origin)[:\s]*([A-Za-z]+)/i);
          const polishMatch = markdown.match(/(?:Polish|Polishing|Rice Polishing|SMV)[:\s]*(\d+)%?/i);
          const abvMatch = markdown.match(/(?:ABV|Alcohol|ALC)[:\s]*(\d+(?:\.\d+)?)\s*%/i);
          if (typeMatch || prefectureMatch || polishMatch || abvMatch) {
            sakeData = {
              type: typeMatch?.[1],
              prefecture: prefectureMatch?.[1],
              polishingRatio: polishMatch ? parseInt(polishMatch[1], 10) : undefined,
              alcoholPercentage: abvMatch ? parseFloat(abvMatch[1]) : undefined,
            };
          }
        }
      }
      if (umamiData?._error) {
        debug.firecrawlErrors.push(`umami: ${umamiData._error}`);
      }
    } catch (e) {
      console.error('Umami Mart scrape error:', e);
    }

    if (nameJapanese) {
      const sakeTimesUrl = `https://en.sake-times.com/?s=${encodeURIComponent(nameJapanese)}`;
      try {
        const sakeTimesData = await firecrawlScrape(firecrawlApiKey, {
          url: sakeTimesUrl,
          formats: ['html'],
          onlyMainContent: true,
          maxAge: 0,
        });
        if (sakeTimesData?.html) {
          const imgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi;
          const imageMatches = sakeTimesData.html.match(imgRegex) || [];
          const sakeImages = imageMatches
            .filter(
              (url: string) =>
                !url.includes('logo') &&
                !url.includes('icon') &&
                !url.includes('avatar') &&
                url.includes('sake')
            )
            .slice(0, 3);
          sakeImages.forEach((url: string) => {
            results.push({ url, source: 'Sake Times' });
          });
          debug.sourceCounts.sakeTimes += sakeImages.length;
        }
        if (sakeTimesData?._error) {
          debug.firecrawlErrors.push(`sakeTimes: ${sakeTimesData._error}`);
        }
      } catch (e) {
        console.error('Sake Times scrape error:', e);
      }
    }
  }

  for (const searchQuery of searchQueries) {
    const googleResult = await scrapeGoogleImages(firecrawlApiKey, searchQuery);
    results.push(...googleResult.rows);
    debug.sourceCounts.google += googleResult.rows.length;
    if (googleResult.error) {
      debug.firecrawlErrors.push(`googleImages (${searchQuery.slice(0, 40)}): ${googleResult.error}`);
    }
    try {
      const bingRows = await scrapeBingImages(searchQuery);
      results.push(...bingRows);
      debug.sourceCounts.bing += bingRows.length;
    } catch (e) {
      console.error('Bing images scrape error:', e);
    }
    // Avoid over-fetching once we already have a healthy candidate pool.
    if (results.length >= 80) break;
  }

  const uniqueImages = results.filter(
    (img, index, self) => index === self.findIndex((t) => t.url === img.url)
  );
  const images = filterAndRankImages(
    uniqueImages,
    name,
    nameJapanese ?? undefined,
    brewery ?? undefined
  );

  return { images, sakeData, debug };
}
