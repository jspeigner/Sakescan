import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { promoteScanImagesBatch } from './cron/lib/promoteScanImages.js';

/**
 * Mobile opt-in: mark a matched scan as shareable for catalog fill,
 * optionally promote immediately when the sake is missing an image.
 *
 * POST body:
 * {
 *   scanId: string;
 *   catalogShareOptIn?: boolean; // default true
 *   promoteNow?: boolean;        // default true when opting in
 * }
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

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const body = req.body as {
    scanId?: string;
    catalogShareOptIn?: boolean;
    promoteNow?: boolean;
  };

  if (!body.scanId || typeof body.scanId !== 'string') {
    return res.status(400).json({ error: 'scanId is required' });
  }

  const optIn = body.catalogShareOptIn !== false;
  const promoteNow = body.promoteNow !== false && optIn;
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: scan, error: scanErr } = await admin
    .from('scans')
    .select('id, user_id, sake_id, scanned_image_url, matched, catalog_share_opt_in')
    .eq('id', body.scanId)
    .single();

  if (scanErr || !scan) {
    return res.status(404).json({ error: 'Scan not found' });
  }
  if (scan.user_id !== userData.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!scan.matched || !scan.sake_id || !scan.scanned_image_url) {
    return res.status(400).json({
      error: 'Scan must be matched with sake_id and scanned_image_url',
    });
  }

  const { error: upErr } = await admin
    .from('scans')
    .update({ catalog_share_opt_in: optIn })
    .eq('id', scan.id);

  if (upErr) {
    return res.status(500).json({ error: upErr.message });
  }

  let promote: Awaited<ReturnType<typeof promoteScanImagesBatch>> | null = null;
  if (promoteNow) {
    promote = await promoteScanImagesBatch(admin, {
      batchSize: 5,
      openaiKey: openaiKey || undefined,
      requireOptIn: true,
    });
  }

  const { data: sake } = await admin
    .from('sake')
    .select('id, image_url, image_quality, image_source')
    .eq('id', scan.sake_id)
    .single();

  return res.status(200).json({
    success: true,
    scanId: scan.id,
    sakeId: scan.sake_id,
    catalogShareOptIn: optIn,
    catalogImage: sake
      ? {
          image_url: sake.image_url,
          image_quality: sake.image_quality,
          image_source: sake.image_source,
        }
      : null,
    promote,
  });
}
