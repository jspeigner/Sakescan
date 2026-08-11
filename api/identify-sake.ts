import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { hashImageUrl } from './cron/lib/imageHash.js';
import {
  buildEmbedInput,
  embedText,
  extractLabelTextFromImage,
  matchByEmbedding,
  matchByImageSha256,
} from './cron/lib/sakeImageEmbed.js';
import { getWineEngineConfig, wineEngineConfirmsSake } from './cron/lib/wineEngine.js';
import { getWineEngineQuota, identifySearchBudget } from './cron/lib/wineEngineQuota.js';
import { searchWineEngineCached } from './cron/lib/wineEngineCachedSearch.js';

const LOCAL_ACCEPT_THRESHOLD = 0.62;

/**
 * Local-first sake identify (Phase 2).
 * POST { imageUrl: string, limit?: number, allowWineEngineFallback?: boolean }
 * Authorization: Bearer <supabase_access_token>
 *
 * 1) Exact image SHA-256 hit in sake_image_embeddings
 * 2) Vision extract + embedding KNN
 * 3) Optional WineEngine fallback (quota + Phase 1 cache)
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  if (!openaiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const body = req.body as {
    imageUrl?: string;
    limit?: number;
    allowWineEngineFallback?: boolean;
  };
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!imageUrl.startsWith('http')) {
    return res.status(400).json({ error: 'imageUrl must be a valid http(s) URL' });
  }

  const allowWineEngineFallback = body.allowWineEngineFallback !== false;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { sha256 } = await hashImageUrl(imageUrl);

    // 1) Exact content hash
    const exact = await matchByImageSha256(supabase, sha256);
    if (exact) {
      const { data: sake } = await supabase.from('sake').select('*').eq('id', exact.sakeId).maybeSingle();
      return res.status(200).json({
        matched: true,
        method: 'hash',
        sakeId: exact.sakeId,
        sake,
        similarity: exact.similarity,
        querySha256: sha256,
        labelText: exact.labelText,
      });
    }

    // 2) Vision extract + vector KNN
    const extracted = await extractLabelTextFromImage(openaiKey, imageUrl);
    const embedInput = buildEmbedInput({ labelText: extracted.labelText });
    const embedding = await embedText(openaiKey, embedInput);
    const matches = await matchByEmbedding(supabase, embedding, {
      matchCount: Math.min(body.limit ?? 5, 10),
      matchThreshold: 0.5,
    });
    const top = matches[0];
    if (top && top.similarity >= LOCAL_ACCEPT_THRESHOLD) {
      const { data: sake } = await supabase.from('sake').select('*').eq('id', top.sakeId).maybeSingle();
      return res.status(200).json({
        matched: true,
        method: 'embedding',
        sakeId: top.sakeId,
        sake,
        similarity: top.similarity,
        matches,
        querySha256: sha256,
        labelText: extracted.labelText,
        embedInput,
      });
    }

    // 3) WineEngine fallback
    const cfg = getWineEngineConfig();
    if (allowWineEngineFallback && cfg) {
      const quota = await getWineEngineQuota(supabase);
      const cached = await searchWineEngineCached(supabase, imageUrl, {
        source: 'identify',
        limit: Math.min(body.limit ?? 3, 10),
        cfg,
        allowLive: identifySearchBudget(quota) >= 1,
      });

      if (!cached.quotaSkipped || cached.cacheHit) {
        const search = cached.response;
        if (search.status === 'ok' && search.result?.length) {
          const weTop = search.result[0];
          const sakeId = weTop?.metadata?.image_id ?? null;
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
            method: 'wineengine',
            sakeId,
            sake,
            topMatch: weTop,
            matches: search.result,
            confirmReason: confirm.reason,
            cacheHit: cached.cacheHit,
            querySha256: sha256,
            localMatches: matches,
            labelText: extracted.labelText,
            quota: await getWineEngineQuota(supabase),
          });
        }
      }
    }

    return res.status(200).json({
      matched: false,
      method: matches.length ? 'embedding_low_confidence' : 'no_match',
      sakeId: top?.sakeId ?? null,
      similarity: top?.similarity ?? null,
      matches,
      querySha256: sha256,
      labelText: extracted.labelText,
      embedInput,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[identify-sake]', msg);
    return res.status(500).json({ error: 'Identify failed', details: msg });
  }
}
