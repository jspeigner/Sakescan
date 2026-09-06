import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  downloadAndStore,
  isSupabaseUrl,
  isTransientDownloadError,
  shouldClearExternalImageUrlOnError,
  sleep,
  supabaseProjectHost,
} from './lib/imageMirror.js';
import {
  isFirecrawlBypassActive,
  isTrustedImageUrl,
  isTrustedRetailerSource,
  prefilterDiscoverCandidates,
  resetFirecrawlBypassForInvocation,
  searchSakeImageCandidates,
  shouldSpendVisionOnUntrustedCandidate,
  type SakeImageSearchMode,
  shouldClearCatalogUrlAsNonSakeProduct,
  urlLooksLikeNonSakeProduct,
} from './lib/sakeImageDiscovery.js';
import {
  computeDiscoverRetry,
  discoverEligibleBufferTarget,
  discoverRowCapForRun,
  discoverSkipReason,
  isMissingImageUrl,
  prioritizeDiscoverRows,
  shouldScanNextDiscoverPoolPage,
  shouldRunDiscoverFallback,
} from './lib/discoverPolicy.js';
import { getBackfillState, recordDiscoverYield, setBackfillState, type DiscoverHealthState } from './lib/backfillState.js';
import {
  sakeVisionPasses,
  shouldClearHostedImageFromAudit,
  validateJapaneseSakeProductPhoto,
  isOpenAIQuotaError,
  isOpenAIVisionQuotaExceeded,
  resetOpenAIVisionQuotaForInvocation,
} from './lib/sakeImageVision.js';
import {
  provenanceForTrustedRetailer,
  provenanceForWebDiscover,
  sakeImageClearPayload,
  sakeImageUpdatePayload,
  shouldReplaceImage,
} from './lib/imageProvenance.js';
import {
  getWineEngineConfig,
  wineEngineIndexByUrl,
} from './lib/wineEngine.js';
import {
  getWineEngineQuota,
  releaseWineEngineQuota,
  reserveWineEngineQuota,
  type WineEngineQuotaSnapshot,
} from './lib/wineEngineQuota.js';
import { markWineEngineIndexed } from './lib/wineEngineSearchCache.js';
import { embedSakeCatalogImage } from './lib/sakeImageEmbed.js';
import { requireCronOrAdmin } from '../lib/requireCronOrAdmin.js';
const MIRROR_OPS_BUDGET = 220;
/** Attempt to fill missing image_url (Firecrawl + vision + upload). */
const DISCOVER_ROW_CAP = 40;
const DISCOVER_CANDIDATES_MAX = 4;
const DISCOVER_CANDIDATES_MAX_ACCELERATED = 2;
const DISCOVER_CANDIDATES_MAX_TRUSTED = 3;
const DISCOVER_VISION_MAX_PER_ROW_ACCELERATED = 2;
const ATTEMPT_HISTORY_BATCH_SIZE = 80;
/** Spot-check hosted images; clear when vision says not sake. */
const AUDIT_ROW_CAP = 10;
const DELAY_MS = 80;
const DELAY_MS_DISCOVER = 80;
const DELAY_MS_DISCOVER_ACCELERATED = 35;

/** Hobby plan ~10s hard limit; stay under so we return JSON before the platform kills the isolate. */
const CHUNK_WALL_MS = 7500;
/** Discover mode is slower (Firecrawl + vision), so allow a longer chunk budget. */
const DISCOVER_CHUNK_WALL_MS = 25000;
const DISCOVER_CHUNK_WALL_MS_ACCELERATED = 55000;
const DISCOVER_POOL_LIMIT = 2000;
const DISCOVER_POOL_PAGE_LIMIT = 8;
const DISCOVER_HEALTH_KEY = 'discover_health';

type SakeRow = {
  id: string;
  name: string;
  name_japanese: string | null;
  brewery: string;
  image_url: string | null;
  image_quality?: string | null;
};

