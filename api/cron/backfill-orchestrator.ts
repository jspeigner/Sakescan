import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  getBackfillState,
  logBackfillRun,
  setBackfillState,
  shouldUseAdaptiveDiscover,
  type DiscoverHealthState,
} from './lib/backfillState.js';
import { runSakuraImportBatch } from './lib/importSakuraBatch.js';
import { enrichSakeMetadataBatch } from './lib/sakeMetadataEnrich.js';
import { enrichSakeSpecsBatch } from './lib/sakeSpecEnrich.js';
import { promoteScanImagesBatch } from './lib/promoteScanImages.js';
import { discoverBreweryImagesBatch } from './lib/discoverBreweryImages.js';
import { runWineEngineSyncBatch } from './lib/wineEngineSyncBatch.js';
import { getWineEngineConfig } from './lib/wineEngine.js';
import { getWineEngineQuota } from './lib/wineEngineQuota.js';
import { getWineEngineCacheStats } from './lib/wineEngineSearchCache.js';
import { getEmbeddingCoverage } from './lib/sakeImageEmbed.js';
import { embedSakeImagesBatch } from './lib/embedSakeImagesBatch.js';
import { isFirecrawlBypassActive } from './lib/sakeImageDiscovery.js';
import { invokeProcessImages } from './lib/invokeProcessImages.js';
import { requireCronOrAdmin } from '../lib/requireCronOrAdmin.js';
import { cronBearerMatches } from '../lib/cronAuth.js';
import { DISCOVER_ROW_CAP_DEFAULT, discoverRowCapForRun } from './lib/discoverPolicy.js';

const RUN_BUDGET_MS = 180_000;
const DISCOVER_BUDGET_RESERVE_MS = 8_000;
const DISCOVER_HEALTH_KEY = 'discover_health';
const LAST_RUN_KEY = 'orchestrator_last_run';
const FIRECRAWL_ERROR_RECOMMEND_THRESHOLD = 5;
const LARGE_MISSING_IMAGE_THRESHOLD = 10_000;

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function readSkipFlags() {
  const firecrawlQuotaExceeded = envFlag('FIRECRAWL_QUOTA_EXCEEDED');
  return {
    sakura: envFlag('BACKFILL_SKIP_SAKURA'),
    discover: envFlag('BACKFILL_SKIP_DISCOVER') || firecrawlQuotaExceeded,
    metadataSakura: envFlag('BACKFILL_SKIP_METADATA_SAKURA'),
    firecrawlQuotaExceeded,
  };
}

function firecrawlErrorsFromPhaseStats(stats: Record<string, unknown> | undefined): number {
  if (!stats) return 0;
  const health = stats.discoverHealth as { firecrawlErrors?: number } | undefined;
  if (typeof health?.firecrawlErrors === 'number') return health.firecrawlErrors;
  const diagnostics = stats.diagnostics as { discover?: { firecrawlErrors?: number } } | undefined;
  return diagnostics?.discover?.firecrawlErrors ?? 0;
}

function firecrawlErrorsFromLastRun(lastRun: Record<string, unknown>): number {
  const phases = lastRun.phases as Array<{ phase?: string; stats?: Record<string, unknown> }> | undefined;
  const discover = phases?.find((p) => p.phase === 'images-discover');
  return firecrawlErrorsFromPhaseStats(discover?.stats);
}

function openaiQuotaFromPhaseStats(stats: Record<string, unknown> | undefined): boolean {
  if (!stats) return false;
  const health = stats.discoverHealth as { openaiVisionQuotaExceeded?: boolean } | undefined;
  if (health?.openaiVisionQuotaExceeded) return true;
  if (stats.openaiVisionQuotaExceeded === true) return true;
  return false;
}

function openaiQuotaFromLastRun(lastRun: Record<string, unknown>): boolean {
  const phases = lastRun.phases as Array<{ phase?: string; stats?: Record<string, unknown> }> | undefined;
  const discover = phases?.find((p) => p.phase === 'images-discover');
  return openaiQuotaFromPhaseStats(discover?.stats);
}

function openaiQuotaFromOrchestratorLog(
  log: { stats?: Record<string, unknown> } | null | undefined
): boolean {
  const phases = log?.stats?.phases as Array<{ phase?: string; stats?: Record<string, unknown> }> | undefined;
  const discover = phases?.find((p) => p.phase === 'images-discover');
  return openaiQuotaFromPhaseStats(discover?.stats);
}

function firecrawlErrorsFromOrchestratorLog(
  log: { stats?: Record<string, unknown> } | null | undefined
): number {
  const phases = log?.stats?.phases as Array<{ phase?: string; stats?: Record<string, unknown> }> | undefined;
  const discover = phases?.find((p) => p.phase === 'images-discover');
  return firecrawlErrorsFromPhaseStats(discover?.stats);
}

