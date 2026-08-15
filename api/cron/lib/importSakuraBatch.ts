import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllSelectPages } from '../../lib/fetchAllSelectPages.js';
import { downloadAndStoreWithRetry } from './imageMirror.js';
import {
  getBackfillState,
  setBackfillState,
  type SakuraImportState,
} from './backfillState.js';
import {
  provenanceForTrustedRetailer,
  sakeImageUpdatePayload,
  shouldReplaceImage,
} from './imageProvenance.js';
import {
  SAKURA_FILTER_ROTATION,
  scrapeSakuraListing,
  type ScrapedSake,
} from './scrapeSakuraCore.js';

const SAKURA_STATE_KEY = 'sakura_import';

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3040-\u9faf]+/g, ' ').trim();
}

const CORPORATE_SUFFIX_RE =
  /\s*(?:co\.?\s*,?\s*ltd\.?|co\.?|ltd\.?|inc\.?|llc|corp\.?|kk|株式会社|有限会社)\.?$/i;

/** Tokens that are too generic to prove two brewery strings are the same house. */
const GENERIC_BREWERY_TOKENS = new Set([
  'sake',
  'brewery',
  'brewing',
  'company',
  'shuzo',
  'shuzou',
  'syuzo',
  '酒造',
]);

/**
 * True when two brewery labels refer to the same house.
 * Rejects substring traps ("Asahi" ⊆ "Tamaasahi", "Ito" ⊆ "Itou") that
 * bidirectional `includes()` previously accepted.
 */
export function breweryNamesCompatible(a: string, b: string): boolean {
  const normalizeBrewery = (value: string): string => {
    const stripped = value.trim().replace(CORPORATE_SUFFIX_RE, '').replace(/[.,\s]+$/g, '').trim();
    return normalizeName(stripped || value)
      .replace(/\bshuzou\b/g, 'shuzo')
      .replace(/\bsyuzo\b/g, 'shuzo');
  };

  const left = normalizeBrewery(a);
  const right = normalizeBrewery(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const tokens = (value: string): string[] =>
    value
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !GENERIC_BREWERY_TOKENS.has(t));

  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const [shorter, longer] =
    leftTokens.length <= rightTokens.length
      ? [leftTokens, rightTokens]
      : [rightTokens, leftTokens];

  // Every distinctive token of the shorter label must appear as a whole token.
  return shorter.every((t) => longer.includes(t));
}

/** True when a scraped Sakura row is the same product as an existing catalog sake. */
export function matchesExisting(
  scraped: ScrapedSake,
  existing: {
    id: string;
    name: string;
    name_japanese: string | null;
    brewery: string;
    image_url: string | null;
    description: string | null;
    type: string | null;
    prefecture: string | null;
  }
): boolean {
  const scrapedName = normalizeName(scraped.name);
  const existingName = normalizeName(existing.name);
  if (!scrapedName || !existingName) return false;

  const scrapedJapanese = scraped.nameJapanese ? normalizeName(scraped.nameJapanese) : '';
  const existingJapanese = existing.name_japanese ? normalizeName(existing.name_japanese) : '';
  const japaneseMatch =
    scrapedJapanese.length > 0 &&
    existingJapanese.length > 0 &&
    (existingJapanese.includes(scrapedJapanese) || scrapedJapanese.includes(existingJapanese));

  const nameMatch =
    japaneseMatch ||
    existingName.includes(scrapedName) ||
    scrapedName.includes(existingName);

  // Require a product-name match. Brewery-only matching incorrectly attaches every
  // new product from a known brewery onto the first existing row for that brewery,
  // overwriting images/metadata and suppressing inserts of distinct products.
  if (!nameMatch) return false;

  // Destructive image/metadata writes — require brewery on both sides.
  // Missing brewery previously returned true (name-only), and Sakura often fails
  // to parse the brewery line, so the first English-name hit was updated instead
  // of inserting a new row (insert path also requires brewery).
  const scrapedBrewery = scraped.brewery?.trim() ?? '';
  const existingBrewery = existing.brewery?.trim() ?? '';
  if (!scrapedBrewery || !existingBrewery) return false;

  return breweryNamesCompatible(scrapedBrewery, existingBrewery);
}

function buildDescriptionFromScraped(scraped: ScrapedSake): string | null {
  const parts: string[] = [];
  if (scraped.type) parts.push(scraped.type);
  if (scraped.taste) parts.push(scraped.taste);
  if (scraped.prefecture) parts.push(`from ${scraped.prefecture}`);
  if (scraped.foodPairing?.length) {
    parts.push(`pairs with ${scraped.foodPairing.join(', ')}`);
  }
  if (parts.length === 0) return null;
  const brewery = scraped.brewery ? `${scraped.brewery} ` : '';
  return `${brewery}${scraped.name} — ${parts.join(' · ')}.`.slice(0, 500);
}

export type SakuraBatchResult = {
  filterIndex: number;
  filter: (typeof SAKURA_FILTER_ROTATION)[number];
  scraped: number;
  matched: number;
  updated: number;
  inserted: number;
  imageStored: number;
  errors: string[];
};

