/**
 * Clear a sake catalog image and drop the sticky local-identify embedding.
 *
 * identify (hash / KNN) joins on live sake.image_url === embedding.image_url.
 * Leaving the embedding after a clear pins the sha256 unique index so no other
 * row can embed the same bytes, and WineEngine stays sticky unless
 * wineengine_indexed_at is cleared for later re-index.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sakeImageClearPayload } from './imageProvenance.js';

/** True when an embedding row still describes the live catalog photo. */
export function embeddingMatchesLiveCatalog(
  embeddingImageUrl: string | null | undefined,
  catalogImageUrl: string | null | undefined
): boolean {
  const live = typeof catalogImageUrl === 'string' ? catalogImageUrl.trim() : '';
  const embedded = typeof embeddingImageUrl === 'string' ? embeddingImageUrl.trim() : '';
  if (!live || !embedded) return false;
  return live === embedded;
}

/**
 * Host-only catalog URL rewrite (mirror → Supabase storage, same bytes).
 * Keep sake_image_embeddings.image_url aligned so match_* / keepIfLiveCatalogMatch
 * do not reject a still-valid hash or KNN hit until the next embed cron.
 */
export async function syncEmbeddingCatalogUrl(
  supabase: SupabaseClient,
  sakeId: string,
  imageUrl: string
): Promise<void> {
  const { error } = await supabase
    .from('sake_image_embeddings')
    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq('sake_id', sakeId);
  if (error) {
    throw new Error(`sync embedding image_url: ${error.message}`);
  }
}

/**
 * Null catalog image_url (+ WineEngine index flag) and delete
 * sake_image_embeddings for this sake. Delete runs even when no embedding
 * exists (idempotent).
 */
export async function clearSakeCatalogImage(
  supabase: SupabaseClient,
  sakeId: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from('sake')
    .update(sakeImageClearPayload())
    .eq('id', sakeId);
  if (updateError) {
    throw new Error(`clear sake image: ${updateError.message}`);
  }

  const { error: embedError } = await supabase
    .from('sake_image_embeddings')
    .delete()
    .eq('sake_id', sakeId);
  if (embedError) {
    throw new Error(`clear sake embedding: ${embedError.message}`);
  }
}