async function resetEnvironmentalBackoffOnStartup(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const now = new Date().toISOString();
  const patterns = ['openai_quota', 'openai vision http 429', 'firecrawl_quota'];
  let cleared = 0;
  for (const pattern of patterns) {
    const { data, error } = await supabase
      .from('sake_image_attempts')
      .update({ next_retry_at: null, updated_at: now })
      .ilike('last_failure_reason', `%${pattern}%`)
      .gt('next_retry_at', now)
      .select('sake_id');
    if (!error && data) cleared += data.length;
  }
  return cleared;
}

type PhaseResult = {
  phase: string;
  status: 'ok' | 'partial' | 'skipped' | 'failed';
  durationMs: number;
  stats?: Record<string, unknown>;
  errors?: string[];
};

type OrchestratorPhaseLog = {
  phase?: string;
  status?: string;
  stats?: Record<string, unknown>;
};

type OrchestratorRunLog = {
  job?: string;
  status?: string;
  stats?: Record<string, unknown>;
  created_at?: string;
};

type DiscoverSummary = {
  placed: number;
  visionChecks: number;
  yield: number | null;
  firecrawlErrors: number;
  stopReason: unknown;
  runAt: string | null;
};

type PromoteSummary = {
  promoted: number;
  attempted: unknown;
  skippedExisting: unknown;
  skippedUnusableUrl: unknown;
  status: string | null;
  runAt: string | null;
};

function phasesFromLog(log: OrchestratorRunLog | null | undefined): OrchestratorPhaseLog[] {
  const phases = log?.stats?.phases;
  return Array.isArray(phases) ? (phases as OrchestratorPhaseLog[]) : [];
}

function latestDiscoverSummary(logs: OrchestratorRunLog[]): DiscoverSummary {
  for (const log of logs) {
    if (log.job !== 'backfill-orchestrator' && log.job !== 'images-discover') continue;
    const phase = phasesFromLog(log).find((p) => p.phase === 'images-discover');
    if (!phase) continue;

    const stats = phase.stats ?? {};
    const health = (stats.discoverHealth as Record<string, unknown> | undefined) ?? {};
    return {
      placed: typeof health.placed === 'number' ? health.placed : 0,
      visionChecks: typeof health.visionChecks === 'number' ? health.visionChecks : 0,
      yield: typeof health.yield === 'number' ? health.yield : null,
      firecrawlErrors: typeof health.firecrawlErrors === 'number' ? health.firecrawlErrors : 0,
      stopReason: stats.stopReason ?? null,
      runAt: log.created_at ?? null,
    };
  }

  return {
    placed: 0,
    visionChecks: 0,
    yield: null,
    firecrawlErrors: 0,
    stopReason: null,
    runAt: null,
  };
}

function latestPromoteSummary(logs: OrchestratorRunLog[]): PromoteSummary {
  for (const log of logs) {
    if (log.job !== 'backfill-orchestrator') continue;
    const phase = phasesFromLog(log).find((p) => p.phase === 'promote-scan-images');
    if (!phase) continue;

    const stats = phase.stats ?? {};
    return {
      promoted: typeof stats.promoted === 'number' ? stats.promoted : 0,
      attempted: stats.attempted ?? null,
      skippedExisting: stats.skippedExisting ?? null,
      skippedUnusableUrl: stats.skippedUnusableUrl ?? stats.skippedInvalidUrl ?? null,
      status: phase.status ?? null,
      runAt: log.created_at ?? null,
    };
  }

  return {
    promoted: 0,
    attempted: null,
    skippedExisting: null,
    skippedUnusableUrl: null,
    status: null,
    runAt: null,
  };
}

async function countBackfillGaps(supabase: ReturnType<typeof createClient>): Promise<{
  missingImage: number;
  missingDescription: number;
  externalImages: number;
  imageSourceMix: { retailer: number; user_scan: number; web_discover: number; admin: number; unset: number };
  imageQualityMix: { t1: number; t2: number; t3: number };
}> {
  const { count: nullImg } = await supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .is('image_url', null);
  const { count: emptyImg } = await supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .eq('image_url', '');
  const { count: missingDesc } = await supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .is('description', null);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const host = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0];
  let externalQ = supabase
    .from('sake')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .neq('image_url', '');
  if (host) externalQ = externalQ.not('image_url', 'ilike', `%${host}%`);
  externalQ = externalQ.not('image_url', 'ilike', '%supabase.co%');
  const { count: externalImages } = await externalQ;

  const countWhere = async (column: string, value: string | null) => {
    let q = supabase.from('sake').select('id', { count: 'exact', head: true });
    q = value === null ? q.is(column, null) : q.eq(column, value);
    const { count } = await q;
    return count ?? 0;
  };

  const [retailer, user_scan, web_discover, admin, unset, t1, t2, t3] = await Promise.all([
    countWhere('image_source', 'retailer'),
    countWhere('image_source', 'user_scan'),
    countWhere('image_source', 'web_discover'),
    countWhere('image_source', 'admin'),
    countWhere('image_source', null),
    countWhere('image_quality', 't1'),
    countWhere('image_quality', 't2'),
    countWhere('image_quality', 't3'),
  ]);

  return {
    missingImage: (nullImg ?? 0) + (emptyImg ?? 0),
    missingDescription: missingDesc ?? 0,
    externalImages: externalImages ?? 0,
    imageSourceMix: { retailer, user_scan, web_discover, admin, unset },
    imageQualityMix: { t1, t2, t3 },
  };
}

