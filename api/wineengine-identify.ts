import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  getWineEngineConfig,
  wineEngineConfirmsSake,
  wineEngineSearchByUrl,
} from './cron/lib/wineEngine.js';
import {
  getWineEngineQuota,
  identifySearchBudget,
  releaseWineEngineQuota,
  reserveWineEngineQuota,
} from './cron/lib/wineEngineQuota.js';

/**
 * Identify sake from a label/product image URL using WineEngine collection search.
 * POST { imageUrl: string, limit?: number }
 * Authorization: Bearer <supabase_access_token>
 * Uses search quota; keeps a monthly reserve for cron discover.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const cfg = getWineEngineConfig();
  if (!cfg) {
    return res.status(500).json({
      error: 'WineEngine not configured',
      hint: 'Set WINEENGINE_USERNAME and WINEENGINE_PASSWORD on Vercel (optional WINEENGINE_ENABLED=false to pause).',
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const body = req.body as { imageUrl?: string; limit?: number };
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl.startsWith('http')) {
    return res.status(400).json({ error: 'imageUrl must be a valid http(s) URL' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const quota = await getWineEngineQuota(supabase);
  if (identifySearchBudget(quota) < 1) {
    return res.status(429).json({
      error: 'WineEngine search quota exhausted',
      hint: 'Starter plan is 1,000 searches/month. Cron keeps a reserve; retry next UTC day/month.',
      quota: {
        searches: quota.state.searches,
        remainingSearches: quota.remainingSearches,
        remainingSearchesToday: quota.remainingSearchesToday,
      },
    });
  }

  const reserved = await reserveWineEngineQuota(supabase, { searches: 1 });
  if (!reserved.ok) {
    return res.status(429).json({
      error: 'WineEngine search quota exhausted',
      reason: reserved.reason,
      quota: reserved.snapshot,
    });
  }

  try {
    const search = await wineEngineSearchByUrl(cfg, imageUrl, {
      limit: Math.min(body.limit ?? 3, 10),
    });

    if (search.status !== 'ok') {
      const released = await releaseWineEngineQuota(supabase, { searches: 1 });
      return res.status(200).json({
        matched: false,
        status: search.status,
        errors: search.error,
        matches: [],
        quota: released.snapshot,
      });
    }

    const matches = search.result || [];
    const top = matches[0];
    const sakeId = top?.metadata?.image_id ?? null;

    let sake: Record<string, unknown> | null = null;
    if (sakeId) {
      const { data } = await supabase.from('sake').select('*').eq('id', sakeId).maybeSingle();
      sake = data;
    }

    const confirm = sakeId
      ? wineEngineConfirmsSake(search, sakeId)
      : { confirmed: false, reason: 'no_image_id_on_match' };

    return res.status(200).json({
      matched: Boolean(sakeId && confirm.confirmed),
      sakeId,
      sake,
      topMatch: top,
      matches,
      queryMetadata: search.query_image?.metadata,
      confirmReason: confirm.reason,
      stats: search.stats,
      quota: reserved.snapshot,
    });
  } catch (e) {
    try {
      await releaseWineEngineQuota(supabase, { searches: 1 });
    } catch {
      /* best-effort rollback */
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[wineengine-identify]', msg);
    return res.status(500).json({ error: 'WineEngine identify failed', details: msg });
  }
}
