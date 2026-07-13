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

/** Per-invocation bypass after Firecrawl quota/rate-limit (429) — use direct Google scrape only. */
let firecrawlBypassActive = false;

export function resetFirecrawlBypassForInvocation(): void {
  firecrawlBypassActive = false;
}

export function isFirecrawlBypassActive(): boolean {
  return firecrawlBypassActive;
}

function isFirecrawlQuotaError(status: number, message: string): boolean {
  if (status === 429) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('limit exceeded')
  );
}

function noteFirecrawlQuotaError(status: number, message: string): void {
  if (isFirecrawlQuotaError(status, message)) {
    firecrawlBypassActive = true;
  }
}

const JUNK_URL_REGEXES = [
  /shutterstock|gettyimages|istockphoto|dreamstime|alamy|123rf|depositphotos/i,
  /avatar|gravatar|favicon|emoji|sprite|profile[_-]?pic/i,
  /\/blog\/|\/news\/|\/articles?\/|infographic|diagram\.|chart\.png/i,
  /\.svg(\?|$)/i,
  /youtube\.|ytimg\.|facebook\.|fbcdn|instagram\.|cdninstagram|tiktok|pinterest\.|pinimg\./i,
  /wikipedia\.org\/static|wikimedia\.org\/.*\/thumb\/.*\/\d+px-/i,
  /mmajunkie|espn\.|bleacherreport|sports\.|usatoday\.com\/wp-content/i,
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
  if (source === 'Sakura Sake Shop') return 52;
  if (source === 'Umami Mart') return 50;
  if (source === 'Sake Times') return 48;
  if (source === 'Google Images') return 48;
  if (source === 'Bing Images') return 46;
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

    if (isTrustedRetailerSource(img.source)) {
      const u = img.url.toLowerCase();
      if (u.includes('logo') && !u.includes('bottle') && !u.includes('product')) return false;
      return true;
    }

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
  brewery?: string | null,
  maxQueries = 5
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

  return queries.slice(0, maxQueries);
}

/** Drop weak Bing/Google hits before expensive vision checks. */
export function prefilterDiscoverCandidates(
  images: SearchImageRow[],
  name: string,
  nameJapanese: string | undefined,
  brewery: string | undefined,
  options?: { minRelevance?: number; maxCandidates?: number }
): SearchImageRow[] {
  const minRel = options?.minRelevance ?? 2;
  const maxCandidates = options?.maxCandidates ?? 12;
  const tokens = searchTokens(name, nameJapanese, brewery);
  const scored = images
    .map((img) => ({
      img,
      score: relevanceScore(img.url, img.title, tokens) + sourcePriority(img.source),
      trusted: isTrustedRetailerSource(img.source),
    }))
    .filter(
      (x) =>
        x.trusted || relevanceScore(x.img.url, x.img.title, tokens) >= minRel
    )
    .sort((a, b) => {
      if (a.trusted !== b.trusted) return a.trusted ? -1 : 1;
      return b.score - a.score;
    });
  return scored.slice(0, maxCandidates).map((x) => x.img);
}

/** Reject obvious non-sake URLs before vision (cheap guard). */
export function urlLooksLikeNonSakeProduct(url: string): boolean {
  const h = url.toLowerCase();
  return NON_SAKE_PRODUCT_REGEXES.some((re) => re.test(h));
}

async function firecrawlScrapeV1(
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
      noteFirecrawlQuotaError(res.status, errText);
      return { _error: `v1 HTTP ${res.status}: ${errText.slice(0, 180)}` };
    }
    const json = (await res.json()) as { data?: { html?: string; markdown?: string } };
    return json.data ?? { _error: 'v1 empty data' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { _error: `v1 network: ${msg.slice(0, 180)}` };
  }
}

async function firecrawlScrapeV2(
  apiKey: string,
  url: string
): Promise<{ html?: string; _error?: string } | null> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['html'],
        onlyMainContent: false,
        maxAge: 0,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      noteFirecrawlQuotaError(res.status, errText);
      return { _error: `v2 HTTP ${res.status}: ${errText.slice(0, 180)}` };
    }
    const json = (await res.json()) as {
      data?: { html?: string };
      html?: string;
    };
    const html = json.data?.html ?? json.html;
    return html ? { html } : { _error: 'v2 empty html' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { _error: `v2 network: ${msg.slice(0, 180)}` };
  }
}

