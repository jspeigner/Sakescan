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

/** Grade / style tokens that may extend a product name without meaning a different SKU. */
const PRODUCT_NAME_GRADE_TOKENS = new Set([
  'junmai',
  'ginjo',
  'daiginjo',
  'honjozo',
  'tokubetsu',
  'nigori',
  'nama',
  'sparkling',
  'futsushu',
  'genshu',
  'kimoto',
  'yamahai',
  'muroka',
  'sake',
]);

function hasCjk(value: string): boolean {
  return /[\u3040-\u9faf]/.test(value);
}

/**
 * True when two normalized product names refer to the same SKU.
 * Rejects naive romanized substring matches ("Kubota" ⊆ "Kubota Manju",
 * "Dassai" ⊆ "Dassai 23") that previously updated the wrong catalog row.
 * Japanese names still allow containment — polishing phrases are commonly appended.
 */
export function productNamesCompatible(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;

  // JP catalog strings often append 磨き / grade phrases after the brand.
  if (hasCjk(left) && hasCjk(right)) {
    const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
    return shorter.length >= 2 && longer.includes(shorter);
  }

  const tokensA = left.split(/\s+/).filter(Boolean);
  const tokensB = right.split(/\s+/).filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const shorterSet = new Set(shorter);
  // Every token in the shorter name must appear in the longer.
  if (!shorter.every((t) => longer.includes(t))) return false;

  // Number tokens identify polishing grades / SKU lines — must agree.
  const nums = (tokens: string[]) => tokens.filter((t) => /\d/.test(t));
  const longerNums = nums(longer);
  const shorterNums = new Set(nums(shorter));
  for (const n of longerNums) {
    if (!shorterNums.has(n)) return false;
  }

  // Extra non-numeric tokens on the longer name must be style/grade words only.
  // "manju", "beyond", brand sub-lines → distinct products.
  const extras = longer.filter((t) => !shorterSet.has(t) && !/\d/.test(t));
  return extras.every((t) => PRODUCT_NAME_GRADE_TOKENS.has(t));
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
    productNamesCompatible(scrapedJapanese, existingJapanese);

  const nameMatch =
    japaneseMatch || productNamesCompatible(scrapedName, existingName);

  // Require a product-name match. Brewery-only matching incorrectly attaches every
  // new product from a known brewery onto the first existing row for that brewery,
  // overwriting images/metadata and suppressing inserts of distinct products.
  if (!nameMatch) return false;

  if (scraped.brewery && existing.brewery) {
    const scrapedBrewery = scraped.brewery.toLowerCase();
    const existingBrewery = existing.brewery.toLowerCase();
    return (
      existingBrewery.includes(scrapedBrewery) || scrapedBrewery.includes(existingBrewery)
    );
  }

  return true;
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
