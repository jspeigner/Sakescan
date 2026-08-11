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
  quotaExceeded: boolean;
  coverage: { withImage: number; embedded: number; coverage: number };
  errors: string[];
};

export async function embedSakeImagesBatch(
  supabase: SupabaseClient,
  openaiApiKey: string,
  options?: { batchSize?: number }
): Promise<EmbedBatchResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 40, 1), 80);

  const { data: candidates, error } = await supabase
    .from('sake')
    .select('id, name, name_japanese, brewery, image_url, updated_at')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .order('updated_at', { ascending: false })
    .limit(Math.max(batchSize * 4, 80));

  if (error) throw new Error(error.message);

  const ids = (candidates || []).map((c) => c.id);
  let existingMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: existingRows } = await supabase
      .from('sake_image_embeddings')
      .select('sake_id, image_url')
      .in('sake_id', ids);
    existingMap = new Map((existingRows || []).map((e) => [e.sake_id, e.image_url as string]));
  }

  const todo = (candidates || [])
    .filter((c) => {
      if (!c.image_url) return false;
      const prev = existingMap.get(c.id);
      return !prev || prev !== c.image_url;
    })
    .slice(0, batchSize);

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
    quotaExceeded,
    coverage,
    errors,
  };
}
