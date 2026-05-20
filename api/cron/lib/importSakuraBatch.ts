import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadAndStoreWithRetry } from './imageMirror.js';
import {
  getBackfillState,
  setBackfillState,
  type SakuraImportState,
} from './backfillState.js';
import {
  SAKURA_FILTER_ROTATION,
  scrapeSakuraListing,
  type ScrapedSake,
} from './scrapeSakuraCore.js';

const SAKURA_STATE_KEY = 'sakura_import';

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3040-\u9faf]+/g, ' ').trim();
}

function matchesExisting(
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

  const breweryMatch =
    scraped.brewery &&
    existing.brewery &&
    existing.brewery.toLowerCase().includes(scraped.brewery.toLowerCase());

  return Boolean(nameMatch || (breweryMatch && scrapedName.length > 3));
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

  const { data: existingSakes, error: fetchError } = await supabase
    .from('sake')
    .select('id, name, name_japanese, brewery, image_url, description, type, prefecture')
    .limit(5000);

  if (fetchError) throw new Error(fetchError.message);

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
          const patch: Record<string, string | null> = {
            updated_at: new Date().toISOString(),
          };
          let changed = false;

          if (!match.image_url && scraped.imageUrl) {
            try {
              const stored = await downloadAndStoreWithRetry(
                supabase,
                scraped.imageUrl,
                'sake-images',
                scraped.name,
                seenHashes,
                knownPlaceholderHashes
              );
              if (!stored.skippedPlaceholder && !stored.rateLimited) {
                patch.image_url = stored.url;
                imageStored++;
                changed = true;
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
              if (!stored.skippedPlaceholder && !stored.rateLimited) {
                imageUrl = stored.url;
                imageStored++;
              }
            } catch {
              /* skip external on insert failure */
            }
          }

          const { error: insErr } = await supabase.from('sake').insert({
            name: scraped.name,
            name_japanese: scraped.nameJapanese ?? null,
            brewery: scraped.brewery,
            type: scraped.type ?? null,
            prefecture: scraped.prefecture ?? null,
            description: buildDescriptionFromScraped(scraped),
            image_url: imageUrl,
            total_ratings: 0,
          });

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