async function firecrawlScrape(
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ html?: string; markdown?: string; _error?: string } | null> {
  if (firecrawlBypassActive) {
    return { _error: 'Firecrawl bypass active (quota/rate limit)' };
  }

  const v1 = await firecrawlScrapeV1(apiKey, body);
  if (v1?.html) return v1;

  if (firecrawlBypassActive) {
    return { _error: v1?._error || 'Firecrawl bypass active (quota/rate limit)' };
  }

  const targetUrl = typeof body.url === 'string' ? body.url : '';
  if (targetUrl) {
    const v2 = await firecrawlScrapeV2(apiKey, targetUrl);
    if (v2?.html) return { html: v2.html, markdown: undefined };
    const err = [v1?._error, v2?._error].filter(Boolean).join(' | ');
    return { _error: err || 'Firecrawl v1/v2 returned no html' };
  }
  return v1;
}

function extractImageUrlsFromGoogleHtml(htmlContent: string): string[] {
  const patterns = [
    /"ou":"(https?:\/\/[^"\\]+)"/g,
    /"ou":"(https?:\\\/\\\/[^"\\]+)"/g,
    /\["(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*?)"/gi,
    /data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
    /imgurl=(https?:[^&"'\\]+)/gi,
    /"(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi,
  ];

  const foundUrls = new Set<string>();
  for (const pattern of patterns) {
    const matches = [...htmlContent.matchAll(pattern)];
    matches.forEach((match: RegExpMatchArray) => {
      let url = match[1];
      if (!url) return;
      url = url.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (!url.startsWith('http')) return;
      if (url.includes('google.com') || url.includes('gstatic.com') || url.includes('googleusercontent.com/logos')) {
        return;
      }
      foundUrls.add(url);
    });
  }
  return [...foundUrls];
}

async function scrapeGoogleImagesDirect(searchQuery: string): Promise<SearchImageRow[]> {
  const googleImagesUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;
  try {
    const res = await fetch(googleImagesUrl, {
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
    return extractImageUrlsFromGoogleHtml(html).slice(0, 24).map((url) => ({
      url,
      source: 'Google Images',
      title: searchQuery,
    }));
  } catch {
    return [];
  }
}

async function scrapeGoogleImages(
  firecrawlApiKey: string,
  searchQuery: string
): Promise<{ rows: SearchImageRow[]; error?: string }> {
  if (firecrawlBypassActive) {
    const directRows = await scrapeGoogleImagesDirect(searchQuery);
    if (directRows.length > 0) {
      return { rows: directRows };
    }
    return { rows: [], error: 'Firecrawl bypass active; direct Google returned no URLs' };
  }

  const googleImagesUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;
  const data = await firecrawlScrape(firecrawlApiKey, {
    url: googleImagesUrl,
    formats: ['html'],
    onlyMainContent: false,
    maxAge: 0,
  });
  if (data?.html) {
    const urls = extractImageUrlsFromGoogleHtml(data.html);
    if (urls.length > 0) {
      return {
        rows: urls.slice(0, 24).map((url) => ({
          url,
          source: 'Google Images',
          title: searchQuery,
        })),
      };
    }
  }

  const directRows = await scrapeGoogleImagesDirect(searchQuery);
  if (directRows.length > 0) {
    return { rows: directRows };
  }

  return { rows: [], error: data?._error || 'No Google image URLs (Firecrawl + direct)' };
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

export type SakeImageSearchMode = 'google-only' | 'google-only-fast' | 'trusted-first' | 'full';

const TRUSTED_RETAILER_SOURCES = new Set(['Sakura Sake Shop', 'Umami Mart', 'Sake Times']);

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
};

async function fetchHtmlDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractProductImagesFromHtml(
  html: string,
  filter: (url: string) => boolean,
  limit = 5
): string[] {
  const imgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
  const matches = html.match(imgRegex) || [];
  return matches.filter(filter).slice(0, limit);
}

/** Fast direct HTTP scrape of Sakura/Umami/Sake Times — no Firecrawl. */
export async function searchTrustedRetailerCandidatesDirect(
  params: { name: string; nameJapanese?: string | null; brewery?: string | null }
): Promise<{ images: SearchImageRow[]; debug: Pick<SakeSearchDebug, 'sourceCounts'> }> {
  const { name, nameJapanese } = params;
  const results: SearchImageRow[] = [];
  const debug: Pick<SakeSearchDebug, 'sourceCounts'> = {
    sourceCounts: { google: 0, bing: 0, sakura: 0, umami: 0, sakeTimes: 0 },
  };

  const sakuraUrl = `https://export.sakurasaketen.com/sake?Keyword=${encodeURIComponent(name)}`;
  const sakuraHtml = await fetchHtmlDirect(sakuraUrl);
  if (sakuraHtml) {
    const productImages = extractProductImagesFromHtml(
      sakuraHtml,
      (url) =>
        !url.includes('logo') &&
        !url.includes('icon') &&
        !url.includes('badge') &&
        !url.includes('arrow') &&
        !url.includes('close') &&
        (url.includes('uploads') || url.includes('cdn') || url.includes('sake')),
      5
    );
    productImages.forEach((url) => results.push({ url, source: 'Sakura Sake Shop' }));
    debug.sourceCounts.sakura += productImages.length;
  }

  const umamiUrl = `https://umamimart.com/search?q=${encodeURIComponent(name + ' sake')}&type=product`;
  const umamiHtml = await fetchHtmlDirect(umamiUrl);
  if (umamiHtml) {
    const shopifyRegex =
      /https:\/\/[^"'\s]+cdn\.shopify\.com[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
    const imageMatches = umamiHtml.match(shopifyRegex) || [];
    const productImages = imageMatches
      .filter(
        (url) =>
          url.includes('products') &&
          !url.includes('logo') &&
          !url.includes('icon') &&
          !url.includes('badge') &&
          !url.includes('collection')
      )
      .map((url) => url.replace(/_\d+x\d*\./, '_800x.'))
      .slice(0, 4);
    productImages.forEach((url) => results.push({ url, source: 'Umami Mart' }));
    debug.sourceCounts.umami += productImages.length;
  }

  if (nameJapanese) {
    const sakeTimesUrl = `https://en.sake-times.com/?s=${encodeURIComponent(nameJapanese)}`;
    const sakeTimesHtml = await fetchHtmlDirect(sakeTimesUrl);
    if (sakeTimesHtml) {
      const sakeImages = extractProductImagesFromHtml(
        sakeTimesHtml,
        (url) =>
          !url.includes('logo') &&
          !url.includes('icon') &&
          !url.includes('avatar') &&
          url.includes('sake'),
        3
      );
      sakeImages.forEach((url) => results.push({ url, source: 'Sake Times' }));
      debug.sourceCounts.sakeTimes += sakeImages.length;
    }
  }

  return { images: results, debug };
}

/** Curated retailer sources — vision optional; download still validates the asset. */
export function isTrustedRetailerSource(source: string): boolean {
  return TRUSTED_RETAILER_SOURCES.has(source);
}

export async function searchSakeImageCandidates(
  firecrawlApiKey: string,
  params: { name: string; nameJapanese?: string | null; brewery?: string | null },
  mode: SakeImageSearchMode
): Promise<{ images: SearchImageRow[]; sakeData?: SakeSearchMeta; debug: SakeSearchDebug }> {
  const { name, nameJapanese, brewery } = params;
  const fastMode = mode === 'google-only-fast' || mode === 'trusted-first';
  const searchQueries = buildSakeImageSearchQueries(
    name,
    nameJapanese ?? undefined,
    brewery ?? undefined,
    fastMode ? 2 : 5
  );
  const candidatePoolTarget = fastMode ? 36 : 80;
  const results: SearchImageRow[] = [];
  let sakeData: SakeSearchMeta | undefined;
  const debug: SakeSearchDebug = {
    sourceCounts: { google: 0, bing: 0, sakura: 0, umami: 0, sakeTimes: 0 },
    firecrawlErrors: [],
  };

  // Always try trusted retailers first (direct HTTP — fast, no vision needed).
  const trustedDirect = await searchTrustedRetailerCandidatesDirect(params);
  results.push(...trustedDirect.images);
  debug.sourceCounts.sakura += trustedDirect.debug.sourceCounts.sakura;
  debug.sourceCounts.umami += trustedDirect.debug.sourceCounts.umami;
  debug.sourceCounts.sakeTimes += trustedDirect.debug.sourceCounts.sakeTimes;

  if (mode === 'full' && !firecrawlBypassActive) {
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

  const skipWebSearch = mode === 'trusted-first' && results.length >= 2;

  if (!skipWebSearch) {
    for (const searchQuery of searchQueries) {
      const googleResult = await scrapeGoogleImages(firecrawlApiKey, searchQuery);
      results.push(...googleResult.rows);
      debug.sourceCounts.google += googleResult.rows.length;
      if (googleResult.error) {
        debug.firecrawlErrors.push(`googleImages (${searchQuery.slice(0, 40)}): ${googleResult.error}`);
      }
      if (results.length < 8 || !fastMode) {
        try {
          const bingRows = await scrapeBingImages(searchQuery);
          results.push(...bingRows);
          debug.sourceCounts.bing += bingRows.length;
        } catch (e) {
          console.error('Bing images scrape error:', e);
        }
      }
      if (results.length >= candidatePoolTarget) break;
    }
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
