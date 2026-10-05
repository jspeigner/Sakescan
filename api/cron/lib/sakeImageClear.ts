/**
 * Clear a sake catalog image and drop the sticky local-identify embedding.
 *
 * identify (hash / KNN) reads sake_image_embeddings without joining the live
 * sake.image_url. Leaving the embedding after a clear keeps returning the wrong
 * sake for that photo hash and pins the sha256 unique index so no other row can
 * embed the same bytes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
 * Null catalog image_url and delete sake_image_embeddings for this sake.
 * Delete runs even when no embedding exists (idempotent).
 */
export async function clearSakeCatalogImage(
  supabase: SupabaseClient,
  sakeId: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from('sake')
    .update({ image_url: null, updated_at: new Date().toISOString() })
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
