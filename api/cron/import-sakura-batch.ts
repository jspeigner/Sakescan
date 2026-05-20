import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logBackfillRun } from './lib/backfillState.js';
import { runSakuraImportBatch } from './lib/importSakuraBatch.js';

/** Standalone Sakura import cron (also run inside backfill-orchestrator). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  if (!firecrawlKey) {
    return res.status(500).json({ error: 'FIRECRAWL_API_KEY not configured' });
  }

  const q = req.query as Record<string, string | string[] | undefined>;
  const pagesRaw = Array.isArray(q.pages) ? q.pages[0] : q.pages;
  const pagesPerRun = Math.min(Math.max(parseInt(pagesRaw || '1', 10) || 1, 1), 2);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const result = await runSakuraImportBatch(supabase, supabaseUrl, firecrawlKey, { pagesPerRun });
    const status = result.errors.length > 0 ? 'partial' : 'ok';

    await logBackfillRun(supabase, {
      job: 'import-sakura-batch',
      status,
      stats: result,
      errors: result.errors.slice(0, 10),
    });

    return res.status(200).json({
      success: status !== 'failed',
      job: 'import-sakura-batch',
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logBackfillRun(supabase, {
      job: 'import-sakura-batch',
      status: 'failed',
      stats: {},
      errors: [msg],
    });
    return res.status(500).json({ error: 'Sakura import failed', details: msg });
  }
}
