/**
 * Local identify embeddings: vision-extract label text → OpenAI text-embedding-3-small.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashImageUrl } from './imageHash.js';
import { isOpenAIQuotaError, OpenAIVisionQuotaError } from './sakeImageVision.js';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

export type LabelExtractResult = {
  labelText: string;
  brandGuess: string | null;
  breweryGuess: string | null;
  rawLines: string[];
};

export type SakeEmbedRow = {
  sake_id: string;
  image_url: string;
  image_sha256: string;
  label_text: string;
  embedding: number[];
  model: string;
};

async function imageUrlToDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mime = ct.split(';')[0].trim().toLowerCase();
    if (mime.includes('text/html') || !mime.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500 || buf.length > 2_500_000) return null;
    return `data:${mime || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Extract readable label text from a sake product photo. */
export async function extractLabelTextFromImage(
  openaiApiKey: string,
  imageUrl: string,
  context?: { sakeName?: string; brewery?: string | null }
): Promise<LabelExtractResult> {
  const system =
    'You read Japanese sake bottle labels for a product database. Reply with JSON only.';
  const hint =
    context?.sakeName || context?.brewery
      ? `Known context (may be incomplete): name="${context?.sakeName ?? ''}" brewery="${context?.brewery ?? ''}".`
      : 'No prior name/brewery context.';

  const userText = `${hint}

Extract the most useful searchable text from this sake label / bottle photo.
Return JSON:
{
  "labelText": "single line of key text for search (English transliteration + Japanese if visible)",
  "brandGuess": "brand or product name or null",
  "breweryGuess": "brewery name or null",
  "rawLines": ["short lines of visible text"]
}
If the image is not a sake label, still return best-effort empty-ish fields.`;

  const dataUrl = await imageUrlToDataUrl(imageUrl);
  const imagePart: { type: 'image_url'; image_url: { url: string; detail: 'low' } } = {
    type: 'image_url',
    image_url: { url: dataUrl || imageUrl, detail: 'low' },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 280,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [{ type: 'text', text: userText }, imagePart],
        },
      ],
    }),
  });

  if (res.status === 429) {
    throw new OpenAIVisionQuotaError('OpenAI vision HTTP 429 during label extract');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI label extract HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content || '{}';
  try {
    const o = JSON.parse(content) as Record<string, unknown>;
    const labelText = typeof o.labelText === 'string' ? o.labelText.trim() : '';
    const brandGuess = typeof o.brandGuess === 'string' ? o.brandGuess.trim() : null;
    const breweryGuess = typeof o.breweryGuess === 'string' ? o.breweryGuess.trim() : null;
    const rawLines = Array.isArray(o.rawLines)
      ? o.rawLines.filter((x): x is string => typeof x === 'string').slice(0, 12)
      : [];
    return {
      labelText: labelText || [brandGuess, breweryGuess].filter(Boolean).join(' '),
      brandGuess,
      breweryGuess,
      rawLines,
    };
  } catch {
    return { labelText: '', brandGuess: null, breweryGuess: null, rawLines: [] };
  }
}

