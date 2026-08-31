import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireCronOrAdmin } from '../lib/requireCronOrAdmin.js';
import { getBackfillState, logBackfillRun, type DiscoverHealthState } from './lib/backfillState.js';
import { DISCOVER_ROW_CAP_DEFAULT, discoverRowCapForRun } from './lib/discoverPolicy.js';
import { invokeProcessImages } from './lib/invokeProcessImages.js';

/**
 * Discover-only cron so missing catalog images keep importing even when the
 * heavier backfill orchestrator times out or fails to finish.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireCronOrAdmin(req, res))) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({
      error: 'Supabase not configured',
      hint: 'Set VITE_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const discoverHealth = await getBackfillState<DiscoverHealthState>(supabase, 'discover_health', {
    yields: [],
    lowYieldStreak: 0,
  });
  const t0 = Date.now();
  const inv = await invokeProcessImages(
    {
      mode: 'discover',
      search: 'trusted-first',
      speed: 'accelerated',
      budgetMs: '90000',
      rowCap: String(discoverRowCapForRun(DISCOVER_ROW_CAP_DEFAULT, discoverHealth.yields)),
    },
    req
  );

  const health = (inv.json?.discoverHealth as Record<string, unknown> | undefined) ?? {};
  const errors = [
    ...(inv.error ? [inv.error] : []),
    ...(((inv.json?.errors as string[] | undefined) ?? []).slice(0, 4)),
  ];
  const status = inv.ok ? 'ok' : 'failed';

  await logBackfillRun(supabase, {
    job: 'images-discover',
    status,
    stats: {
      durationMs: Date.now() - t0,
      phases: [
        {
          phase: 'images-discover',
          status,
          stats: {
            sakeDiscovered: inv.json?.sakeDiscovered,
            discoverHealth: health,
            stopReason: inv.json?.stopReason,
            openaiVisionQuotaExceeded: inv.json?.openaiVisionQuotaExceeded,
            diagnostics: {
              discover: {
                poolPagesScanned: health.poolPagesScanned,
                poolRows: health.poolRows,
                eligibleRows: health.eligibleRows,
                skippedByBackoff: health.skippedByBackoff,
                skippedExhausted: health.skippedExhausted,
                attemptedRows: health.attempts,
                placedRows: health.placed,
              },
            },
          },
        },
      ],
    },
    errors,
  });

  return res.status(inv.ok ? 200 : 500).json({
    success: inv.ok,
    job: 'images-discover',
    runStatus: status,
    durationMs: Date.now() - t0,
    sakeDiscovered: inv.json?.sakeDiscovered,
    discoverHealth: health,
    stopReason: inv.json?.stopReason,
    errors: errors.length ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
