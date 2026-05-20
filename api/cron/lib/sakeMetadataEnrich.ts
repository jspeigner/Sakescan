import type { SupabaseClient } from '@supabase/supabase-js';
import { scrapeSakuraListing } from './scrapeSakuraCore.js';

export type MetadataEnrichResult = {
  attempted: number;
  enriched: number;
  fromSakura: number;
  fromLlm: number;
  fromStructured: number;
  errors: string[];
};

type SakeRow = {
  id: string;
  name: string;
  name_japanese: string | null;
  brewery: string;
  type: string | null;
  prefecture: string | null;
  region: string | null;
  rice_variety: string | null;
  polishing_ratio: number | null;
  alcohol_percentage: number | null;
  description: string | null;
};

function buildStructuredDescription(row: SakeRow): string | null {
  const parts: string[] = [];
  if (row.type) parts.push(row.type);
  if (row.prefecture || row.region) {
    parts.push(`from ${row.prefecture ?? row.region}`);
  }
  if (row.rice_variety) parts.push(`rice: ${row.rice_variety}`);
  if (row.polishing_ratio != null) parts.push(`polishing ${row.polishing_ratio}%`);
  if (row.alcohol_percentage != null) parts.push(`${row.alcohol_percentage}% ABV`);
  if (parts.length === 0) return null;
  return `${row.brewery} ${row.name} — ${parts.join(' · ')}.`.slice(0, 480);
}

async function llmDescription(
  openaiKey: string,
  row: SakeRow
): Promise<string | null> {
  const prompt = `Write one factual sentence (max 220 chars) describing this Japanese sake for a catalog. No marketing fluff.
Name: ${row.name}
Japanese: ${row.name_japanese ?? 'n/a'}
Brewery: ${row.brewery}
Type: ${row.type ?? 'n/a'}
Prefecture: ${row.prefecture ?? 'n/a'}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You write concise sake catalog descriptions.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.3,
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  return text ? text.slice(0, 500) : null;
}

function findSakuraDescription(
  scraped: { name: string; nameJapanese?: string; brewery?: string; type?: string; taste?: string; prefecture?: string },
  row: SakeRow
): string | null {
  const nameKey = row.name.toLowerCase();
  if (!scraped.name.toLowerCase().includes(nameKey) && !nameKey.includes(scraped.name.toLowerCase())) {
    if (
      row.name_japanese &&
      scraped.nameJapanese &&
      !row.name_japanese.includes(scraped.nameJapanese) &&
      !scraped.nameJapanese.includes(row.name_japanese)
    ) {
      return null;
    }
  }
  const parts: string[] = [];
  if (scraped.type) parts.push(scraped.type);
  if (scraped.taste) parts.push(scraped.taste);
  if (scraped.prefecture) parts.push(`from ${scraped.prefecture}`);
  if (parts.length === 0) return null;
  return `${row.brewery} ${row.name} — ${parts.join(' · ')}.`.slice(0, 500);
}

export async function enrichSakeMetadataBatch(
  supabase: SupabaseClient,
  options: {
    batchSize?: number;
    firecrawlKey?: string;
    openaiKey?: string;
  }
): Promise<MetadataEnrichResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 30, 5), 40);
  const errors: string[] = [];
  let enriched = 0;
  let fromSakura = 0;
  let fromLlm = 0;
  let fromStructured = 0;

  const { data: rows, error } = await supabase
    .from('sake')
    .select(
      'id, name, name_japanese, brewery, type, prefecture, region, rice_variety, polishing_ratio, alcohol_percentage, description'
    )
    .is('description', null)
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  if (error) throw new Error(error.message);
  const batch = (rows || []) as SakeRow[];

  let sakuraCache: Awaited<ReturnType<typeof scrapeSakuraListing>> | null = null;
  if (options.firecrawlKey && batch.length > 0) {
    try {
      sakuraCache = await scrapeSakuraListing(options.firecrawlKey, {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`sakura listing: ${msg.slice(0, 100)}`);
    }
  }

  for (const row of batch) {
    let description: string | null = null;
    let source: 'structured' | 'sakura' | 'llm' | null = null;

    if (sakuraCache?.sakes.length) {
      for (const scraped of sakuraCache.sakes) {
        const d = findSakuraDescription(scraped, row);
        if (d) {
          description = d;
          source = 'sakura';
          break;
        }
      }
    }

    if (!description) {
      description = buildStructuredDescription(row);
      if (description) source = 'structured';
    }

    if (!description && options.openaiKey) {
      try {
        description = await llmDescription(options.openaiKey, row);
        if (description) source = 'llm';
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`llm ${row.name}: ${msg.slice(0, 80)}`);
      }
    }

    if (!description) continue;

    const { error: upErr } = await supabase
      .from('sake')
      .update({ description, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (upErr) {
      errors.push(`update ${row.name}: ${upErr.message.slice(0, 80)}`);
      continue;
    }

    enriched++;
    if (source === 'sakura') fromSakura++;
    else if (source === 'llm') fromLlm++;
    else if (source === 'structured') fromStructured++;
  }

  return {
    attempted: batch.length,
    enriched,
    fromSakura,
    fromLlm,
    fromStructured,
    errors,
  };
}