async function runImagesDiscoverPhase(params: {
  req: VercelRequest;
  skipFlags: ReturnType<typeof readSkipFlags>;
  shouldStop: () => boolean;
  firecrawlKey?: string;
  openaiKey?: string;
  prevDiscoverOpenaiQuotaExceeded: boolean;
  deadline: number;
  prioritizeDiscover: boolean;
  adaptiveDiscover: boolean;
  discoverHealth: DiscoverHealthState;
  supabase: ReturnType<typeof createClient>;
  environmentalBackoffCleared: number;
}): Promise<{
  phase: PhaseResult;
  discoverHealth: DiscoverHealthState;
  openaiQuotaRecommendation?: string;
  errors: string[];
  latestDiscover: DiscoverSummary;
}> {
  const {
    req,
    skipFlags,
    shouldStop,
    firecrawlKey,
    openaiKey,
    prevDiscoverOpenaiQuotaExceeded,
    deadline,
    prioritizeDiscover,
    adaptiveDiscover,
    environmentalBackoffCleared,
  } = params;
  let discoverHealth = params.discoverHealth;
  const emptyDiscover: DiscoverSummary = {
    placed: 0,
    visionChecks: 0,
    yield: null,
    firecrawlErrors: 0,
    stopReason: null,
    runAt: new Date().toISOString(),
  };

  if (skipFlags.discover) {
    const skipReason = skipFlags.firecrawlQuotaExceeded
      ? 'FIRECRAWL_QUOTA_EXCEEDED=1'
      : 'BACKFILL_SKIP_DISCOVER=1';
    return {
      phase: {
        phase: 'images-discover',
        status: 'skipped',
        durationMs: 0,
        errors: [skipReason],
      },
      discoverHealth,
      errors: [],
      latestDiscover: { ...emptyDiscover, stopReason: skipReason },
    };
  }

  if (!firecrawlKey || !openaiKey) {
    return {
      phase: {
        phase: 'images-discover',
        status: 'skipped',
        durationMs: 0,
        errors: ['FIRECRAWL_API_KEY and OPENAI_API_KEY required'],
      },
      discoverHealth,
      errors: [],
      latestDiscover: { ...emptyDiscover, stopReason: 'missing_api_keys' },
    };
  }

  if (shouldStop()) {
    return {
      phase: {
        phase: 'images-discover',
        status: 'skipped',
        durationMs: 0,
        errors: ['time_budget_reached before discover'],
      },
      discoverHealth,
      errors: [],
      latestDiscover: { ...emptyDiscover, stopReason: 'time_budget_reached' },
    };
  }

  const t0 = Date.now();
  const openaiRecovered = !prevDiscoverOpenaiQuotaExceeded;
  const remainingForDiscover = Math.max(0, deadline - Date.now() - DISCOVER_BUDGET_RESERVE_MS);
  const discoverBudgetMs = Math.min(
    110_000,
    Math.max(prioritizeDiscover ? 70_000 : 45_000, remainingForDiscover)
  );
  const inv = await invokeProcessImages(
    {
      mode: 'discover',
      search: 'trusted-first',
      speed: openaiRecovered ? 'accelerated' : 'normal',
      budgetMs: String(discoverBudgetMs),
      rowCap: String(
        discoverRowCapForRun(
          prioritizeDiscover ? DISCOVER_ROW_CAP_DEFAULT : 10,
          params.discoverHealth.yields
        )
      ),
    },
    req
  );
  const discoverJson = inv.json;
  const health = discoverJson?.discoverHealth as
    | {
        attempts?: number;
        placed?: number;
        yield?: number;
        firecrawlErrors?: number;
        visionChecks?: number;
        openaiVisionQuotaExceeded?: boolean;
      }
    | undefined;
  const attempts =
    health?.attempts ??
    (discoverJson?.diagnostics as { discover?: { attemptedRows?: number } })?.discover?.attemptedRows ??
    0;
  const placed =
    health?.placed ??
    (discoverJson?.sakeDiscovered as number | undefined) ??
    (discoverJson?.diagnostics as { discover?: { placedRows?: number } })?.discover?.placedRows ??
    0;
  const errors: string[] = [];
  try {
    discoverHealth = await getBackfillState<DiscoverHealthState>(
      params.supabase,
      DISCOVER_HEALTH_KEY,
      discoverHealth
    );
  } catch {
    /* process-images already persisted yield when possible */
  }

  const discoverErrors = [
    ...(inv.error ? [inv.error] : []),
    ...(((discoverJson?.errors as string[] | undefined) ?? []).slice(0, 4)),
  ];
  if (inv.error) errors.push(`discover: ${inv.error}`);

  const openaiQuotaRecommendation =
    discoverJson?.openaiVisionQuotaExceeded === true || health?.openaiVisionQuotaExceeded === true
      ? 'OpenAI vision quota exceeded during discover. Restore OpenAI billing/credits; trusted retailer images can still be placed without vision.'
      : undefined;

  return {
    phase: {
      phase: 'images-discover',
      status: inv.ok ? 'ok' : 'failed',
      durationMs: Date.now() - t0,
      stats: {
        adaptiveDiscover,
        lowYieldStreak: discoverHealth.lowYieldStreak,
        sakeDiscovered: discoverJson?.sakeDiscovered,
        discoverHealth: health,
        environmentalBackoffCleared,
        openaiVisionQuotaExceeded:
          discoverJson?.openaiVisionQuotaExceeded === true || health?.openaiVisionQuotaExceeded === true,
        firecrawlBypassActive: discoverJson?.firecrawlBypassActive,
        stopReason: discoverJson?.stopReason,
        discoverBudgetMs,
        chunkBudgetMs: discoverJson?.chunkBudgetMs,
        attemptHistoryReadErrors: (
          discoverJson?.diagnostics as { discover?: { attemptHistoryReadErrors?: number } } | undefined
        )?.discover?.attemptHistoryReadErrors,
      },
      errors: discoverErrors.length ? discoverErrors : undefined,
    },
    discoverHealth,
    openaiQuotaRecommendation,
    errors,
    latestDiscover: {
      placed: typeof placed === 'number' ? placed : 0,
      visionChecks: typeof health?.visionChecks === 'number' ? health.visionChecks : 0,
      yield: typeof health?.yield === 'number' ? health.yield : null,
      firecrawlErrors: typeof health?.firecrawlErrors === 'number' ? health.firecrawlErrors : 0,
      stopReason: discoverJson?.stopReason ?? null,
      runAt: new Date().toISOString(),
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = req.query as Record<string, string | string[] | undefined>;
  const statsOnly = req.method === 'GET' && q.stats === '1';
  const hasCronAuth = cronBearerMatches(req.headers, process.env.CRON_SECRET);

  if (!statsOnly && !(await requireCronOrAdmin(req, res))) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({
      error: 'Supabase not configured',
      hint: 'Set VITE_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const skipFlags = readSkipFlags();

  if (statsOnly) {
    const gaps = await countBackfillGaps(supabase);
    const discoverHealth = await getBackfillState<DiscoverHealthState>(supabase, DISCOVER_HEALTH_KEY, {
      yields: [],
      lowYieldStreak: 0,
    });
    const lastRun = await getBackfillState<Record<string, unknown>>(supabase, LAST_RUN_KEY, {});

    const { data: recentLogs } = await supabase
      .from('backfill_run_log')
      .select('job, status, stats, created_at')
      .in('job', ['backfill-orchestrator', 'images-discover'])
      .order('created_at', { ascending: false })
      .limit(16);
    const orchestratorLogs = (recentLogs ?? []) as OrchestratorRunLog[];
    const lastRunDiscover =
      lastRun.latestDiscover && typeof lastRun.latestDiscover === 'object'
        ? (lastRun.latestDiscover as DiscoverSummary)
        : null;

    const lastOrchestratorLog = orchestratorLogs.find((l) => l.job === 'backfill-orchestrator');
    const lastDiscoverFirecrawlErrors =
      firecrawlErrorsFromOrchestratorLog(lastOrchestratorLog) || firecrawlErrorsFromLastRun(lastRun);
    const lastDiscoverOpenaiQuotaExceeded =
      openaiQuotaFromOrchestratorLog(lastOrchestratorLog) || openaiQuotaFromLastRun(lastRun);
    const discoverQuotaRecommendation =
      !skipFlags.discover && lastDiscoverFirecrawlErrors >= FIRECRAWL_ERROR_RECOMMEND_THRESHOLD
        ? `Last discover run logged ${lastDiscoverFirecrawlErrors} Firecrawl errors. Set BACKFILL_SKIP_DISCOVER=1 or FIRECRAWL_QUOTA_EXCEEDED=1 on Vercel until quota is restored.`
        : undefined;
    const openaiQuotaRecommendation = lastDiscoverOpenaiQuotaExceeded
      ? 'OpenAI vision quota exceeded on the last discover run. Restore OpenAI billing/credits; trusted retailer images (Sakura/Umami/Sake Times) can still be placed without vision.'
      : undefined;

    const latestDiscoverFromLogs = latestDiscoverSummary(orchestratorLogs);
    const latestDiscover =
      lastRunDiscover?.runAt &&
      (!latestDiscoverFromLogs.runAt || lastRunDiscover.runAt > latestDiscoverFromLogs.runAt)
        ? lastRunDiscover
        : latestDiscoverFromLogs;

    const publicStats = {
      success: true,
      statsOnly: true,
      gaps,
      discoverHealth,
      latestDiscover,
      latestPromote: latestPromoteSummary(orchestratorLogs),
      lastRunSummary: {
        status: typeof lastRun.status === 'string' ? lastRun.status : null,
        startedAt: typeof lastRun.startedAt === 'string' ? lastRun.startedAt : null,
        timestamp: typeof lastRun.timestamp === 'string' ? lastRun.timestamp : null,
        durationMs: typeof lastRun.durationMs === 'number' ? lastRun.durationMs : null,
        prioritizeDiscover: lastRun.prioritizeDiscover === true,
      },
      env: {
        skipFlags,
        firecrawlBypassActive: isFirecrawlBypassActive(),
        lastDiscoverFirecrawlErrors,
        lastDiscoverOpenaiQuotaExceeded,
        discoverQuotaRecommendation,
        openaiQuotaRecommendation,
      },
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json({
      ...publicStats,
      ...(hasCronAuth
        ? {
            lastRun,
            recentLogs: recentLogs ?? [],
            env: {
              ...publicStats.env,
              firecrawl: Boolean(firecrawlKey),
              openai: Boolean(openaiKey),
              wineEngine: Boolean(getWineEngineConfig()),
              wineEngineQuota: getWineEngineConfig()
                ? await getWineEngineQuota(supabase).catch(() => null)
                : null,
              wineEngineCache: await getWineEngineCacheStats(supabase, 24).catch(() => null),
              embeddingCoverage: await getEmbeddingCoverage(supabase).catch(() => null),
            },
          }
        : {}),
    });
  }

  const runStarted = Date.now();
  const deadline = runStarted + RUN_BUDGET_MS;
  const shouldStop = (): boolean => Date.now() >= deadline;

  const initialGaps = await countBackfillGaps(supabase);
  const prioritizeDiscover = initialGaps.missingImage >= LARGE_MISSING_IMAGE_THRESHOLD;

  let environmentalBackoffCleared = 0;
  try {
    environmentalBackoffCleared = await resetEnvironmentalBackoffOnStartup(supabase);
    if (environmentalBackoffCleared > 0) {
      console.log(
        `[backfill-orchestrator] cleared environmental backoff for ${environmentalBackoffCleared} rows`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[backfill-orchestrator] backoff reset failed: ${msg}`);
  }

  const phases: PhaseResult[] = [];
  const runErrors: string[] = [];
  let discoverHealth = await getBackfillState<DiscoverHealthState>(supabase, DISCOVER_HEALTH_KEY, {
    yields: [],
    lowYieldStreak: 0,
  });
  const adaptiveDiscover = shouldUseAdaptiveDiscover(discoverHealth);
  let discoverQuotaRecommendation: string | undefined;
  let openaiQuotaRecommendation: string | undefined;

  const { data: priorOrchestratorLogs } = await supabase
    .from('backfill_run_log')
    .select('job, stats')
    .eq('job', 'backfill-orchestrator')
    .order('created_at', { ascending: false })
    .limit(1);
  const prevDiscoverFirecrawlErrors = firecrawlErrorsFromOrchestratorLog(priorOrchestratorLogs?.[0]);
  const prevDiscoverOpenaiQuotaExceeded = openaiQuotaFromOrchestratorLog(priorOrchestratorLogs?.[0]);
  if (!skipFlags.discover && prevDiscoverFirecrawlErrors >= FIRECRAWL_ERROR_RECOMMEND_THRESHOLD) {
    discoverQuotaRecommendation = `Previous discover run logged ${prevDiscoverFirecrawlErrors} Firecrawl errors. Set BACKFILL_SKIP_DISCOVER=1 or FIRECRAWL_QUOTA_EXCEEDED=1 on Vercel until quota is restored.`;
    console.warn(`[backfill-orchestrator] ${discoverQuotaRecommendation}`);
  }
  if (prevDiscoverOpenaiQuotaExceeded) {
    openaiQuotaRecommendation =
      'Previous discover run hit OpenAI vision quota. Restore OpenAI billing/credits; trusted retailer images can still be placed without vision.';
    console.warn(`[backfill-orchestrator] ${openaiQuotaRecommendation}`);
  }

  let latestDiscoverSnapshot: DiscoverSummary | null = null;
  const applyDiscover = async () => {
    if (phases.some((p) => p.phase === 'images-discover')) return;
    const result = await runImagesDiscoverPhase({
      req,
      skipFlags,
      shouldStop,
      firecrawlKey,
      openaiKey,
      prevDiscoverOpenaiQuotaExceeded,
      deadline,
      prioritizeDiscover,
      adaptiveDiscover,
      discoverHealth,
      supabase,
      environmentalBackoffCleared,
    });
    phases.push(result.phase);
    discoverHealth = result.discoverHealth;
    runErrors.push(...result.errors);
    latestDiscoverSnapshot = result.latestDiscover;
    if (result.openaiQuotaRecommendation) {
      openaiQuotaRecommendation = result.openaiQuotaRecommendation;
    }
    try {
      await setBackfillState(supabase, LAST_RUN_KEY, {
        job: 'backfill-orchestrator',
        status: 'running',
        startedAt: new Date(runStarted).toISOString(),
        timestamp: new Date().toISOString(),
        prioritizeDiscover,
        adaptiveDiscover,
        latestDiscover: result.latestDiscover,
        skipFlags,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[backfill-orchestrator] mid-run discover state write failed: ${msg}`);
    }
  };

  try {
    await setBackfillState(supabase, LAST_RUN_KEY, {
      job: 'backfill-orchestrator',
      status: 'running',
      startedAt: new Date(runStarted).toISOString(),
      timestamp: new Date().toISOString(),
      prioritizeDiscover,
      adaptiveDiscover,
      skipFlags,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[backfill-orchestrator] start heartbeat write failed: ${msg}`);
  }

  try {
  // When thousands of images are missing, discover first so catalog fill is not
  // starved by metadata / WineEngine / embed work (or lost if those phases hang).
  if (prioritizeDiscover) {
    await applyDiscover();
  }

  // Phase 0: promote matched user scans → catalog (T2) — highest leverage gap fill
  if (envFlag('BACKFILL_SKIP_PROMOTE_SCANS')) {
    phases.push({
      phase: 'promote-scan-images',
      status: 'skipped',
      durationMs: 0,
      errors: ['BACKFILL_SKIP_PROMOTE_SCANS=1'],
    });
  } else if (!shouldStop()) {
    const t0 = Date.now();
    try {
      const promote = await promoteScanImagesBatch(supabase, {
        batchSize: prioritizeDiscover ? 30 : 22,
        openaiKey: openaiKey || undefined,
        // Never promote declined / non-opted-in scan photos into the public catalog.
        requireOptIn: true,
      });
      // Unusable local file:// scan URLs are expected until mobile uploads to Storage —
      // don't fail the whole orchestrator run for them.
      const hardErrors = promote.errors.filter(
        (e) => !e.toLowerCase().includes('file://') && !e.toLowerCase().includes('failed to download image')
      );
      phases.push({
        phase: 'promote-scan-images',
        status:
          hardErrors.length > 0 && promote.promoted === 0
            ? 'failed'
            : hardErrors.length
              ? 'partial'
              : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          candidates: promote.candidates,
          attempted: promote.attempted,
          promoted: promote.promoted,
          skippedVision: promote.skippedVision,
          skippedWineEngine: promote.skippedWineEngine,
          skippedExisting: promote.skippedExisting,
          skippedUnusableUrl: promote.skippedUnusableUrl,
        },
        errors: hardErrors.length ? hardErrors.slice(0, 6) : undefined,
      });
      if (hardErrors.length) runErrors.push(...hardErrors.slice(0, 3));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({
        phase: 'promote-scan-images',
        status: 'failed',
        durationMs: Date.now() - t0,
        errors: [msg],
      });
      runErrors.push(`promote: ${msg.slice(0, 120)}`);
    }
  }

  // Phase 1: Sakura retailer import — never starve when images are missing (only explicit skip)
  if (skipFlags.sakura) {
    phases.push({
      phase: 'sakura-import',
      status: 'skipped',
      durationMs: 0,
      errors: ['BACKFILL_SKIP_SAKURA=1'],
    });
  } else if (firecrawlKey && !shouldStop()) {
    const t0 = Date.now();
    try {
      const sakura = await runSakuraImportBatch(supabase, supabaseUrl, firecrawlKey, {
        pagesPerRun: 1,
      });
      phases.push({
        phase: 'sakura-import',
        status: sakura.errors.length > 0 ? 'partial' : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          scraped: sakura.scraped,
          matched: sakura.matched,
          updated: sakura.updated,
          inserted: sakura.inserted,
          imageStored: sakura.imageStored,
          filterIndex: sakura.filterIndex,
        },
        errors: sakura.errors.length ? sakura.errors.slice(0, 8) : undefined,
      });
      if (sakura.errors.length) runErrors.push(...sakura.errors.slice(0, 4));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({ phase: 'sakura-import', status: 'failed', durationMs: Date.now() - t0, errors: [msg] });
      runErrors.push(`sakura: ${msg.slice(0, 120)}`);
    }
  } else if (!firecrawlKey) {
    phases.push({ phase: 'sakura-import', status: 'skipped', durationMs: 0, errors: ['FIRECRAWL_API_KEY missing'] });
  }

  // Phase 2: metadata enrich (descriptions only when missing)
  if (!shouldStop()) {
    const t0 = Date.now();
    try {
      const meta = await enrichSakeMetadataBatch(supabase, {
        batchSize: adaptiveDiscover ? 35 : 28,
        firecrawlKey: skipFlags.metadataSakura ? undefined : firecrawlKey || undefined,
        openaiKey: openaiKey || undefined,
      });
      phases.push({
        phase: 'metadata',
        status: meta.errors.length > 0 ? 'partial' : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          attempted: meta.attempted,
          enriched: meta.enriched,
          fromSakura: meta.fromSakura,
          fromLlm: meta.fromLlm,
          fromStructured: meta.fromStructured,
        },
        errors: meta.errors.length ? meta.errors.slice(0, 6) : undefined,
      });
      if (meta.errors.length) runErrors.push(...meta.errors.slice(0, 3));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({ phase: 'metadata', status: 'failed', durationMs: Date.now() - t0, errors: [msg] });
      runErrors.push(`metadata: ${msg.slice(0, 120)}`);
    }
  }

  // Phase 2b: sparse spec enrich (polishing / ABV / rice / SMV)
  if (!shouldStop() && !envFlag('BACKFILL_SKIP_SPEC_ENRICH')) {
    const t0 = Date.now();
    try {
      const specs = await enrichSakeSpecsBatch(supabase, {
        batchSize: 40,
        firecrawlKey: skipFlags.metadataSakura ? undefined : firecrawlKey || undefined,
      });
      phases.push({
        phase: 'spec-enrich',
        status: specs.errors.length > 0 && specs.updated === 0 ? 'failed' : specs.errors.length ? 'partial' : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          attempted: specs.attempted,
          updated: specs.updated,
          fromDescription: specs.fromDescription,
          fromSakura: specs.fromSakura,
        },
        errors: specs.errors.length ? specs.errors.slice(0, 6) : undefined,
      });
      if (specs.errors.length) runErrors.push(...specs.errors.slice(0, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({ phase: 'spec-enrich', status: 'failed', durationMs: Date.now() - t0, errors: [msg] });
      runErrors.push(`spec-enrich: ${msg.slice(0, 120)}`);
    }
  }

  // Phase 3: image discover (delegated). Runs earlier when the missing-image
  // backlog is large so later phases cannot starve or hide it.
  await applyDiscover();

  // Phase 4: mirror external URLs
  if (!shouldStop()) {
    const t0 = Date.now();
    const inv = await invokeProcessImages({ mode: 'mirror' }, req);
    phases.push({
      phase: 'images-mirror',
      status: inv.ok ? 'ok' : 'failed',
      durationMs: Date.now() - t0,
      stats: {
        sakeMirrored: inv.json?.sakeMirrored,
        remaining: inv.json?.remaining,
        stopReason: inv.json?.stopReason,
      },
      errors: inv.error ? [inv.error] : undefined,
    });
    if (inv.error) runErrors.push(`mirror: ${inv.error}`);
  }

  // Phase 5: WineEngine sync (Starter plan: max 8 image adds/run, monthly soft caps)
  if (!shouldStop() && getWineEngineConfig() && !envFlag('BACKFILL_SKIP_WINEENGINE')) {
    const t0 = Date.now();
    try {
      const we = await runWineEngineSyncBatch(supabase, supabaseUrl, {
        batchSize: 8,
      });
      phases.push({
        phase: 'wineengine-sync',
        status:
          we.errors.length > 0 && we.processed > 0
            ? 'partial'
            : we.errors.length && we.processed === 0
              ? 'skipped'
              : we.errors.length
                ? 'failed'
                : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          offset: we.offset,
          processed: we.processed,
          added: we.added,
          failed: we.failed,
          skippedQuota: we.skippedQuota,
          collectionCount: we.collectionCount,
          hasMore: we.hasMore,
          quota: we.quota
            ? {
                images: we.quota.state.images,
                searches: we.quota.state.searches,
                remainingImagesToday: we.quota.remainingImagesToday,
                remainingSearchesToday: we.quota.remainingSearchesToday,
              }
            : null,
        },
        errors: we.errors.length ? we.errors.slice(0, 6) : undefined,
      });
      if (we.errors.length && we.added === 0 && we.skippedQuota === 0) {
        runErrors.push(...we.errors.slice(0, 3));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({ phase: 'wineengine-sync', status: 'failed', durationMs: Date.now() - t0, errors: [msg] });
      runErrors.push(`wineengine: ${msg.slice(0, 120)}`);
    }
  } else {
    phases.push({
      phase: 'wineengine-sync',
      status: 'skipped',
      durationMs: 0,
      errors: [
        envFlag('BACKFILL_SKIP_WINEENGINE')
          ? 'BACKFILL_SKIP_WINEENGINE is set'
          : 'WineEngine disabled or credentials missing (set WINEENGINE_USERNAME/PASSWORD; use WINEENGINE_ENABLED=false to pause)',
      ],
    });
  }

  // Phase 5b: local identify embedding backfill (OpenAI vision extract + embeddings)
  if (!shouldStop() && openaiKey && !envFlag('BACKFILL_SKIP_EMBED')) {
    const t0 = Date.now();
    try {
      const emb = await embedSakeImagesBatch(supabase, openaiKey, { batchSize: 20 });
      phases.push({
        phase: 'embed-sake-images',
        status: emb.quotaExceeded ? 'partial' : emb.errors.length && emb.embedded === 0 ? 'failed' : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          candidates: emb.candidates,
          embedded: emb.embedded,
          failed: emb.failed,
          quotaExceeded: emb.quotaExceeded,
          coverage: emb.coverage,
        },
        errors: emb.errors.length ? emb.errors.slice(0, 6) : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({ phase: 'embed-sake-images', status: 'failed', durationMs: Date.now() - t0, errors: [msg] });
      runErrors.push(`embed: ${msg.slice(0, 120)}`);
    }
  } else if (!openaiKey) {
    phases.push({
      phase: 'embed-sake-images',
      status: 'skipped',
      durationMs: 0,
      errors: ['OPENAI_API_KEY missing'],
    });
  }

  // Phase 6: brewery image discover (gallery promote + website og:image)
  if (!shouldStop() && !envFlag('BACKFILL_SKIP_BREWERY_DISCOVER')) {
    const t0 = Date.now();
    try {
      const brew = await discoverBreweryImagesBatch(supabase, { batchSize: 10 });
      phases.push({
        phase: 'brewery-discover',
        status: brew.errors.length > 0 && brew.fromGallery + brew.fromWebsite === 0 ? 'partial' : 'ok',
        durationMs: Date.now() - t0,
        stats: {
          attempted: brew.attempted,
          fromGallery: brew.fromGallery,
          fromWebsite: brew.fromWebsite,
        },
        errors: brew.errors.length ? brew.errors.slice(0, 6) : undefined,
      });
      if (brew.errors.length) runErrors.push(...brew.errors.slice(0, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push({ phase: 'brewery-discover', status: 'failed', durationMs: Date.now() - t0, errors: [msg] });
      runErrors.push(`brewery-discover: ${msg.slice(0, 120)}`);
    }
  }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    runErrors.push(`orchestrator: ${msg.slice(0, 160)}`);
    phases.push({
      phase: 'orchestrator',
      status: 'failed',
      durationMs: Date.now() - runStarted,
      errors: [msg],
    });
  }

  let gaps = initialGaps;
  try {
    gaps = await countBackfillGaps(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    runErrors.push(`gap count: ${msg.slice(0, 120)}`);
  }
  const durationMs = Date.now() - runStarted;
  const anyFailed = phases.some((p) => p.status === 'failed');
  const anyPartial = phases.some((p) => p.status === 'partial');
  const runStatus = anyFailed ? 'failed' : anyPartial ? 'partial' : 'ok';

  const heartbeat = {
    job: 'backfill-orchestrator',
    status: runStatus,
    durationMs,
    startedAt: new Date(runStarted).toISOString(),
    adaptiveDiscover,
    prioritizeDiscover,
    environmentalBackoffCleared,
    discoverHealth,
    latestDiscover: latestDiscoverSnapshot,
    skipFlags,
    firecrawlBypassActive: isFirecrawlBypassActive(),
    discoverQuotaRecommendation,
    openaiQuotaRecommendation,
    gaps,
    phases: phases.map((p) => ({
      phase: p.phase,
      status: p.status,
      durationMs: p.durationMs,
      errors: p.errors?.slice(0, 3),
    })),
    errors: runErrors.slice(0, 8),
    timestamp: new Date().toISOString(),
  };

  try {
    await setBackfillState(supabase, LAST_RUN_KEY, heartbeat);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    runErrors.push(`heartbeat state: ${msg.slice(0, 120)}`);
    console.warn(`[backfill-orchestrator] heartbeat state write failed: ${msg}`);
  }
  try {
    await setBackfillState(supabase, DISCOVER_HEALTH_KEY, discoverHealth);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[backfill-orchestrator] discover health state write failed: ${msg}`);
  }
  await logBackfillRun(supabase, {
    job: 'backfill-orchestrator',
    status: runStatus,
    stats: { durationMs, gaps, phases, adaptiveDiscover },
    errors: runErrors.slice(0, 12),
  });

  console.log(`[backfill-orchestrator] ${JSON.stringify(heartbeat)}`);

  return res.status(200).json({
    success: runStatus !== 'failed',
    job: 'backfill-orchestrator',
    runStatus,
    durationMs,
    budgetMs: RUN_BUDGET_MS,
    adaptiveDiscover,
    prioritizeDiscover,
    environmentalBackoffCleared,
    discoverHealth,
    skipFlags,
    firecrawlBypassActive: isFirecrawlBypassActive(),
    discoverQuotaRecommendation,
    openaiQuotaRecommendation,
    gaps,
    phases,
    nextActions: {
      missingImage: gaps.missingImage > 0 ? 'continue discover cron' : 'images caught up',
      missingDescription: gaps.missingDescription > 0 ? 'metadata enrich continues' : 'descriptions caught up',
      externalImages: gaps.externalImages > 0 ? 'mirror continues' : 'mirror caught up',
      wineEngine: getWineEngineConfig()
        ? 'Starter plan caps: 5k images / 1k searches per month (soft 4800/900); sync ≤8 adds/run; SHA-256 search cache'
        : 'disabled — credentials missing or WINEENGINE_ENABLED=false',
      localIdentify: 'POST /api/identify-sake (hash + embeddings, WineEngine fallback)',
      embedImages: 'orchestrator phase embed-sake-images (≤20/run)',
      promoteScans: 'runs every orchestrator tick',
      breweryImages: 'discover + daily mirror cron',
    },
    errors: runErrors.length ? runErrors.slice(0, 15) : undefined,
    timestamp: new Date().toISOString(),
  });
}
