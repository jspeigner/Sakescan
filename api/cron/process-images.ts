import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  downloadAndStore,
  isSupabaseUrl,
  sleep,
  supabaseProjectHost,
} from './lib/imageMirror.js';
import { searchSakeImageCandidates, urlLooksLikeNonSakeProduct } from './lib/sakeImageDiscovery.js';
import { validateJapaneseSakeProductPhoto } from './lib/sakeImageVision.js';

/** Mirror external image_url into Storage (per run). */
const MIRROR_OPS_BUDGET = 220;
/** Attempt to fill missing image_url (Firecrawl + vision + upload). */
const DISCOVER_ROW_CAP = 28;
const DISCOVER_CANDIDATES_MAX = 5;
/** Spot-check hosted images; clear when vision says not sake. */
const AUDIT_ROW_CAP = 10;
const DELAY_MS = 80;
const DELAY_MS_DISCOVER = 120;

/** Hobby plan ~10s hard limit; stay under so we return JSON before the platform kills the isolate. */
const CHUNK_WALL_MS = 7500;

type SakeRow = {
  id: string;
  name: string;
  name_japanese: string | null;
  brewery: string;
  image_url: string | null;
};

async function countBreweryRemaining(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string
): Promise<{ breweryMainImages: number; breweryGalleryImages: number }> {
  const { data: breweries } = await supabase
    .from('breweries')
    .select('image_url')
    .not('image_url', 'is', null)
    .limit(3000);
  let breweryMainImages = 0;
  (breweries || []).forEach((b) => {
    if (b.image_url && !isSupabaseUrl(b.image_url, supabaseUrl)) breweryMainImages++;
  });

  let breweryGalleryImages = 0;
  const { data: gCheck } = await supabase
    .from('breweries')
    .select('gallery_images')
    .not('gallery_images', 'eq', '[]')
    .limit(2000);
  (gCheck || []).forEach((b) => {
    const gallery: string[] = Array.isArray(b.gallery_images) ? b.gallery_images : [];
    breweryGalleryImages += gallery.filter((url) => url && !isSupabaseUrl(url, supabaseUrl)).length;
  });

  return { breweryMainImages, breweryGalleryImages };
}