export async function runSakuraImportBatch(
  supabase: SupabaseClient,
  supabaseUrl: string,
  firecrawlApiKey: string,
  options?: { pagesPerRun?: number }
): Promise<SakuraBatchResult> {
  const pagesPerRun = options?.pagesPerRun ?? 1;
  const state = await getBackfillState<SakuraImportState>(supabase, SAKURA_STATE_KEY, {
    filterIndex: 0,
    runsAtFilter: 0,
  });

  const errors: string[] = [];
  let scrapedTotal = 0;
  let matched = 0;
  let updated = 0;
  let inserted = 0;
  let imageStored = 0;
  const seenHashes = new Set<string>();
  const knownPlaceholderHashes = new Set<string>();

  type ExistingSakeRow = {
    id: string;
    name: string;
    name_japanese: string | null;
    brewery: string;
    image_url: string | null;
    image_quality: string | null;
    description: string | null;
    type: string | null;
    prefecture: string | null;
  };

  // Must page at PostgREST max-rows (~1000). A 5000-sized range still returns ≤1000
  // rows, so `data.length < 5000` stopped after the first page and treated the rest
  // of the catalog as missing → duplicate inserts on every Sakura batch.
  const existingSakes = await fetchAllSelectPages<ExistingSakeRow>(async (from, to) => {
    const { data, error } = await supabase
      .from('sake')
      .select('id, name, name_japanese, brewery, image_url, image_quality, description, type, prefecture')
      .range(from, to);
    return { data: data as ExistingSakeRow[] | null, error };
  });

  let filterIndex = state.filterIndex % SAKURA_FILTER_ROTATION.length;

  for (let page = 0; page < pagesPerRun; page++) {
    const filter = SAKURA_FILTER_ROTATION[filterIndex];
    try {
      const { sakes } = await scrapeSakuraListing(firecrawlApiKey, filter);
      scrapedTotal += sakes.length;

      for (const scraped of sakes) {
        const match = (existingSakes || []).find((row) => matchesExisting(scraped, row));

        if (match) {
          matched++;
          const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          let changed = false;

          if (
            scraped.imageUrl &&
            shouldReplaceImage(match.image_quality, match.image_url, 't1')
          ) {
            try {
              const stored = await downloadAndStoreWithRetry(
                supabase,
                scraped.imageUrl,
                'sake-images',
                scraped.name,
                seenHashes,
                knownPlaceholderHashes
              );
              if (!stored.skippedPlaceholder && !stored.skippedDuplicate && !stored.rateLimited) {
                Object.assign(patch, sakeImageUpdatePayload(stored.url, provenanceForTrustedRetailer()));
                imageStored++;
                changed = true;
                match.image_url = stored.url;
                match.image_quality = 't1';
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              errors.push(`image ${scraped.name}: ${msg.slice(0, 100)}`);
            }
          }

          if (!match.description) {
            const desc = buildDescriptionFromScraped(scraped);
            if (desc) {
              patch.description = desc;
              changed = true;
            }
          }
          if (!match.name_japanese && scraped.nameJapanese) {
            patch.name_japanese = scraped.nameJapanese;
            changed = true;
          }
          if (!match.type && scraped.type) {
            patch.type = scraped.type;
            changed = true;
          }
          if (!match.prefecture && scraped.prefecture) {
            patch.prefecture = scraped.prefecture;
            changed = true;
          }

          if (changed) {
            const { error: upErr } = await supabase.from('sake').update(patch).eq('id', match.id);
            if (upErr) errors.push(`update ${scraped.name}: ${upErr.message.slice(0, 80)}`);
            else updated++;
          }
        } else if (scraped.name && scraped.brewery) {
          let imageUrl: string | null = null;
          if (scraped.imageUrl) {
            try {
              const stored = await downloadAndStoreWithRetry(
                supabase,
                scraped.imageUrl,
                'sake-images',
                scraped.name,
                seenHashes,
                knownPlaceholderHashes
              );
              if (!stored.skippedPlaceholder && !stored.skippedDuplicate && !stored.rateLimited) {
                imageUrl = stored.url;
                imageStored++;
              }
            } catch {
              /* skip external on insert failure */
            }
          }

          const insertRow: Record<string, unknown> = {
            name: scraped.name,
            name_japanese: scraped.nameJapanese ?? null,
            brewery: scraped.brewery,
            type: scraped.type ?? null,
            prefecture: scraped.prefecture ?? null,
            description: buildDescriptionFromScraped(scraped),
            image_url: imageUrl,
            total_ratings: 0,
          };
          if (imageUrl) {
            Object.assign(insertRow, sakeImageUpdatePayload(imageUrl, provenanceForTrustedRetailer()));
          }

          const { error: insErr } = await supabase.from('sake').insert(insertRow);

          if (insErr) errors.push(`insert ${scraped.name}: ${insErr.message.slice(0, 80)}`);
          else inserted++;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`scrape filter ${filterIndex}: ${msg.slice(0, 120)}`);
    }

    filterIndex = (filterIndex + 1) % SAKURA_FILTER_ROTATION.length;
  }

  await setBackfillState(supabase, SAKURA_STATE_KEY, {
    filterIndex,
    runsAtFilter: state.runsAtFilter + 1,
  });

  return {
    filterIndex,
    filter: SAKURA_FILTER_ROTATION[(filterIndex - 1 + SAKURA_FILTER_ROTATION.length) % SAKURA_FILTER_ROTATION.length],
    scraped: scrapedTotal,
    matched,
    updated,
    inserted,
    imageStored,
    errors,
  };
}

export async function countHostedSakeImages(
  supabase: SupabaseClient,
  supabaseUrl: string
): Promise<number> {
  const host = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0];
  const { count } = await supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .ilike('image_url', `%${host}%`);
  return count ?? 0;
}
