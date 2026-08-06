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

/** Matrix/UI labels from Sakura export markdown — not product names. */
const INVALID_ENGLISH_SAKE_NAME =
  /^(full|light|medium|rich|modern|classic|keyword|fruity|bold|fresh|sweet|meaty|white|seafood|spicy|select|filter|search|menu|burger|international wine challenge|junmai daiginjo|junmai ginjo|tokubetsu junmai|junmai|daiginjo|ginjo|tokubetsu honjozo|honjozo|fruity & aromatic|light & dry|bold & aged|fresh & vivid|rich & savory|meaty food|white meats and salty food|seafood|spicy food|sweet food)$/i;

const PREFECTURE_ONLY_ENGLISH_NAME =
  /^(yamagata|niigata|hyogo|kyoto|hiroshima|fukushima|nagano|yamaguchi|miyagi|osaka|fukuoka|tokyo|hokkaido|aichi|ishikawa|gifu|okayama|kagoshima|nara|shizuoka|ibaraki|tochigi|gunma|saitama|chiba|kanagawa|mie|wakayama|tottori|shimane|ehime|kochi|tokushima|kagawa|oita|miyazaki|kumamoto|saga|nagasaki|okinawa|aomori|iwate|akita|fukui|yamanashi|nagano)$/i;

function isInvalidEnglishSakeName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 4) return true;
  if (INVALID_ENGLISH_SAKE_NAME.test(trimmed)) return true;
  if (PREFECTURE_ONLY_ENGLISH_NAME.test(trimmed)) return true;
  if (/^(modern|classic)-(light|medium|full|rich)$/i.test(trimmed)) return true;
  return false;
}

/**
 * Prefer a valid English product name for `ScrapedSake.name` so catalog matching
 * against English `sake.name` rows works. Japanese is always kept in nameJapanese.
 * Preferring Japanese here caused missed matches and duplicate inserts when the
 * catalog row had English name + null/different name_japanese.
 */
function resolveSakeDisplayName(englishName: string, japaneseName: string): string | null {
  const eng = englishName.trim();
  if (eng && !isInvalidEnglishSakeName(eng)) return eng;
  const jp = japaneseName.trim();
  if (jp) return jp;
  return null;
}

function isLikelyProductImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.startsWith('http') || lower.length < 24) return false;
  if (/\.(json|svg|gif)(\?|$)/i.test(lower)) return false;

  const hasImageExt = /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(lower);
  const excluded =
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('arrow') ||
    lower.includes('close') ||
    lower.includes('favicon') ||
    lower.includes('sprite') ||
    lower.includes('burger-menu');

  if (excluded) return false;
  if (hasImageExt) return true;

  return (
    (lower.includes('/images/') || lower.includes('/uploads/')) &&
    !lower.includes('website-files.com')
  );
}

function normalizeHtmlForUrlExtraction(html: string): string {
  return html.replace(/\\\//g, '/');
}

/** Collect likely product image URLs from a markdown/HTML fragment (order preserved). */
export function collectProductImageUrls(fragment: string): string[] {
  const normalized = normalizeHtmlForUrlExtraction(fragment);
  const candidateUrls: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let u = decodeEscapedUrl(raw);
    // Bare URL sweeps often capture a trailing markdown/HTML delimiter.
    u = u.replace(/[),.;]+$/g, '');
    if (u.startsWith('//')) u = `https:${u}`;
    if (u.startsWith('/')) u = `https://export.sakurasaketen.com${u}`;
    if (!u.startsWith('http')) return;
    if (!isLikelyProductImage(u)) return;
    if (u.includes('google') || u.includes('gstatic')) return;
    if (seen.has(u)) return;
    seen.add(u);
    candidateUrls.push(u);
  };

  const srcAttrRegex = /(?:src|data-src|data-image|data-original|poster)=["']([^"']+)["']/gi;
  const srcSetRegex = /srcset=["']([^"']+)["']/gi;
  const mdImgRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gi;
  const jsonUrlRegex = /"url"\s*:\s*"([^"]+)"/gi;
  const directUrlRegex = /https?:\/\/[^\s"'<>]+/gi;

  for (const match of normalized.matchAll(mdImgRegex)) {
    if (match[1]) push(match[1]);
  }

  for (const match of normalized.matchAll(srcAttrRegex)) {
    if (match[1]) push(match[1]);
  }

  for (const match of normalized.matchAll(srcSetRegex)) {
    if (!match[1]) continue;
    const srcSetParts = match[1].split(',').map((part: string) => part.trim().split(' ')[0]);
    srcSetParts.forEach((part: string) => push(part));
  }

  for (const match of normalized.matchAll(jsonUrlRegex)) {
    if (match[1]) push(match[1]);
  }

  const directMatches = normalized.match(directUrlRegex) || [];
  directMatches.forEach((raw: string) => push(raw));

  return candidateUrls;
}

/**
 * Parse Firecrawl markdown (+ optional HTML) into scraped sakes.
 * Images are bound only from the same product card/block — never zipped by
 * global HTML image list index (that assigned wrong bottles to products).
 */
export function parseSakuraScrapeContent(markdown: string, _html = ''): ScrapedSake[] {
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

      // Allow digits (Dassai 45, Kubota Senju 2020) — prior regex dropped them and
      // let the next type line (Junmai Daiginjo) become the product name.
      if (
        /^[A-Z][A-Za-z0-9\s"'().-]+$/.test(trimmed) &&
        trimmed.length > 3 &&
        trimmed.length < 100 &&
        !englishName
      ) {
        if (!isInvalidEnglishSakeName(trimmed)) {
          englishName = trimmed;
        }
      }
    }

    const displayName = resolveSakeDisplayName(englishName, japaneseName);
    if (displayName) {
      const sake: ScrapedSake = {
        name: displayName,
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

      // Bind image from this card only. Missing image is better than a sibling SKU.
      const blockImage = collectProductImageUrls(block)[0];
      if (blockImage) sake.imageUrl = blockImage;

      if (matrixMatch) {
        /* matrix label only — type may come from typeMatch */
      }

      sakes.push(sake);
    }
  }

  return sakes.filter(
    (sake, index, self) => index === self.findIndex((s) => s.name === sake.name)
  );
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
  const sakes = parseSakuraScrapeContent(markdown, html);

  return { sakes, url };
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
