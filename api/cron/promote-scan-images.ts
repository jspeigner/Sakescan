import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logBackfillRun } from './lib/backfillState.js';
import { promoteScanImagesBatch } from './lib/promoteScanImages.js';

/** Promote matched user scan photos into sake.image_url (T2). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const q = req.query as Record<string, string | string[] | undefined>;
  const batchRaw = Array.isArray(q.batch) ? q.batch[0] : q.batch;
  const batchSize = Math.min(Math.max(parseInt(batchRaw || '25', 10) || 25, 5), 60);
  const optInRaw = Array.isArray(q.requireOptIn) ? q.requireOptIn[0] : q.requireOptIn;
  const requireOptIn = optInRaw === '1' || optInRaw === 'true';

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const result = await promoteScanImagesBatch(supabase, {
      batchSize,
      openaiKey: openaiKey || undefined,
      // Historical saved scans already imply share-for-history; new opt-in uses catalog_share_opt_in.
      requireOptIn,
    });
    const status =
      result.errors.length > 0 && result.promoted === 0
        ? 'failed'
        : result.errors.length > 0
          ? 'partial'
          : 'ok';

    await logBackfillRun(supabase, {
      job: 'promote-scan-images',
      status,
      stats: result,
      errors: result.errors.slice(0, 10),
    });

    return res.status(200).json({
      success: status !== 'failed',
      job: 'promote-scan-images',
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logBackfillRun(supabase, {
      job: 'promote-scan-images',
      status: 'failed',
      stats: {},
      errors: [msg],
    });
    return res.status(500).json({ error: 'Promote scan images failed', details: msg });
  }
}
