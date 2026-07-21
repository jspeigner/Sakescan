/**
 * Tiered image provenance: T1 retailer > T2 user_scan > T3 web_discover.
 */

export type ImageSource = 'retailer' | 'user_scan' | 'web_discover' | 'admin';
export type ImageQuality = 't1' | 't2' | 't3';

export type ImageProvenance = {
  image_source: ImageSource;
  image_quality: ImageQuality;
  image_verified_at?: string | null;
  image_contributor_scan_id?: string | null;
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
    updated_at: new Date().toISOString(),
  };
}