export function buildEmbedInput(params: {
  labelText: string;
  sakeName?: string | null;
  brewery?: string | null;
  nameJapanese?: string | null;
}): string {
  const parts = [
    params.sakeName?.trim(),
    params.nameJapanese?.trim(),
    params.brewery?.trim(),
    params.labelText?.trim(),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.join(' | ').slice(0, 4000);
}

export async function embedText(openaiApiKey: string, input: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: input || 'sake',
    }),
  });
  if (res.status === 429) {
    throw new OpenAIVisionQuotaError('OpenAI embeddings HTTP 429');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${body.slice(0, 180)}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding length ${embedding?.length ?? 0}`);
  }
  return embedding;
}

export async function upsertSakeEmbedding(
  supabase: SupabaseClient,
  row: SakeEmbedRow
): Promise<void> {
  const { error } = await supabase.from('sake_image_embeddings').upsert(
    {
      sake_id: row.sake_id,
      image_url: row.image_url,
      image_sha256: row.image_sha256,
      label_text: row.label_text,
      embedding: row.embedding,
      model: row.model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sake_id' }
  );
  if (error) throw new Error(`sake_image_embeddings upsert: ${error.message}`);
}

/** Full pipeline for one catalog row. */
export async function embedSakeCatalogImage(
  supabase: SupabaseClient,
  openaiApiKey: string,
  sake: {
    id: string;
    name: string;
    name_japanese?: string | null;
    brewery?: string | null;
    image_url: string;
  }
): Promise<{ sha256: string; labelText: string }> {
  const { sha256 } = await hashImageUrl(sake.image_url);
  const extracted = await extractLabelTextFromImage(openaiApiKey, sake.image_url, {
    sakeName: sake.name,
    brewery: sake.brewery,
  });
  const input = buildEmbedInput({
    labelText: extracted.labelText,
    sakeName: sake.name,
    brewery: sake.brewery,
    nameJapanese: sake.name_japanese,
  });
  const embedding = await embedText(openaiApiKey, input);
  await upsertSakeEmbedding(supabase, {
    sake_id: sake.id,
    image_url: sake.image_url,
    image_sha256: sha256,
    label_text: extracted.labelText || input,
    embedding,
    model: EMBEDDING_MODEL,
  });
  return { sha256, labelText: extracted.labelText || input };
}

export type LocalMatch = {
  sakeId: string;
  imageUrl: string | null;
  labelText: string | null;
  similarity: number;
};

export async function matchByImageSha256(
  supabase: SupabaseClient,
  sha256: string
): Promise<LocalMatch | null> {
  const { data, error } = await supabase.rpc('match_sake_by_image_sha256', {
    p_sha256: sha256,
  });
  if (error) {
    // Fallback if RPC missing during rollout.
    const { data: row } = await supabase
      .from('sake_image_embeddings')
      .select('sake_id, image_url, label_text')
      .eq('image_sha256', sha256)
      .maybeSingle();
    if (!row) return null;
    return {
      sakeId: row.sake_id,
      imageUrl: row.image_url,
      labelText: row.label_text,
      similarity: 1,
    };
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    sakeId: row.sake_id,
    imageUrl: row.image_url ?? null,
    labelText: row.label_text ?? null,
    similarity: Number(row.similarity ?? 1),
  };
}

export async function matchByEmbedding(
  supabase: SupabaseClient,
  embedding: number[],
  options?: { matchCount?: number; matchThreshold?: number }
): Promise<LocalMatch[]> {
  const matchCount = options?.matchCount ?? 5;
  const matchThreshold = options?.matchThreshold ?? 0.55;
  const { data, error } = await supabase.rpc('match_sake_embeddings', {
    query_embedding: embedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });
  if (error) throw new Error(`match_sake_embeddings: ${error.message}`);
  return (data || []).map(
    (row: { sake_id: string; image_url?: string; label_text?: string; similarity?: number }) => ({
      sakeId: row.sake_id,
      imageUrl: row.image_url ?? null,
      labelText: row.label_text ?? null,
      similarity: Number(row.similarity ?? 0),
    })
  );
}

export async function getEmbeddingCoverage(
  supabase: SupabaseClient
): Promise<{ withImage: number; embedded: number; coverage: number }> {
  const [{ count: withImage }, { count: embedded }] = await Promise.all([
    supabase
      .from('sake')
      .select('id', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .neq('image_url', ''),
    supabase.from('sake_image_embeddings').select('sake_id', { count: 'exact', head: true }),
  ]);
  const w = withImage ?? 0;
  const e = embedded ?? 0;
  return { withImage: w, embedded: e, coverage: w > 0 ? e / w : 0 };
}

export { isOpenAIQuotaError };
