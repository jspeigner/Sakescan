import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  getWineEngineConfig,
  wineEngineConfirmsSake,
  wineEngineSearchByUrl,
} from './cron/lib/wineEngine.js';

/**
 * Identify sake from a label/product image URL using WineEngine collection search.
 * POST { imageUrl: string, limit?: number }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = getWineEngineConfig();
  if (!cfg) {
    return res.status(500).json({
      error: 'WineEngine not configured',
      hint: 'Set WINEENGINE_USERNAME and WINEENGINE_PASSWORD on Vercel.',
    });
  }

  const body = req.body as { imageUrl?: string; limit?: number };
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl.startsWith('http')) {
    return res.status(400).json({ error: 'imageUrl must be a valid http(s) URL' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const search = await wineEngineSearchByUrl(cfg, imageUrl, {
      limit: Math.min(body.limit ?? 3, 10),
    });

    if (search.status !== 'ok') {
      return res.status(200).json({
        matched: false,
        status: search.status,
        errors: search.error,
        matches: [],
      });
    }

    const matches = search.result || [];
    const top = matches[0];
    const sakeId = top?.metadata?.image_id ?? null;

    let sake: Record<string, unknown> | null = null;
    if (sakeId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[wineengine-identify]', msg);
    return res.status(500).json({ error: 'WineEngine identify failed', details: msg });
  }
}
