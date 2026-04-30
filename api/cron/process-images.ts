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
/** Discover mode is slower (Firecrawl + vision), so allow a longer chunk budget. */
const DISCOVER_CHUNK_WALL_MS = 25000;
const DISCOVER_CHUNK_WALL_MS_ACCELERATED = 35000;
const DISCOVER_POOL_LIMIT = 1200;
const DISCOVER_BACKOFF_BASE_MS = 30 * 60 * 1000; // 30 minutes
const DISCOVER_BACKOFF_MAX_MS = 72 * 60 * 60 * 1000; // 72 hours

type SakeRow = {
  id: string;
  name: string;
  name_japanese: string | null;
  brewery: string;
  image_url: string | null;
};

type SakeImageAttemptRow = {
  sake_id: string;
  attempt_count: number;
  success_count: number;
  next_retry_at: string | null;
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

function isTransientDownloadError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('econnreset') ||
    normalized.includes('etimedout') ||
    normalized.includes('timeout') ||
    normalized.includes('http 429') ||
    normalized.includes('http 5')
  );
}

async function downloadAndStoreWithRetry(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  name: string,
  seenHashes: Set<string>,
  knownPlaceholderHashes: Set<string>,
  retryCount = 2
): Promise<{ result: Awaited<ReturnType<typeof downloadAndStore>>; retriesUsed: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const result = await downloadAndStore(
        supabase,
        imageUrl,
        'sake-images',
        name,
        seenHashes,
        knownPlaceholderHashes
      );
      return { result, retriesUsed: attempt };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isTransientDownloadError(msg) || attempt === retryCount) {
        throw err;
      }
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function computeNextRetryAt(attemptCount: number, noCandidates: boolean): string {
  const multiplier = noCandidates ? 2 : 1;
  const backoffMs = Math.min(
    DISCOVER_BACKOFF_MAX_MS,
    DISCOVER_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attemptCount - 1)) * multiplier
  );
  return new Date(Date.now() + backoffMs).toISOString();
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
    const modeParam = Array.isArray(q.mode) ? q.mode[0] : q.mode;
    const speedParam = Array.isArray(q.speed) ? q.speed[0] : q.speed;
    const discoverSpeed = (speedParam || 'normal').toLowerCase();
    const chunkMode = (modeParam || 'mirror').toLowerCase();
    const discoverChunkMode = chunked && chunkMode === 'discover';
    const acceleratedDiscover = discoverChunkMode && discoverSpeed === 'accelerated';
    const chunkWallMs = discoverChunkMode
      ? acceleratedDiscover
        ? DISCOVER_CHUNK_WALL_MS_ACCELERATED
        : DISCOVER_CHUNK_WALL_MS
      : CHUNK_WALL_MS;
    const chunkDeadlineMs = chunked ? Date.now() + chunkWallMs : Number.POSITIVE_INFINITY;
    const shouldStopChunk = (): boolean => Date.now() >= chunkDeadlineMs;
    let hitTimeBudget = false;
    let stopReason: string | null = null;

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
    // Chunked mode defaults to mirror-only. Optional `mode=discover` enables a small
    // discover batch for cron-safe missing-image backfill.
    const discoverRowCapThisRun = discoverChunkMode
      ? acceleratedDiscover
        ? Math.min(DISCOVER_ROW_CAP, 6)
        : Math.min(DISCOVER_ROW_CAP, 2)
      : chunked
        ? 0
        : Math.min(DISCOVER_ROW_CAP, 14);
    const auditRowCapThisRun = chunked ? 0 : Math.min(AUDIT_ROW_CAP, 6);
    const mirrorOpsBudgetThisRun = discoverChunkMode ? 0 : chunked ? MIRROR_OPS_BUDGET : Math.min(MIRROR_OPS_BUDGET, 80);
    let mirrorOpsRemaining = mirrorOpsBudgetThisRun;
    let failed = 0;
    let skippedPlaceholders = 0;
    let rateLimited = false;
    const errors: string[] = [];
    const seenHashes = new Set<string>();
    const knownPlaceholderHashes = new Set<string>();
    const diagnostics = {
      audit: {
        poolRows: 0,
        candidateRows: 0,
        attemptedRows: 0,
        clearedRows: 0,
        errors: 0,
        errorSamples: [] as string[],
      },
      discover: {
        poolRows: 0,
        randomizedPoolRows: 0,
        eligibleRows: 0,
        skippedByBackoff: 0,
        attemptedRows: 0,
        rowsWithNoCandidates: 0,
        candidateUrlsSeen: 0,
        sourceCandidates: {
          google: 0,
          bing: 0,
          sakura: 0,
          umami: 0,
          sakeTimes: 0,
        },
        firecrawlErrors: 0,
        firecrawlErrorSamples: [] as string[],
        candidateUrlFiltered: 0,
        visionChecks: 0,
        visionRejected: 0,
        downloadAttempts: 0,
        rateLimited: 0,
        placeholderSkips: 0,
        placedRows: 0,
        retryAttempts: 0,
        attemptHistoryReadErrors: 0,
        attemptHistoryWriteErrors: 0,
        perRowErrors: 0,
        rowErrorSamples: [] as string[],
        downloadErrorSamples: [] as string[],
      },
      mirror: {
        fetchedRows: 0,
        rowsToMirror: 0,
        attemptedRows: 0,
        urlFiltered: 0,
        downloadAttempts: 0,
        mirroredRows: 0,
        retryAttempts: 0,
        placeholderClears: 0,
        rateLimited: 0,
        downloadErrors: 0,
        errorSamples: [] as string[],
      },
    };
    const pushSample = (arr: string[], value: string, max = 5): void => {
      if (arr.length < max) arr.push(value);
    };

    // --- AUDIT: clear clearly wrong hosted images (e.g. whisky bottle) ---
    if (openaiKey) {
      const { data: auditPool } = await supabase
        .from('sake')
        .select('id, name, name_japanese, brewery, image_url')
        .not('image_url', 'is', null)
        .neq('image_url', '')
        .limit(120);
      diagnostics.audit.poolRows = (auditPool || []).length;

      const auditCandidates = (auditPool || []).filter(
        (r) => r.image_url && isSupabaseUrl(r.image_url, supabaseUrl)
      ) as SakeRow[];
      diagnostics.audit.candidateRows = auditCandidates.length;

      shuffleInPlace(auditCandidates);
      const auditBatch = auditCandidates.slice(0, auditRowCapThisRun);

      for (const row of auditBatch) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          stopReason = stopReason || 'time_budget_reached';
          break;
        }
        if (rateLimited) break;
        if (!row.image_url) continue;
        try {
          diagnostics.audit.attemptedRows++;
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
            diagnostics.audit.clearedRows++;
            console.log(`[process-images/audit] cleared ${row.name}: ${v.briefReason}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          diagnostics.audit.errors++;
          pushSample(diagnostics.audit.errorSamples, `${row.name}: ${msg.slice(0, 140)}`);
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
        .limit(DISCOVER_POOL_LIMIT);
      diagnostics.discover.poolRows = (missingPool || []).length;

      const missingRows = (missingPool || []) as SakeRow[];
      shuffleInPlace(missingRows);
      diagnostics.discover.randomizedPoolRows = missingRows.length;
      const attemptBySakeId = new Map<string, SakeImageAttemptRow>();
      if (missingRows.length > 0) {
        const { data: attemptRows, error: attemptReadError } = await supabase
          .from('sake_image_attempts')
          .select('sake_id, attempt_count, success_count, next_retry_at')
          .in(
            'sake_id',
            missingRows.map((r) => r.id)
          );
        if (attemptReadError) {
          diagnostics.discover.attemptHistoryReadErrors++;
          errors.push(`attempt-history read: ${attemptReadError.message.slice(0, 120)}`);
        } else {
          (attemptRows || []).forEach((row) => {
            attemptBySakeId.set(row.sake_id, {
              sake_id: row.sake_id,
              attempt_count: row.attempt_count ?? 0,
              success_count: row.success_count ?? 0,
              next_retry_at: row.next_retry_at ?? null,
            });
          });
        }
      }

      const nowMs = Date.now();
      const eligibleRows = missingRows.filter((row) => {
        const history = attemptBySakeId.get(row.id);
        if (!history?.next_retry_at) return true;
        const retryAtMs = Date.parse(history.next_retry_at);
        if (Number.isNaN(retryAtMs)) return true;
        return retryAtMs <= nowMs;
      });
      diagnostics.discover.eligibleRows = eligibleRows.length;
      diagnostics.discover.skippedByBackoff = Math.max(0, missingRows.length - eligibleRows.length);
      let discoverAttempts = 0;

      for (const row of eligibleRows) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          stopReason = stopReason || 'time_budget_reached';
          break;
        }
        if (discoverAttempts >= discoverRowCapThisRun || rateLimited) break;
        discoverAttempts++;
        diagnostics.discover.attemptedRows++;
        const priorAttempt = attemptBySakeId.get(row.id);
        const priorAttemptCount = priorAttempt?.attempt_count ?? 0;
        const priorSuccessCount = priorAttempt?.success_count ?? 0;
        let placed = false;
        let failureReason = 'no_candidates';
        let sawCandidates = false;
        let timedOutDuringRow = false;

        try {
          const { images, debug } = await searchSakeImageCandidates(
            firecrawlKey,
            {
              name: row.name,
              nameJapanese: row.name_japanese,
              brewery: row.brewery,
            },
            'google-only'
          );
          await sleep(DELAY_MS_DISCOVER);
          sawCandidates = images.length > 0;
          diagnostics.discover.candidateUrlsSeen += images.length;
          diagnostics.discover.sourceCandidates.google += debug.sourceCounts.google;
          diagnostics.discover.sourceCandidates.bing += debug.sourceCounts.bing;
          diagnostics.discover.sourceCandidates.sakura += debug.sourceCounts.sakura;
          diagnostics.discover.sourceCandidates.umami += debug.sourceCounts.umami;
          diagnostics.discover.sourceCandidates.sakeTimes += debug.sourceCounts.sakeTimes;
          if (debug.firecrawlErrors.length > 0) {
            diagnostics.discover.firecrawlErrors += debug.firecrawlErrors.length;
            debug.firecrawlErrors.forEach((m) =>
              pushSample(diagnostics.discover.firecrawlErrorSamples, `${row.name}: ${m}`)
            );
          }
          if (images.length === 0) {
            diagnostics.discover.rowsWithNoCandidates++;
          }

          for (const img of images.slice(0, DISCOVER_CANDIDATES_MAX)) {
            if (shouldStopChunk()) {
              hitTimeBudget = true;
              timedOutDuringRow = true;
              failureReason = 'time_budget_reached';
              break;
            }
            if (rateLimited) break;
            if (urlLooksLikeNonSakeProduct(img.url)) {
              diagnostics.discover.candidateUrlFiltered++;
              failureReason = 'candidate_filtered';
              continue;
            }

            try {
              diagnostics.discover.visionChecks++;
              const v = await validateJapaneseSakeProductPhoto(openaiKey, img.url, {
                sakeName: row.name,
                brewery: row.brewery,
              });
              await sleep(DELAY_MS_DISCOVER);

              if (!v.isJapaneseSakeProductPhoto || v.confidence === 'low') {
                diagnostics.discover.visionRejected++;
                failureReason = 'vision_rejected';
                continue;
              }

              diagnostics.discover.downloadAttempts++;
              const dl = await downloadAndStoreWithRetry(
                supabase,
                img.url,
                row.name,
                seenHashes,
                knownPlaceholderHashes
              );
              diagnostics.discover.retryAttempts += dl.retriesUsed;
              const result = dl.result;

              if (result.rateLimited) {
                rateLimited = true;
                diagnostics.discover.rateLimited++;
                stopReason = stopReason || 'rate_limited_discover';
                failureReason = 'rate_limited';
                errors.push('Rate limited during discover — stopping');
                break;
              }

              if (result.skippedPlaceholder) {
                diagnostics.discover.placeholderSkips++;
                failureReason = 'placeholder_skipped';
                continue;
              }

              await supabase
                .from('sake')
                .update({ image_url: result.url, updated_at: new Date().toISOString() })
                .eq('id', row.id);
              sakeDiscovered++;
              diagnostics.discover.placedRows++;
              placed = true;
              failureReason = '';
              break;
            } catch (inner) {
              failed++;
              diagnostics.discover.perRowErrors++;
              const innerMsg = inner instanceof Error ? inner.message : String(inner);
              failureReason = innerMsg.slice(0, 160);
              pushSample(
                diagnostics.discover.downloadErrorSamples,
                `${row.name}: ${innerMsg.slice(0, 140)}`
              );
            }
          }

          if (!placed) {
            /* leave null; try again on a later run */
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          diagnostics.discover.perRowErrors++;
          failureReason = msg.slice(0, 160);
          pushSample(diagnostics.discover.rowErrorSamples, `${row.name}: ${msg.slice(0, 140)}`);
          errors.push(`discover ${row.name}: ${msg.slice(0, 120)}`);
        }

        try {
          const nextAttemptCount = priorAttemptCount + 1;
          const attemptPayload = placed
            ? {
                sake_id: row.id,
                attempt_count: nextAttemptCount,
                success_count: priorSuccessCount + 1,
                last_attempt_at: new Date().toISOString(),
                last_success_at: new Date().toISOString(),
                last_failure_reason: null,
                next_retry_at: null,
                updated_at: new Date().toISOString(),
              }
            : {
                sake_id: row.id,
                attempt_count: nextAttemptCount,
                success_count: priorSuccessCount,
                last_attempt_at: new Date().toISOString(),
                last_failure_reason:
                  timedOutDuringRow || !sawCandidates
                    ? timedOutDuringRow
                      ? 'time_budget_reached'
                      : 'no_candidates'
                    : failureReason || 'discover_failed',
                next_retry_at: computeNextRetryAt(nextAttemptCount, !sawCandidates),
                updated_at: new Date().toISOString(),
              };
          const { error: upsertAttemptError } = await supabase
            .from('sake_image_attempts')
            .upsert(attemptPayload, { onConflict: 'sake_id' });
          if (upsertAttemptError) {
            diagnostics.discover.attemptHistoryWriteErrors++;
            pushSample(
              diagnostics.discover.rowErrorSamples,
              `${row.name}: attempt history ${upsertAttemptError.message.slice(0, 120)}`
            );
          } else {
            attemptBySakeId.set(row.id, {
              sake_id: row.id,
              attempt_count: nextAttemptCount,
              success_count: placed ? priorSuccessCount + 1 : priorSuccessCount,
              next_retry_at: placed ? null : computeNextRetryAt(nextAttemptCount, !sawCandidates),
            });
          }
        } catch (historyErr) {
          diagnostics.discover.attemptHistoryWriteErrors++;
          const historyMsg = historyErr instanceof Error ? historyErr.message : String(historyErr);
          pushSample(
            diagnostics.discover.rowErrorSamples,
            `${row.name}: attempt history ${historyMsg.slice(0, 120)}`
          );
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
      diagnostics.mirror.fetchedRows = sakeExternalRowsFetched;

      const sakesToMirror = (sakes || []).filter(
        (s) => s.image_url && !isSupabaseUrl(s.image_url, supabaseUrl)
      );
      diagnostics.mirror.rowsToMirror = sakesToMirror.length;

      for (const sake of sakesToMirror) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          stopReason = stopReason || 'time_budget_reached';
          break;
        }
        if (rateLimited || mirrorOpsRemaining <= 0) break;

        if (sake.image_url && !isSupabaseUrl(sake.image_url, supabaseUrl)) {
          diagnostics.mirror.attemptedRows++;
          // Skip obvious non-sake URLs before even attempting to download
          if (urlLooksLikeNonSakeProduct(sake.image_url)) {
            await supabase
              .from('sake')
              .update({ image_url: null, updated_at: new Date().toISOString() })
              .eq('id', sake.id);
            skippedPlaceholders++;
            diagnostics.mirror.urlFiltered++;
            diagnostics.mirror.placeholderClears++;
            console.log(`[process-images/mirror] cleared non-sake URL for ${sake.name}: ${sake.image_url}`);
            mirrorOpsRemaining--;
            continue;
          }

          try {
            diagnostics.mirror.downloadAttempts++;
            const dl = await downloadAndStoreWithRetry(
              supabase,
              sake.image_url,
              sake.name,
              seenHashes,
              knownPlaceholderHashes
            );
            diagnostics.mirror.retryAttempts += dl.retriesUsed;
            const result = dl.result;
            mirrorOpsRemaining--;

            if (result.rateLimited) {
              rateLimited = true;
              diagnostics.mirror.rateLimited++;
              stopReason = stopReason || 'rate_limited_mirror';
              errors.push('Rate limited by image host — stopping mirror');
              break;
            }
            if (result.skippedPlaceholder) {
              await supabase
                .from('sake')
                .update({ image_url: null, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              skippedPlaceholders++;
              diagnostics.mirror.placeholderClears++;
            } else {
              await supabase
                .from('sake')
                .update({ image_url: result.url, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              sakeMirrored++;
              diagnostics.mirror.mirroredRows++;
            }
            await sleep(DELAY_MS);
          } catch (err) {
            mirrorOpsRemaining--;
            failed++;
            diagnostics.mirror.downloadErrors++;
            const msg = err instanceof Error ? err.message : String(err);
            pushSample(diagnostics.mirror.errorSamples, `${sake.name}: ${msg.slice(0, 140)}`);
            const normalizedMsg = msg.toLowerCase();
            if (
              msg.includes('Blocked') ||
              msg.includes('Not an image') ||
              msg.includes('Too small') ||
              normalizedMsg.includes('fetch failed') ||
              normalizedMsg.includes('network') ||
              normalizedMsg.includes('econnreset') ||
              normalizedMsg.includes('etimedout') ||
              normalizedMsg.includes('timeout')
            ) {
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
    const discoverAttempts = diagnostics.discover.attemptedRows;
    const discoverPlaced = diagnostics.discover.placedRows;
    const discoverYield =
      discoverAttempts > 0
        ? Number((discoverPlaced / discoverAttempts).toFixed(3))
        : 0;
    const discoverLowYieldAlert =
      discoverAttempts >= 4 &&
      discoverPlaced === 0 &&
      diagnostics.discover.candidateUrlsSeen > 0;
    const discoverNoCandidatesAlert =
      discoverAttempts >= 4 && diagnostics.discover.rowsWithNoCandidates === discoverAttempts;

    const runAgain =
      chunked &&
      !rateLimited &&
      (discoverChunkMode
        ? hitTimeBudget || sakeMissingImage > 0
        : hitTimeBudget || remainingSake > 0 || sakeMissingImage > 0);

    if (!stopReason) {
      if (rateLimited) stopReason = 'rate_limited';
      else if (chunked && hitTimeBudget) stopReason = 'time_budget_reached';
      else if (!runAgain) stopReason = 'queue_caught_up_or_no_progress_needed';
      else stopReason = 'chunk_complete_continue';
    }
    const heartbeat = {
      stage: 'sake-images',
      chunked,
      chunkMode: chunked ? chunkMode : 'full',
      discoverSpeed: discoverChunkMode ? discoverSpeed : 'normal',
      stopReason,
      runAgain,
      progress: {
        mirrored: sakeMirrored,
        discovered: sakeDiscovered,
        auditCleared: sakeAuditCleared,
        failed,
      },
      remaining: {
        external: Math.max(0, remainingSake),
        missing: sakeMissingImage,
      },
      diagnostics: {
        discoverPool: diagnostics.discover.poolRows,
        discoverRandomizedPool: diagnostics.discover.randomizedPoolRows,
        discoverAttempts: diagnostics.discover.attemptedRows,
        discoverPlaced: diagnostics.discover.placedRows,
        mirrorFetched: diagnostics.mirror.fetchedRows,
        mirrorRowsToMirror: diagnostics.mirror.rowsToMirror,
      },
      timestamp: new Date().toISOString(),
    };
    console.log(`[process-images/heartbeat] ${JSON.stringify(heartbeat)}`);
    console.log(
      `[process-images/sake] chunked=${chunked} hitBudget=${hitTimeBudget} stopReason=${stopReason} mirror=${sakeMirrored} discover=${sakeDiscovered} auditCleared=${sakeAuditCleared} failed=${failed} externalRemaining≈${remainingSake} missingImg=${sakeMissingImage} mirrorOps=${mirrorOpsUsed} runAgain=${runAgain}`
    );
    console.log(`[process-images/diag] ${JSON.stringify(diagnostics)}`);

    return res.status(200).json({
      success: true,
      job: 'sake',
      chunked,
      chunkMode: chunked ? chunkMode : undefined,
      discoverSpeed: discoverChunkMode ? discoverSpeed : undefined,
      chunkBudgetMs: chunked ? chunkWallMs : undefined,
      hitTimeBudget: chunked ? hitTimeBudget : undefined,
      stopReason,
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
      discoverHealth:
        discoverAttempts > 0
          ? {
              attempts: discoverAttempts,
              placed: discoverPlaced,
              yield: discoverYield,
              candidateUrlsSeen: diagnostics.discover.candidateUrlsSeen,
              visionChecks: diagnostics.discover.visionChecks,
              lowYieldAlert: discoverLowYieldAlert,
              noCandidatesAlert: discoverNoCandidatesAlert,
            }
          : undefined,
      diagnostics,
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
