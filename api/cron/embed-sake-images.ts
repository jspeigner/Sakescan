import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { embedSakeImagesBatch } from './lib/embedSakeImagesBatch.js';

const DEFAULT_BATCH = 40;

/**
 * Backfill local identify embeddings for catalog images.
 * GET/POST /api/cron/embed-sake-images?batchSize=40
 */
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
  if (!openaiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const q = req.query || {};
  const body = (req.body || {}) as { batchSize?: number };
  const rawBatch = Number.parseInt(
    String(body.batchSize ?? (Array.isArray(q.batchSize) ? q.batchSize[0] : q.batchSize) ?? DEFAULT_BATCH),
    10
  );
  const batchSize = Math.min(Math.max(Number.isFinite(rawBatch) ? rawBatch : DEFAULT_BATCH, 1), 80);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const result = await embedSakeImagesBatch(supabase, openaiKey, { batchSize });
    return res.status(200).json({
      success: !result.quotaExceeded || result.embedded > 0,
      batchSize,
      ...result,
      errors: result.errors.length ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
}
