import type { SupabaseClient } from '@supabase/supabase-js';
import { sleep } from './imageMirror.js';
import {
  embedSakeCatalogImage,
  getEmbeddingCoverage,
  isOpenAIQuotaError,
} from './sakeImageEmbed.js';

export type EmbedBatchResult = {
  candidates: number;
  embedded: number;
  failed: number;
  scanned: number;
  quotaExceeded: boolean;
  coverage: { withImage: number; embedded: number; coverage: number };
  errors: string[];
};

export type EmbedCandidateRow = {
  id: string;
  name: string;
  name_japanese: string | null;
  brewery: string | null;
  image_url: string | null;
};

/** True when the catalog row has an image that is missing or stale in the embed index. */
export function needsEmbedding(
  row: { id: string; image_url: string | null | undefined },
  existingBySakeId: Map<string, string>
): boolean {
  const imageUrl = row.image_url?.trim();
  if (!imageUrl) return false;
  const prev = existingBySakeId.get(row.id);
  return !prev || prev !== imageUrl;
}

const EMBED_SCAN_PAGE_SIZE = 100;

/**
 * Walk catalog pages (newest `updated_at` first) until `batchSize` rows need
 * embedding work, or the imaged catalog is exhausted.
 *
 * Important: do not `.limit(N)` then filter — once the tip rows are embedded,
 * every cron run would see an empty todo and older bottles would never index.
 */
export async function collectEmbedTodoRows(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ data: EmbedCandidateRow[] | null; error: { message: string } | null }>,
  fetchExisting: (ids: string[]) => Promise<Map<string, string>>,
  batchSize: number,
  pageSize = EMBED_SCAN_PAGE_SIZE
): Promise<{ todo: EmbedCandidateRow[]; scanned: number }> {
  const todo: EmbedCandidateRow[] = [];
  let scanned = 0;
  const safePage = Math.min(Math.max(pageSize, 1), 500);

  for (let offset = 0; todo.length < batchSize; offset += safePage) {
    const { data, error } = await fetchPage(offset, offset + safePage - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    if (page.length === 0) break;
    scanned += page.length;

    const existingMap = await fetchExisting(page.map((row) => row.id));
    for (const row of page) {
      if (!needsEmbedding(row, existingMap)) continue;
      todo.push(row);
      if (todo.length >= batchSize) break;
    }

    if (page.length < safePage) break;
  }

  return { todo, scanned };
}

export async function embedSakeImagesBatch(
  supabase: SupabaseClient,
  openaiApiKey: string,
  options?: { batchSize?: number }
): Promise<EmbedBatchResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 40, 1), 80);

  const { todo, scanned } = await collectEmbedTodoRows(
    async (from, to) =>
      supabase
        .from('sake')
        .select('id, name, name_japanese, brewery, image_url, updated_at')
        .not('image_url', 'is', null)
        .neq('image_url', '')
        .order('updated_at', { ascending: false })
        .range(from, to),
    async (ids) => {
      if (ids.length === 0) return new Map();
      const { data: existingRows } = await supabase
        .from('sake_image_embeddings')
        .select('sake_id, image_url')
        .in('sake_id', ids);
      return new Map((existingRows || []).map((e) => [e.sake_id as string, e.image_url as string]));
    },
    batchSize
  );

  let embedded = 0;
  let failed = 0;
  const errors: string[] = [];
  let quotaExceeded = false;

  for (const row of todo) {
    if (!row.image_url) continue;
    try {
      await embedSakeCatalogImage(supabase, openaiApiKey, {
        id: row.id,
        name: row.name,
        name_japanese: row.name_japanese,
        brewery: row.brewery,
        image_url: row.image_url,
      });
      embedded++;
      await sleep(80);
    } catch (e) {
      if (isOpenAIQuotaError(e)) {
        quotaExceeded = true;
        errors.push('OpenAI quota exceeded — stopping batch');
        break;
      }
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errors.length < 8) errors.push(`${row.name}: ${msg.slice(0, 120)}`);
    }
  }

  const coverage = await getEmbeddingCoverage(supabase).catch(() => ({
    withImage: 0,
    embedded: 0,
    coverage: 0,
  }));

  return {
    candidates: todo.length,
    embedded,
    failed,
    scanned,
    quotaExceeded,
    coverage,
    errors,
  };
}
