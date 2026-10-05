/**
 * Tiered image provenance: T1 retailer > T2 user_scan > T3 web_discover.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ImageSource = 'retailer' | 'user_scan' | 'web_discover' | 'admin';
export type ImageQuality = 't1' | 't2' | 't3';

export type ImageProvenance = {
  image_source: ImageSource;
  image_quality: ImageQuality;
  image_verified_at?: string | null;
  image_contributor_scan_id?: string | null;
};

export type CatalogImageSnapshot = {
  image_url?: string | null;
  image_quality?: string | null;
};

const QUALITY_RANK: Record<ImageQuality, number> = { t1: 3, t2: 2, t3: 1 };

export function qualityRank(q: string | null | undefined): number {
  if (q === 't1' || q === 't2' || q === 't3') return QUALITY_RANK[q];
  return 0;
}

/** True if incoming quality should replace existing (higher tier, or fill empty). */
export function shouldReplaceImage(
  existingQuality: string | null | undefined,
  existingUrl: string | null | undefined,
  incoming: ImageQuality
): boolean {
  if (!existingUrl) return true;
  // Legacy catalog photos (URL present, no provenance) count as T1 — never overwrite with T2/T3.
  const existing =
    existingQuality === 't1' || existingQuality === 't2' || existingQuality === 't3'
      ? qualityRank(existingQuality)
      : QUALITY_RANK.t1;
  return qualityRank(incoming) > existing;
}

/**
 * PostgREST filter so a late discover/promote write cannot clobber a stronger
 * image that landed during Firecrawl/vision (TOCTOU against the pool snapshot).
 * Combined with `.eq('id', …)` this is (id match) AND (still replaceable).
 */
export function catalogImageReplaceFilter(incoming: ImageQuality): string {
  if (incoming === 't1') {
    // Empty URL, or explicit weaker tiers — not legacy (URL + null quality = T1).
    return 'image_url.is.null,image_url.eq.,image_quality.eq.t2,image_quality.eq.t3';
  }
  if (incoming === 't2') {
    return 'image_url.is.null,image_url.eq.,image_quality.eq.t3';
  }
  return 'image_url.is.null,image_url.eq.';
}

export type PlaceCatalogImageResult = {
  placed: boolean;
  skippedWeaker: boolean;
  error?: string;
};

/**
 * Re-read live provenance and only write when the incoming tier is still stronger.
 * Discover and promote both spend tens of seconds before update; without this,
 * a concurrent T2 promote (or admin fill) is silently overwritten by weaker T3.
 */
export async function placeCatalogImageIfStronger(
  supabase: SupabaseClient,
  sakeId: string,
  imageUrl: string,
  provenance: ImageProvenance
): Promise<PlaceCatalogImageResult> {
  const { data: live, error: readErr } = await supabase
    .from('sake')
    .select('image_url, image_quality')
    .eq('id', sakeId)
    .maybeSingle();

  if (readErr) {
    return { placed: false, skippedWeaker: false, error: readErr.message };
  }

  const snapshot = (live ?? null) as CatalogImageSnapshot | null;
  if (!shouldReplaceImage(snapshot?.image_quality, snapshot?.image_url, provenance.image_quality)) {
    return { placed: false, skippedWeaker: true };
  }

  const payload = sakeImageUpdatePayload(imageUrl, provenance);
  const { data: updated, error: upErr } = await supabase
    .from('sake')
    .update(payload)
    .eq('id', sakeId)
    .or(catalogImageReplaceFilter(provenance.image_quality))
    .select('id');

  if (upErr) {
    return { placed: false, skippedWeaker: false, error: upErr.message };
  }
  if (!updated?.length) {
    return { placed: false, skippedWeaker: true };
  }
  return { placed: true, skippedWeaker: false };
}

export function provenanceForTrustedRetailer(): ImageProvenance {
  return {
    image_source: 'retailer',
    image_quality: 't1',
    image_verified_at: new Date().toISOString(),
    image_contributor_scan_id: null,
  };
}

export function provenanceForWebDiscover(): ImageProvenance {
  return {
    image_source: 'web_discover',
    image_quality: 't3',
    image_verified_at: new Date().toISOString(),
    image_contributor_scan_id: null,
  };
}

export function provenanceForUserScan(scanId: string): ImageProvenance {
  return {
    image_source: 'user_scan',
    image_quality: 't2',
    image_verified_at: new Date().toISOString(),
    image_contributor_scan_id: scanId,
  };
}

export function provenanceForAdmin(): ImageProvenance {
  return {
    image_source: 'admin',
    image_quality: 't1',
    image_verified_at: new Date().toISOString(),
    image_contributor_scan_id: null,
  };
}

/**
 * Catalog image writes must invalidate WineEngine index state.
 * TinEye filepaths are sticky per sake id (`sake/${id}.jpg`); leaving
 * `wineengine_indexed_at` set after a replace/clear keeps the old bottle
 * fingerprint forever because sync only selects `wineengine_indexed_at IS NULL`.
 */
export function sakeImageUpdatePayload(
  imageUrl: string,
  provenance: ImageProvenance
): Record<string, unknown> {
  return {
    image_url: imageUrl,
    image_source: provenance.image_source,
    image_quality: provenance.image_quality,
    image_verified_at: provenance.image_verified_at ?? new Date().toISOString(),
    image_contributor_scan_id: provenance.image_contributor_scan_id ?? null,
    wineengine_indexed_at: null,
    updated_at: new Date().toISOString(),
  };
}

/** Clear a catalog image and force WineEngine re-index eligibility. */
export function sakeImageClearPayload(): Record<string, unknown> {
  return {
    image_url: null,
    wineengine_indexed_at: null,
    updated_at: new Date().toISOString(),
  };
}
