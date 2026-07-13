/**
 * Fill sparse sake specs (polishing, ABV, rice, SMV) from description text
 * and Sakura listing when available. Never overwrites non-null fields.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { scrapeSakuraListing, type ScrapedSake } from './scrapeSakuraCore.js';

export type SpecEnrichResult = {
  attempted: number;
  updated: number;
  fromDescription: number;
  fromSakura: number;
  errors: string[];
};

type SakeSpecRow = {
  id: string;
  name: string;
  name_japanese: string | null;
  brewery: string;
  description: string | null;
  rice_variety: string | null;
  polishing_ratio: number | null;
  alcohol_percentage: number | null;
  smv: number | null;
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3040-\u9faf]+/g, ' ').trim();
}

function parseSpecsFromText(text: string): Partial<{
  polishing_ratio: number;
  alcohol_percentage: number;
  smv: number;
  rice_variety: string;
}> {
  const out: Partial<{
    polishing_ratio: number;
    alcohol_percentage: number;
    smv: number;
    rice_variety: string;
  }> = {};

  const polish =
    text.match(/(?:polishing|seimai|精米歩合)\s*[:：]?\s*(\d{1,2}(?:\.\d)?)\s*%?/i) ||
    text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:polished|milling|精米)/i);
  if (polish) {
    const n = Number(polish[1]);
    if (n > 0 && n <= 100) out.polishing_ratio = n;
  }

  const abv =
    text.match(/(?:alcohol|abv|alc\.?|アルコール)\s*[:：]?\s*(\d{1,2}(?:\.\d)?)\s*%?/i) ||
    text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:abv|alcohol)/i);
  if (abv) {
    const n = Number(abv[1]);
    if (n >= 5 && n <= 25) out.alcohol_percentage = n;
  }

  const smv = text.match(/(?:smv|sake\s*meter|日本酒度)\s*[:：]?\s*([+-]?\d{1,2}(?:\.\d)?)/i);
  if (smv) {
    const n = Number(smv[1]);
    if (!Number.isNaN(n) && n >= -20 && n <= 20) out.smv = n;
  }

  const rice =
    text.match(/(?:rice|品種|使用米)\s*[:：]?\s*([A-Za-z\u3040-\u9faf][A-Za-z\u3040-\u9faf\s-]{2,40})/i) ||
    text.match(/\b(Yamada\s*Nishiki|Gohyakumangoku|Omachi|Miyama\s*Nishiki|山田錦|五百万石|雄町|美山錦)\b/i);
  if (rice?.[1]) {
    out.rice_variety = rice[1].trim().slice(0, 80);
  }

  return out;
}

function matchesScraped(scraped: ScrapedSake, row: SakeSpecRow): boolean {
  const sn = normalizeName(scraped.name);
  const en = normalizeName(row.name);
  const sj = scraped.nameJapanese ? normalizeName(scraped.nameJapanese) : '';
  const ej = row.name_japanese ? normalizeName(row.name_japanese) : '';
  const nameOk =
    (sj && ej && (sj.includes(ej) || ej.includes(sj))) ||
    en.includes(sn) ||
    sn.includes(en);
  if (!nameOk) return false;
  if (!scraped.brewery || !row.brewery) return true;
  return row.brewery.toLowerCase().includes(scraped.brewery.toLowerCase()) ||
    scraped.brewery.toLowerCase().includes(row.brewery.toLowerCase());
}

export async function enrichSakeSpecsBatch(
  supabase: SupabaseClient,
  options?: { batchSize?: number; firecrawlKey?: string }
): Promise<SpecEnrichResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 40, 10), 80);
  const errors: string[] = [];
  let updated = 0;
  let fromDescription = 0;
  let fromSakura = 0;

  const { data: rows, error } = await supabase
    .from('sake')
    .select(
      'id, name, name_japanese, brewery, description, rice_variety, polishing_ratio, alcohol_percentage, smv'
    )
    .or(
      'polishing_ratio.is.null,alcohol_percentage.is.null,rice_variety.is.null,smv.is.null'
    )
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    return {
      attempted: 0,
      updated: 0,
      fromDescription: 0,
      fromSakura: 0,
      errors: [error.message],
    };
  }

  const batch = (rows || []) as SakeSpecRow[];

  let sakuraCache: Awaited<ReturnType<typeof scrapeSakuraListing>> | null = null;
  if (options?.firecrawlKey && batch.length > 0) {
    try {
      sakuraCache = await scrapeSakuraListing(options.firecrawlKey, {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`sakura listing: ${msg.slice(0, 100)}`);
    }
  }

  for (const row of batch) {
    const patch: Record<string, unknown> = {};
    let source: 'description' | 'sakura' | null = null;

    if (row.description) {
      const parsed = parseSpecsFromText(row.description);
      if (row.polishing_ratio == null && parsed.polishing_ratio != null) {
        patch.polishing_ratio = parsed.polishing_ratio;
        source = 'description';
      }
      if (row.alcohol_percentage == null && parsed.alcohol_percentage != null) {
        patch.alcohol_percentage = parsed.alcohol_percentage;
        source = 'description';
      }
      if (row.smv == null && parsed.smv != null) {
        patch.smv = parsed.smv;
        source = 'description';
      }
      if (!row.rice_variety && parsed.rice_variety) {
        patch.rice_variety = parsed.rice_variety;
        source = 'description';
      }
    }

    if (sakuraCache?.sakes.length) {
      for (const scraped of sakuraCache.sakes) {
        if (!matchesScraped(scraped, row)) continue;
        const blob = [scraped.type, scraped.taste, scraped.prefecture].filter(Boolean).join(' ');
        const parsed = parseSpecsFromText(blob);
        if (row.polishing_ratio == null && parsed.polishing_ratio != null && patch.polishing_ratio == null) {
          patch.polishing_ratio = parsed.polishing_ratio;
          source = 'sakura';
        }
        if (
          row.alcohol_percentage == null &&
          parsed.alcohol_percentage != null &&
          patch.alcohol_percentage == null
        ) {
          patch.alcohol_percentage = parsed.alcohol_percentage;
          source = 'sakura';
        }
        if (row.smv == null && parsed.smv != null && patch.smv == null) {
          patch.smv = parsed.smv;
          source = 'sakura';
        }
        if (!row.rice_variety && parsed.rice_variety && !patch.rice_variety) {
          patch.rice_variety = parsed.rice_variety;
          source = 'sakura';
        }
        break;
      }
    }

    if (Object.keys(patch).length === 0) continue;

    patch.updated_at = new Date().toISOString();
    const { error: upErr } = await supabase.from('sake').update(patch).eq('id', row.id);
    if (upErr) {
      errors.push(`${row.name}: ${upErr.message.slice(0, 80)}`);
      continue;
    }
    updated++;
    if (source === 'sakura') fromSakura++;
    else if (source === 'description') fromDescription++;
  }

  return {
    attempted: batch.length,
    updated,
    fromDescription,
    fromSakura,
    errors,
  };
}
