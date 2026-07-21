/**
 * Promote matched user scan photos into sake.image_url when catalog image is missing
 * (or weaker than T2). T2 provenance — upgradeable to T1 retailer later.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadAndStore, sleep } from './imageMirror.js';
import {
  provenanceForUserScan,
  sakeImageUpdatePayload,
  shouldReplaceImage,
} from './imageProvenance.js';
import { sakeVisionPasses, validateJapaneseSakeProductPhoto } from './sakeImageVision.js';
import {
  getWineEngineConfig,
  wineEngineConfirmsSake,
  wineEngineSearchByUrl,
} from './wineEngine.js';

export type PromoteScanResult = {
  candidates: number;
  attempted: number;
  promoted: number;
  skippedVision: number;
  skippedWineEngine: number;
  skippedExisting: number;
  skippedInvalidUrl: number;
  errors: string[];
};

type ScanCandidate = {
  id: string;
  sake_id: string;
  scanned_image_url: string;
  catalog_share_opt_in: boolean | null;
};

type SakeImageRow = {
  id: string;
  name: string;
  brewery: string;
  image_url: string | null;
  image_quality: string | null;
};

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return false;
    }

    if (/^(10|127)\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function promoteScanImagesBatch(
  supabase: SupabaseClient,
  options?: {
    batchSize?: number;
    openaiKey?: string;
    requireOptIn?: boolean;
  }
): Promise<PromoteScanResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 25, 5), 60);
  const openaiKey = options?.openaiKey;
  const requireOptIn = options?.requireOptIn ?? false;
  const errors: string[] = [];
  let attempted = 0;
  let promoted = 0;
  let skippedVision = 0;
  let skippedWineEngine = 0;
  let skippedExisting = 0;
  let skippedInvalidUrl = 0;

  let scanQuery = supabase
    .from('scans')
    .select('id, sake_id, scanned_image_url, catalog_share_opt_in')
    .eq('matched', true)
    .not('sake_id', 'is', null)
    .not('scanned_image_url', 'is', null)
    .neq('scanned_image_url', '')
    .order('created_at', { ascending: false })
    .limit(batchSize * 3);

  if (requireOptIn) {
    scanQuery = scanQuery.eq('catalog_share_opt_in', true);
  }

  const { data: scans, error: scanErr } = await scanQuery;
  if (scanErr) {
    return {
      candidates: 0,
      attempted: 0,
      promoted: 0,
      skippedVision: 0,
      skippedWineEngine: 0,
      skippedExisting: 0,
      skippedInvalidUrl: 0,
      errors: [scanErr.message],
    };
  }

  const candidates = (scans || []).filter(
    (s): s is ScanCandidate =>
      Boolean(s.sake_id && s.scanned_image_url && (!requireOptIn || s.catalog_share_opt_in === true))
  );

  // Prefer one scan per sake (most recent first already)
  const bySake = new Map<string, ScanCandidate>();
  for (const s of candidates) {
    if (!bySake.has(s.sake_id)) bySake.set(s.sake_id, s);
  }

  const sakeIds = [...bySake.keys()].slice(0, batchSize);
  if (sakeIds.length === 0) {
    return {
      candidates: candidates.length,
      attempted: 0,
      promoted: 0,
      skippedVision: 0,
      skippedWineEngine: 0,
      skippedExisting: 0,
      skippedInvalidUrl: 0,
      errors: [],
    };
  }

  const { data: sakes, error: sakeErr } = await supabase
    .from('sake')
    .select('id, name, brewery, image_url, image_quality')
    .in('id', sakeIds);

  if (sakeErr) {
    return {
      candidates: candidates.length,
      attempted: 0,
      promoted: 0,
      skippedVision: 0,
      skippedWineEngine: 0,
      skippedExisting: 0,
      skippedInvalidUrl: 0,
      errors: [sakeErr.message],
    };
  }

  const sakeMap = new Map((sakes || []).map((s) => [s.id, s as SakeImageRow]));
  const wineEngineCfg = getWineEngineConfig();
  const seenHashes = new Set<string>();
  const knownPlaceholderHashes = new Set<string>();

  for (const sakeId of sakeIds) {
    const scan = bySake.get(sakeId);
    const sake = sakeMap.get(sakeId);
    if (!scan || !sake) continue;

    if (!shouldReplaceImage(sake.image_quality, sake.image_url, 't2')) {
      skippedExisting++;
      continue;
    }

    if (!isPublicHttpUrl(scan.scanned_image_url)) {
      skippedInvalidUrl++;
      continue;
    }

    attempted++;
    try {
      if (openaiKey) {
        const v = await validateJapaneseSakeProductPhoto(openaiKey, scan.scanned_image_url, {
          sakeName: sake.name,
          brewery: sake.brewery,
        });
        await sleep(60);
        if (!sakeVisionPasses(v, { allowMedium: true })) {
          skippedVision++;
          continue;
        }
      }

      if (wineEngineCfg) {
        try {
          const we = await wineEngineSearchByUrl(wineEngineCfg, scan.scanned_image_url, { limit: 1 });
          const confirm = wineEngineConfirmsSake(we, sakeId, { minScoreText: 45, minScore: 15 });
          if (we.status === 'ok' && we.result?.length && confirm.reason === 'matched_other_sake') {
            skippedWineEngine++;
            continue;
          }
        } catch {
          /* WineEngine optional */
        }
      }

      const stored = await downloadAndStore(
        supabase,
        scan.scanned_image_url,
        'sake-images',
        sake.name,
        seenHashes,
        knownPlaceholderHashes
      );
      if (stored.rateLimited || stored.skippedPlaceholder) continue;

      const payload = sakeImageUpdatePayload(stored.url, provenanceForUserScan(scan.id));
      const { error: upErr } = await supabase.from('sake').update(payload).eq('id', sakeId);
      if (upErr) {
        errors.push(`${sake.name}: ${upErr.message.slice(0, 100)}`);
      } else {
        promoted++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (errors.length < 8) errors.push(`${sake.name}: ${msg.slice(0, 100)}`);
    }
  }

  return {
    candidates: candidates.length,
    attempted,
    promoted,
    skippedVision,
    skippedWineEngine,
    skippedExisting,
    skippedInvalidUrl,
    errors,
  };
}
