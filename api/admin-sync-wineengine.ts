import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  getWineEngineConfig,
  wineEngineCount,
  wineEnginePing,
} from './cron/lib/wineEngine.js';
import { getWineEngineQuota, WINEENGINE_SYNC_BATCH_MAX } from './cron/lib/wineEngineQuota.js';
import { runWineEngineSyncBatch } from './cron/lib/wineEngineSyncBatch.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
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
  if (userError || !userData.user?.email) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  if (userData.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  if (req.method === 'GET') {
    try {
      const ping = await wineEnginePing(cfg);
      const collectionCount = await wineEngineCount(cfg);
      const quota = await getWineEngineQuota(admin);
      return res.status(200).json({
        success: ping.status === 'ok',
        collectionCount,
        pingStatus: ping.status,
        quota,
        plan: {
          imagesPerMonth: 5000,
          searchesPerMonth: 1000,
          softCaps: { images: 4800, searches: 900 },
          dailyCaps: { images: 160, searches: 30 },
        },
        errors: ping.error?.length ? ping.error : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: 'WineEngine ping failed', details: msg });
    }
  }

  const body = (req.body ?? {}) as { batchSize?: number };
  const requested = Math.min(Math.max(body.batchSize ?? WINEENGINE_SYNC_BATCH_MAX, 1), WINEENGINE_SYNC_BATCH_MAX);

  try {
    const result = await runWineEngineSyncBatch(admin, supabaseUrl, { batchSize: requested });
    return res.status(200).json({
      success: true,
      ...result,
      planNote: 'Starter plan: 5,000 images + 1,000 searches / month. Sync uses image quota only.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
}