async function countSakeMissingImage(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { count: nullCount } = await supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .is('image_url', null);
  const { count: emptyCount } = await supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .eq('image_url', '');
  return (nullCount ?? 0) + (emptyCount ?? 0);
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const q = req.query as Record<string, string | string[] | undefined>;

    /** Smallest possible response — proves the function bundle loads (use if full job fails). */
    if (req.method === 'GET' && q.quick === '1') {
      return res.status(200).json({
        ok: true,
        ping: 'process-images',
        node: process.version,
      });
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({
        error: 'Supabase not configured',
        hint: 'Set VITE_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY on Vercel (same as other API routes).',
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    const statsOnly = req.method === 'GET' && q.stats === '1';
    const chunked =
      q.chunk === '1' ||
      q.chunk === 'true' ||
      (Array.isArray(q.chunk) && (q.chunk[0] === '1' || q.chunk[0] === 'true'));
    const chunkDeadlineMs = chunked ? Date.now() + CHUNK_WALL_MS : Number.POSITIVE_INFINITY;
    const shouldStopChunk = (): boolean => Date.now() >= chunkDeadlineMs;
    let hitTimeBudget = false;

    if (statsOnly) {
      const projectHostForCount = supabaseProjectHost(supabaseUrl);
      let remainingSakeQuery = supabase
        .from('sake')
        .select('image_url', { count: 'exact', head: true })
        .not('image_url', 'is', null)
        .neq('image_url', '');
      if (projectHostForCount) {
        remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', `%${projectHostForCount}%`);
      }
      remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', '%supabase.co%');
      const { count: remainingSakeApprox } = await remainingSakeQuery;
      const remainingSake = remainingSakeApprox ?? 0;
      const brewRem = await countBreweryRemaining(supabase, supabaseUrl);
      const sakeMissingImage = await countSakeMissingImage(supabase);

      return res.status(200).json({
        success: true,
        job: 'sake',
        statsOnly: true,
        processed: 0,
        galleryProcessed: 0,
        sakeProcessed: 0,
        breweryMainProcessed: 0,
        failed: 0,
        skippedPlaceholders: 0,
        rateLimited: false,
        remaining: {
          sakeImages: Math.max(0, remainingSake),
          sakeMissingImage,
          breweryMainImages: brewRem.breweryMainImages,
          breweryGalleryImages: brewRem.breweryGalleryImages,
        },
        env: {
          discoverEnabled: Boolean(firecrawlKey && openaiKey),
          auditEnabled: Boolean(openaiKey),
        },
        timestamp: new Date().toISOString(),
      });
    }

    let sakeMirrored = 0;
    let sakeDiscovered = 0;
    let sakeAuditCleared = 0;
    let sakeExternalRowsFetched = 0;
    /** Single long runs hold more in memory (vision base64, buffers); chunked stays aggressive. */
    const discoverRowCapThisRun = chunked ? DISCOVER_ROW_CAP : Math.min(DISCOVER_ROW_CAP, 14);
    // Audit (vision) takes 2-5s per row — skip entirely in chunked mode (7.5s budget) so mirror
    // and discover always get to run. Audit only fires in single long-request mode.
    const auditRowCapThisRun = chunked ? 0 : Math.min(AUDIT_ROW_CAP, 6);
    const mirrorOpsBudgetThisRun = chunked ? MIRROR_OPS_BUDGET : Math.min(MIRROR_OPS_BUDGET, 80);
    let mirrorOpsRemaining = mirrorOpsBudgetThisRun;
    let failed = 0;
    let skippedPlaceholders = 0;
    let rateLimited = false;
    const errors: string[] = [];
    const seenHashes = new Set<string>();
    const knownPlaceholderHashes = new Set<string>();

    // --- AUDIT: clear clearly wrong hosted images (e.g. whisky bottle) ---
    if (openaiKey) {
      const { data: auditPool } = await supabase
        .from('sake')
        .select('id, name, name_japanese, brewery, image_url')
        .not('image_url', 'is', null)
        .neq('image_url', '')
        .limit(120);

      const auditCandidates = (auditPool || []).filter(
        (r) => r.image_url && isSupabaseUrl(r.image_url, supabaseUrl)
      ) as SakeRow[];

      shuffleInPlace(auditCandidates);
      const auditBatch = auditCandidates.slice(0, auditRowCapThisRun);

      for (const row of auditBatch) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          break;
        }
        if (rateLimited) break;
        if (!row.image_url) continue;
        try {
          const v = await validateJapaneseSakeProductPhoto(openaiKey, row.image_url, {
            sakeName: row.name,
            brewery: row.brewery,
          });
          await sleep(DELAY_MS_DISCOVER);
          if (!v.isJapaneseSakeProductPhoto || v.confidence === 'low') {
            await supabase
              .from('sake')
              .update({ image_url: null, updated_at: new Date().toISOString() })
              .eq('id', row.id);
            sakeAuditCleared++;
            console.log(`[process-images/audit] cleared ${row.name}: ${v.briefReason}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`audit ${row.name}: ${msg.slice(0, 120)}`);
        }
      }
    }

    // --- DISCOVER: null / empty image_url ---
    if (firecrawlKey && openaiKey && !rateLimited && !hitTimeBudget) {
      const { data: missingPool } = await supabase
        .from('sake')
        .select('id, name, name_japanese, brewery, image_url')
        .or('image_url.is.null,image_url.eq.')
        .order('updated_at', { ascending: true })
        .limit(120);

      const missingRows = (missingPool || []) as SakeRow[];
      let discoverAttempts = 0;

      for (const row of missingRows) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          break;
        }
        if (discoverAttempts >= discoverRowCapThisRun || rateLimited) break;
        discoverAttempts++;

        try {
          const { images } = await searchSakeImageCandidates(
            firecrawlKey,
            {
              name: row.name,
              nameJapanese: row.name_japanese,
              brewery: row.brewery,
            },
            'google-only'
          );
          await sleep(DELAY_MS_DISCOVER);

          let placed = false;
          for (const img of images.slice(0, DISCOVER_CANDIDATES_MAX)) {
            if (shouldStopChunk()) {
              hitTimeBudget = true;
              break;
            }
            if (rateLimited) break;
            if (urlLooksLikeNonSakeProduct(img.url)) continue;

            try {
              const v = await validateJapaneseSakeProductPhoto(openaiKey, img.url, {
                sakeName: row.name,
                brewery: row.brewery,
              });
              await sleep(DELAY_MS_DISCOVER);

              if (!v.isJapaneseSakeProductPhoto || v.confidence === 'low') continue;

              const result = await downloadAndStore(
                supabase,
                img.url,
                'sake-images',
                row.name,
                seenHashes,
                knownPlaceholderHashes
              );

              if (result.rateLimited) {
                rateLimited = true;
                errors.push('Rate limited during discover — stopping');
                break;
              }

              if (result.skippedPlaceholder) continue;

              await supabase
                .from('sake')
                .update({ image_url: result.url, updated_at: new Date().toISOString() })
                .eq('id', row.id);
              sakeDiscovered++;
              placed = true;
              break;
            } catch (inner) {
              failed++;
            }
          }

          if (!placed) {
            /* leave null; try again on a later run */
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`discover ${row.name}: ${msg.slice(0, 120)}`);
        }
      }
    } else if (!firecrawlKey || !openaiKey) {
      errors.push(
        !firecrawlKey && !openaiKey
          ? 'Discover skipped: set FIRECRAWL_API_KEY and OPENAI_API_KEY'
          : !firecrawlKey
            ? 'Discover skipped: FIRECRAWL_API_KEY missing'
            : 'Discover skipped: OPENAI_API_KEY missing'
      );
    }

    // --- MIRROR: external URL → Supabase Storage ---
    const projectHost = supabaseProjectHost(supabaseUrl);
    let sakeQuery = supabase
      .from('sake')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .neq('image_url', '');

    if (projectHost) {
      sakeQuery = sakeQuery.not('image_url', 'ilike', `%${projectHost}%`);
    }
    sakeQuery = sakeQuery.not('image_url', 'ilike', '%supabase.co%');

    if (!hitTimeBudget) {
      const { data: sakes } = await sakeQuery.order('updated_at', { ascending: true }).limit(1500);

      sakeExternalRowsFetched = (sakes || []).length;

      const sakesToMirror = (sakes || []).filter(
        (s) => s.image_url && !isSupabaseUrl(s.image_url, supabaseUrl)
      );

      for (const sake of sakesToMirror) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          break;
        }
        if (rateLimited || mirrorOpsRemaining <= 0) break;

        if (sake.image_url && !isSupabaseUrl(sake.image_url, supabaseUrl)) {
          // Skip obvious non-sake URLs before even attempting to download
          if (urlLooksLikeNonSakeProduct(sake.image_url)) {
            await supabase
              .from('sake')
              .update({ image_url: null, updated_at: new Date().toISOString() })
              .eq('id', sake.id);
            skippedPlaceholders++;
            console.log(`[process-images/mirror] cleared non-sake URL for ${sake.name}: ${sake.image_url}`);
            mirrorOpsRemaining--;
            continue;
          }

          try {
            const result = await downloadAndStore(
              supabase,
              sake.image_url,
              'sake-images',
              sake.name,
              seenHashes,
              knownPlaceholderHashes
            );
            mirrorOpsRemaining--;

            if (result.rateLimited) {
              rateLimited = true;
              errors.push('Rate limited by image host — stopping mirror');
              break;
            }
            if (result.skippedPlaceholder) {
              await supabase
                .from('sake')
                .update({ image_url: null, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              skippedPlaceholders++;
            } else {
              await supabase
                .from('sake')
                .update({ image_url: result.url, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              sakeMirrored++;
            }
            await sleep(DELAY_MS);
          } catch (err) {
            mirrorOpsRemaining--;
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Blocked') || msg.includes('Not an image') || msg.includes('Too small')) {
              await supabase
                .from('sake')
                .update({ image_url: null, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
            }
            await sleep(DELAY_MS);
          }
        }
      }
    }

    const projectHostForCount = supabaseProjectHost(supabaseUrl);
    let remainingSakeQuery = supabase
      .from('sake')
      .select('image_url', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .neq('image_url', '');
    if (projectHostForCount) {
      remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', `%${projectHostForCount}%`);
    }
    remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', '%supabase.co%');
    const { count: remainingSakeApprox } = await remainingSakeQuery;
    const remainingSake = remainingSakeApprox ?? 0;

    const brewRem = await countBreweryRemaining(supabase, supabaseUrl);
    const sakeMissingImage = await countSakeMissingImage(supabase);

    const mirrorOpsUsed = mirrorOpsBudgetThisRun - mirrorOpsRemaining;
    const sakeProcessedTotal = sakeMirrored + sakeDiscovered;

    const runAgain =
      chunked &&
      !rateLimited &&
      (hitTimeBudget || remainingSake > 0 || sakeMissingImage > 0);

    console.log(
      `[process-images/sake] chunked=${chunked} hitBudget=${hitTimeBudget} mirror=${sakeMirrored} discover=${sakeDiscovered} auditCleared=${sakeAuditCleared} failed=${failed} externalRemaining≈${remainingSake} missingImg=${sakeMissingImage} mirrorOps=${mirrorOpsUsed} runAgain=${runAgain}`
    );

    return res.status(200).json({
      success: true,
      job: 'sake',
      chunked,
      chunkBudgetMs: chunked ? CHUNK_WALL_MS : undefined,
      hitTimeBudget: chunked ? hitTimeBudget : undefined,
      runAgain: chunked ? runAgain : undefined,
      mirrorOpsBudget: mirrorOpsBudgetThisRun,
      mirrorOpsUsed,
      mirrorOpsRemaining,
      sakeProcessed: sakeProcessedTotal,
      sakeMirrored,
      sakeDiscovered,
      sakeAuditCleared,
      discoverRowCap: discoverRowCapThisRun,
      auditRowCap: auditRowCapThisRun,
      processed: sakeProcessedTotal,
      galleryProcessed: 0,
      breweryMainProcessed: 0,
      failed,
      skippedPlaceholders,
      rateLimited,
      remaining: {
        sakeImages: Math.max(0, remainingSake),
        sakeMissingImage,
        breweryMainImages: brewRem.breweryMainImages,
        breweryGalleryImages: brewRem.breweryGalleryImages,
      },
      sakeQueue: {
        externalRowsFetched: sakeExternalRowsFetched,
        note: 'Audit → discover (missing) → mirror external URLs. Discover needs FIRECRAWL + OPENAI.',
      },
      errors: errors.length > 0 ? errors.slice(0, 15) : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron process-images (sake) error:', error);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Processing failed',
        details: message,
        ...(process.env.NODE_ENV !== 'production' && stack ? { stack } : {}),
      });
    }
    return;
  }
}
