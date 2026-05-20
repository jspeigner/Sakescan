import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  getWineEngineConfig,
  wineEngineAddByUrl,
  wineEngineCount,
  wineEnginePing,
} from './cron/lib/wineEngine.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';
const DEFAULT_BATCH = 40;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = getWineEngineConfig();
  if (!cfg) {
    return res.status(500).json({
      error: 'WineEngine not configured',
      hint: 'Set WINEENGINE_USERNAME and WINEENGINE_PASSWORD on Vercel.',
    });
  }

  if (req.method === 'GET') {
    try {
      const ping = await wineEnginePing(cfg);
      const collectionCount = await wineEngineCount(cfg);
      return res.status(200).json({
        success: ping.status === 'ok',
        collectionCount,
        pingStatus: ping.status,
        errors: ping.error?.length ? ping.error : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: 'WineEngine ping failed', details: msg });
    }
  }

  const authHeader = req.headers.authorization;
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) {
    return res.status(401).json({ error: 'Missing authorization' });
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

  const body = (req.body ?? {}) as { batchSize?: number; offset?: number };
  const batchSize = Math.min(Math.max(body.batchSize ?? DEFAULT_BATCH, 1), 80);
  const offset = Math.max(body.offset ?? 0, 0);

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const projectHost = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0];

  let query = admin
    .from('sake')
    .select('id, name, image_url')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .order('updated_at', { ascending: true });

  if (projectHost) {
    query = query.ilike('image_url', `%${projectHost}%`);
  }

  const { data: rows, error } = await query.range(offset, offset + batchSize - 1);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  let added = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows || []) {
    if (!row.image_url) continue;
    try {
      const result = await wineEngineAddByUrl(cfg, { sakeId: row.id, imageUrl: row.image_url });
      if (result.status === 'ok') {
        added++;
      } else {
        failed++;
        if (errors.length < 8) {
          errors.push(`${row.name}: ${(result.error || []).join('; ').slice(0, 120)}`);
        }
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errors.length < 8) errors.push(`${row.name}: ${msg.slice(0, 120)}`);
    }
  }

  const collectionCount = await wineEngineCount(cfg);

  return res.status(200).json({
    success: true,
    batchSize,
    offset,
    processed: (rows || []).length,
    added,
    failed,
    collectionCount,
    nextOffset: offset + batchSize,
    hasMore: (rows || []).length === batchSize,
    errors: errors.length > 0 ? errors : undefined,
  });
}