type SakeImageAttemptRow = {
  sake_id: string;
  attempt_count: number;
  success_count: number;
  next_retry_at: string | null;
  last_failure_reason?: string | null;
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

async function loadAttemptHistoryBySakeIds(
  supabase: ReturnType<typeof createClient>,
  sakeIds: string[]
): Promise<{
  map: Map<string, SakeImageAttemptRow>;
  readErrors: number;
  errorSamples: string[];
  batches: number;
}> {
  const map = new Map<string, SakeImageAttemptRow>();
  const errorSamples: string[] = [];
  let readErrors = 0;
  let batches = 0;

  for (let i = 0; i < sakeIds.length; i += ATTEMPT_HISTORY_BATCH_SIZE) {
    batches++;
    const chunk = sakeIds.slice(i, i + ATTEMPT_HISTORY_BATCH_SIZE);
    const { data, error } = await supabase
      .from('sake_image_attempts')
      .select('sake_id, attempt_count, success_count, next_retry_at, last_failure_reason')
      .in('sake_id', chunk);

    if (error) {
      readErrors++;
      if (errorSamples.length < 5) errorSamples.push(error.message.slice(0, 120));
      continue;
    }

    (data || []).forEach((row) => {
      map.set(row.sake_id, {
        sake_id: row.sake_id,
        attempt_count: row.attempt_count ?? 0,
        success_count: row.success_count ?? 0,
        next_retry_at: row.next_retry_at ?? null,
        last_failure_reason: row.last_failure_reason ?? null,
      });
    });
  }

  return { map, readErrors, errorSamples, batches };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!(await requireCronOrAdmin(req, res))) return;

    const q = req.query as Record<string, string | string[] | undefined>;

    /** Smallest possible response — proves the function bundle loads (use if full job fails). */
    if (req.method === 'GET' && q.quick === '1') {
      return res.status(200).json({
        ok: true,
        ping: 'process-images',
        node: process.version,
      });
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
    const searchParam = Array.isArray(q.search) ? q.search[0] : q.search;
    const discoverSpeed = (speedParam || 'normal').toLowerCase();
    const chunkMode = (modeParam || 'mirror').toLowerCase();
    const discoverChunkMode = chunked && chunkMode === 'discover';
    const acceleratedDiscover = discoverChunkMode && discoverSpeed === 'accelerated';
    const discoverSearchMode: SakeImageSearchMode =
      searchParam === 'full'
        ? 'full'
        : searchParam === 'trusted-first'
          ? 'trusted-first'
          : acceleratedDiscover
            ? 'trusted-first'
            : 'google-only';
    const budgetMsParam = parseInt(Array.isArray(q.budgetMs) ? q.budgetMs[0] : q.budgetMs || '', 10);
    const chunkWallMsOverride =
      Number.isFinite(budgetMsParam) && budgetMsParam > 0 ? budgetMsParam : null;
    const chunkWallMs =
      chunkWallMsOverride ??
      (discoverChunkMode
        ? acceleratedDiscover
          ? DISCOVER_CHUNK_WALL_MS_ACCELERATED
          : DISCOVER_CHUNK_WALL_MS
        : CHUNK_WALL_MS);
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
          wineEngineEnabled: Boolean(getWineEngineConfig()),
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
    const rowCapParam = Array.isArray(q.rowCap) ? q.rowCap[0] : q.rowCap;
    const rowCapOverride = parseInt(rowCapParam || '', 10);
    const hasRowCapOverride = Number.isFinite(rowCapOverride) && rowCapOverride > 0;

    let discoverRowCapThisRun = discoverChunkMode
      ? hasRowCapOverride
        ? Math.min(DISCOVER_ROW_CAP, rowCapOverride)
        : acceleratedDiscover
          ? Math.min(DISCOVER_ROW_CAP, 20)
          : Math.min(DISCOVER_ROW_CAP, 8)
      : chunked
        ? 0
        : Math.min(DISCOVER_ROW_CAP, 24);
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
        poolPagesScanned: 0,
        poolRows: 0,
        randomizedPoolRows: 0,
        eligibleRows: 0,
        skippedByBackoff: 0,
        skippedExhausted: 0,
        skippedAlreadyHasImage: 0,
        skippedWeakUntrusted: 0,
        exhaustedThisRun: 0,
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
        openaiVisionQuotaExceeded: false,
        candidateUrlFiltered: 0,
        visionChecks: 0,
        visionRejected: 0,
        downloadAttempts: 0,
        rateLimited: 0,
        placeholderSkips: 0,
        placedRows: 0,
        retryAttempts: 0,
        attemptHistoryReadErrors: 0,
        attemptHistoryBatches: 0,
        attemptHistoryWriteErrors: 0,
        prefilterDropped: 0,
        environmentalBackoffCleared: 0,
        wineEngineChecks: 0,
        wineEngineRejected: 0,
        wineEngineConfirmed: 0,
        wineEngineIndexed: 0,
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
          // Only clear on high-confidence not-sake. Low/medium negatives and
          // unparseable model replies must not wipe hosted catalog images.
          if (shouldClearHostedImageFromAudit(v)) {
            await supabase
              .from('sake')
              .update(sakeImageClearPayload())
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
    // WineEngine searches/adds are capped by Starter plan quotas (see wineEngineQuota.ts).
    const wineEngineCfg = getWineEngineConfig();
    let wineEngineQuota: WineEngineQuotaSnapshot | null = null;
    if (wineEngineCfg) {
      wineEngineQuota = await getWineEngineQuota(supabase).catch(() => null);
    }

    if (discoverRowCapThisRun > 0) {
      try {
        const priorHealth = await getBackfillState<DiscoverHealthState>(supabase, DISCOVER_HEALTH_KEY, {
          yields: [],
          lowYieldStreak: 0,
        });
        discoverRowCapThisRun = discoverRowCapForRun(discoverRowCapThisRun, priorHealth.yields);
      } catch {
        discoverRowCapThisRun = discoverRowCapForRun(discoverRowCapThisRun);
      }
    }

    if (firecrawlKey && openaiKey && !rateLimited && !hitTimeBudget) {
      resetFirecrawlBypassForInvocation();
      resetOpenAIVisionQuotaForInvocation();
      // Prefer hot sakes (recently scanned) when filling gaps.
      let hotIds = new Set<string>();
      try {
        const { data: recentScans } = await supabase
          .from('scans')
          .select('sake_id')
          .eq('matched', true)
          .not('sake_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(400);
        (recentScans || []).forEach((s) => {
          if (s.sake_id) hotIds.add(s.sake_id);
        });
      } catch {
        hotIds = new Set();
      }

      const nowMs = Date.now();
      const dueRows: SakeRow[] = [];
      const attemptBySakeId = new Map<string, SakeImageAttemptRow>();
      const eligibleBufferTarget = discoverEligibleBufferTarget(discoverRowCapThisRun);

      for (let pageIndex = 0; pageIndex < DISCOVER_POOL_PAGE_LIMIT; pageIndex++) {
        if (shouldStopChunk()) {
          hitTimeBudget = true;
          stopReason = stopReason || 'time_budget_reached';
          break;
        }

        const from = pageIndex * DISCOVER_POOL_LIMIT;
        const to = from + DISCOVER_POOL_LIMIT - 1;
        const { data: missingPool, error: missingPoolError } = await supabase
          .from('sake')
          .select('id, name, name_japanese, brewery, image_url, image_quality')
          .or('image_url.is.null,image_url.eq.')
          .order('updated_at', { ascending: true })
          .range(from, to);

        if (missingPoolError) {
          errors.push(`discover pool read: ${missingPoolError.message.slice(0, 120)}`);
          break;
        }

        const pageRows = (missingPool || []) as SakeRow[];
        diagnostics.discover.poolPagesScanned++;
        diagnostics.discover.poolRows += pageRows.length;

        const missingRows = pageRows.filter((row) => {
          if (isMissingImageUrl(row.image_url)) return true;
          diagnostics.discover.skippedAlreadyHasImage++;
          return false;
        });
        diagnostics.discover.randomizedPoolRows += missingRows.length;

        const attemptHistoryLoad = await loadAttemptHistoryBySakeIds(
          supabase,
          missingRows.map((r) => r.id)
        );
        attemptHistoryLoad.map.forEach((attempt, sakeId) => {
          attemptBySakeId.set(sakeId, attempt);
        });
        diagnostics.discover.attemptHistoryBatches += attemptHistoryLoad.batches;
        if (attemptHistoryLoad.readErrors > 0) {
          diagnostics.discover.attemptHistoryReadErrors += attemptHistoryLoad.readErrors;
          attemptHistoryLoad.errorSamples.forEach((m) =>
            errors.push(`attempt-history read: ${m}`)
          );
        }

        for (const row of missingRows) {
          const skip = discoverSkipReason(attemptBySakeId.get(row.id), nowMs);
          if (skip === 'exhausted') {
            diagnostics.discover.skippedExhausted++;
            continue;
          }
          if (skip === 'backoff') {
            diagnostics.discover.skippedByBackoff++;
            continue;
          }
          dueRows.push(row);
        }

        if (
          !shouldScanNextDiscoverPoolPage({
            pagesScanned: diagnostics.discover.poolPagesScanned,
            maxPages: DISCOVER_POOL_PAGE_LIMIT,
            eligibleRows: dueRows.length,
            rowCap: discoverRowCapThisRun,
            lastPageRows: pageRows.length,
            pageSize: DISCOVER_POOL_LIMIT,
          }) ||
          dueRows.length >= eligibleBufferTarget
        ) {
          break;
        }
      }

      const eligibleRows = prioritizeDiscoverRows(dueRows, attemptBySakeId, hotIds);
      diagnostics.discover.eligibleRows = eligibleRows.length;
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
          const discoverDelayMs = acceleratedDiscover ? DELAY_MS_DISCOVER_ACCELERATED : DELAY_MS_DISCOVER;
          const discoverCandidatesMax = acceleratedDiscover
            ? DISCOVER_CANDIDATES_MAX_ACCELERATED
            : DISCOVER_CANDIDATES_MAX;
          const searchMode = discoverSearchMode;

          let { images: rawImages, debug } = await searchSakeImageCandidates(
            firecrawlKey,
            {
              name: row.name,
              nameJapanese: row.name_japanese,
              brewery: row.brewery,
            },
            searchMode
          );
          // A second search doubles Firecrawl spend. Cron/trusted-first/accelerated skip it.
          if (
            rawImages.length === 0 &&
            searchMode !== 'full' &&
            shouldRunDiscoverFallback({
              accelerated: acceleratedDiscover,
              trustedFirst: searchMode === 'trusted-first',
              chunked: discoverChunkMode,
            })
          ) {
            const fallback = await searchSakeImageCandidates(
              firecrawlKey,
              {
                name: row.name,
                nameJapanese: row.name_japanese,
                brewery: row.brewery,
              },
              'full'
            );
            rawImages = fallback.images;
            debug = fallback.debug;
          }
          const images = prefilterDiscoverCandidates(
            rawImages,
            row.name,
            row.name_japanese ?? undefined,
            row.brewery,
            {
              minRelevance: 2,
              maxCandidates: discoverCandidatesMax + 4,
            }
          );
          diagnostics.discover.prefilterDropped += Math.max(0, rawImages.length - images.length);
          if (!acceleratedDiscover) {
            await sleep(discoverDelayMs);
          }
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

          const trustedCandidates = images.filter((candidate) => isTrustedRetailerSource(candidate.source));
          const otherCandidates = images.filter((candidate) => !isTrustedRetailerSource(candidate.source));
          const candidateQueue = [
            ...trustedCandidates.slice(0, DISCOVER_CANDIDATES_MAX_TRUSTED),
            ...(isOpenAIVisionQuotaExceeded()
              ? []
              : otherCandidates.slice(0, discoverCandidatesMax)),
          ];
          let visionChecksThisRow = 0;

          for (const img of candidateQueue) {
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

            // Trusted retailer URLs skip WineEngine reject — incomplete collections
            // false-match similar bottles and starve discover.
            const trustedEarly =
              isTrustedRetailerSource(img.source) || isTrustedImageUrl(img.url);

            try {
              const trustedSource = trustedEarly;
              const incomingQuality = trustedSource ? 't1' : 't3';
              if (!shouldReplaceImage(row.image_quality, row.image_url, incomingQuality)) {
                failureReason = 'weaker_than_existing';
                continue;
              }

              if (!trustedSource) {
                if (
                  !shouldSpendVisionOnUntrustedCandidate(
                    img.url,
                    img.title,
                    row.name,
                    row.name_japanese,
                    row.brewery
                  )
                ) {
                  diagnostics.discover.skippedWeakUntrusted++;
                  failureReason = 'no_strong_candidates';
                  continue;
                }
                if (isOpenAIVisionQuotaExceeded()) {
                  continue;
                }
                if (
                  acceleratedDiscover &&
                  visionChecksThisRow >= DISCOVER_VISION_MAX_PER_ROW_ACCELERATED
                ) {
                  failureReason = 'vision_cap_reached';
                  continue;
                }
                diagnostics.discover.visionChecks++;
                visionChecksThisRow++;
                const v = await validateJapaneseSakeProductPhoto(openaiKey, img.url, {
                  sakeName: row.name,
                  brewery: row.brewery,
                });
                await sleep(discoverDelayMs);

                if (!sakeVisionPasses(v, { allowMedium: acceleratedDiscover || discoverSearchMode === 'full' })) {
                  diagnostics.discover.visionRejected++;
                  failureReason = 'vision_rejected';
                  continue;
                }
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
              if (result.skippedDuplicate) {
                // Already mirrored identical bytes this run — leave existing URL alone.
                continue;
              }

              await supabase
                .from('sake')
                .update(
                  sakeImageUpdatePayload(
                    result.url,
                    trustedSource ? provenanceForTrustedRetailer() : provenanceForWebDiscover()
                  )
                )
                .eq('id', row.id);
              sakeDiscovered++;
              diagnostics.discover.placedRows++;
              placed = true;
              failureReason = '';
              if (wineEngineCfg) {
                try {
                  const reserved = await reserveWineEngineQuota(supabase, { images: 1 });
                  if (reserved.ok) {
                    wineEngineQuota = reserved.snapshot;
                    try {
                      const indexed = await wineEngineIndexByUrl(wineEngineCfg, {
                        sakeId: row.id,
                        imageUrl: result.url,
                      });
                      if (indexed.status === 'ok') {
                        diagnostics.discover.wineEngineIndexed++;
                        await markWineEngineIndexed(supabase, row.id);
                      } else {
                        const released = await releaseWineEngineQuota(supabase, { images: 1 });
                        if (released.ok) wineEngineQuota = released.snapshot;
                      }
                    } catch {
                      const released = await releaseWineEngineQuota(supabase, { images: 1 });
                      if (released.ok) wineEngineQuota = released.snapshot;
                    }
                  }
                } catch {
                  /* WineEngine index optional — catalog image already placed */
                }
              }
              if (openaiKey) {
                embedSakeCatalogImage(supabase, openaiKey, {
                  id: row.id,
                  name: row.name,
                  brewery: row.brewery,
                  image_url: result.url,
                }).catch(() => undefined);
              }
              break;
            } catch (inner) {
              if (isOpenAIQuotaError(inner)) {
                diagnostics.discover.openaiVisionQuotaExceeded = true;
                failureReason = 'openai_quota_exceeded';
                pushSample(
                  diagnostics.discover.downloadErrorSamples,
                  `${row.name}: OpenAI vision quota exceeded`
                );
                if (!errors.some((e) => e.includes('OpenAI vision quota'))) {
                  errors.push('OpenAI vision quota exceeded — continuing with trusted retailer sources only');
                }
                continue;
              }
              const innerMsg = inner instanceof Error ? inner.message : String(inner);
              // Vision download failures (HTTP 400) are bad candidates — try next URL, don't fail the row.
              if (
                innerMsg.includes('OpenAI vision HTTP 400') ||
                innerMsg.includes('Error while downloading')
              ) {
                diagnostics.discover.visionRejected++;
                failureReason = 'vision_download_failed';
                pushSample(
                  diagnostics.discover.downloadErrorSamples,
                  `${row.name}: ${innerMsg.slice(0, 140)}`
                );
                continue;
              }
              failed++;
              diagnostics.discover.perRowErrors++;
              failureReason = innerMsg.slice(0, 160);
              pushSample(
                diagnostics.discover.downloadErrorSamples,
                `${row.name}: ${innerMsg.slice(0, 140)}`
              );
            }
          }

          if (isOpenAIVisionQuotaExceeded()) {
            diagnostics.discover.openaiVisionQuotaExceeded = true;
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
          const resolvedFailureReason = timedOutDuringRow
            ? 'time_budget_reached'
            : !sawCandidates
              ? 'no_candidates'
              : failureReason || 'discover_failed';
          const retry = computeDiscoverRetry({
            prior: priorAttempt,
            placed,
            failureReason: resolvedFailureReason,
          });
          if (retry.exhausted) diagnostics.discover.exhaustedThisRun++;
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
                last_failure_reason: retry.reason,
                next_retry_at: retry.nextRetryAt,
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
              next_retry_at: placed ? null : retry.nextRetryAt,
              last_failure_reason: placed ? null : retry.reason,
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
          // Heuristic may false-positive on sake retailer paths (/wine-and-sake/, /wine/...).
          // Never null catalog URLs from URL text alone — defer so the queue can rotate.
          if (urlLooksLikeNonSakeProduct(sake.image_url)) {
            diagnostics.mirror.urlFiltered++;
            if (shouldClearCatalogUrlAsNonSakeProduct(sake.image_url)) {
              await supabase
                .from('sake')
                .update(sakeImageClearPayload())
                .eq('id', sake.id);
              skippedPlaceholders++;
              diagnostics.mirror.placeholderClears++;
              console.log(`[process-images/mirror] cleared non-sake URL for ${sake.name}: ${sake.image_url}`);
            } else {
              await supabase
                .from('sake')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              console.log(
                `[process-images/mirror] deferred non-sake-looking URL (kept) for ${sake.name}: ${sake.image_url}`
              );
            }
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
                .update(sakeImageClearPayload())
                .eq('id', sake.id);
              skippedPlaceholders++;
              diagnostics.mirror.placeholderClears++;
            } else if (result.skippedDuplicate) {
              // Shared product-shot bytes already stored earlier this run — keep URL.
            } else {
              // Host rewrite only (same bytes) — do not clear wineengine_indexed_at.
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
            // Never erase a still-valid external URL on transient host/network failures.
            if (shouldClearExternalImageUrlOnError(msg)) {
              await supabase
                .from('sake')
                .update(sakeImageClearPayload())
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
    if (discoverAttempts > 0) {
      try {
        const priorHealth = await getBackfillState<DiscoverHealthState>(supabase, DISCOVER_HEALTH_KEY, {
          yields: [],
          lowYieldStreak: 0,
        });
        await setBackfillState(
          supabase,
          DISCOVER_HEALTH_KEY,
          recordDiscoverYield(priorHealth, discoverAttempts, discoverPlaced)
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`discover health: ${msg.slice(0, 120)}`);
      }
    }
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
        discoverPoolPages: diagnostics.discover.poolPagesScanned,
        discoverRandomizedPool: diagnostics.discover.randomizedPoolRows,
        discoverEligibleRows: diagnostics.discover.eligibleRows,
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
      wineEngine: wineEngineCfg
        ? {
            collectionCount: wineEngineCollectionCount,
            activeInDiscover: wineEngineActive,
            quota: wineEngineQuota
              ? {
                  period: wineEngineQuota.state.period,
                  images: wineEngineQuota.state.images,
                  searches: wineEngineQuota.state.searches,
                  remainingImagesToday: wineEngineQuota.remainingImagesToday,
                  remainingSearchesToday: wineEngineQuota.remainingSearchesToday,
                }
              : null,
          }
        : { disabled: true },
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
              poolPagesScanned: diagnostics.discover.poolPagesScanned,
              poolRows: diagnostics.discover.poolRows,
              eligibleRows: diagnostics.discover.eligibleRows,
              skippedByBackoff: diagnostics.discover.skippedByBackoff,
              skippedExhausted: diagnostics.discover.skippedExhausted,
              exhaustedThisRun: diagnostics.discover.exhaustedThisRun,
              attemptHistoryReadErrors: diagnostics.discover.attemptHistoryReadErrors,
              firecrawlErrors: diagnostics.discover.firecrawlErrors,
              openaiVisionQuotaExceeded:
                diagnostics.discover.openaiVisionQuotaExceeded || isOpenAIVisionQuotaExceeded(),
              lowYieldAlert: discoverLowYieldAlert,
              noCandidatesAlert: discoverNoCandidatesAlert,
            }
          : undefined,
      openaiVisionQuotaExceeded:
        diagnostics.discover.openaiVisionQuotaExceeded || isOpenAIVisionQuotaExceeded()
          ? true
          : undefined,
      firecrawlBypassActive: discoverAttempts > 0 ? isFirecrawlBypassActive() : undefined,
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
