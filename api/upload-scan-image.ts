import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  decodeScanImageBase64,
  uploadScanImageToStorage,
} from './lib/scanImageUpload.js';

/**
 * Upload a scan photo to Supabase Storage and optionally attach it to a scan row.
 *
 * POST /api/upload-scan-image
 * Authorization: Bearer <supabase_access_token>
 * {
 *   imageBase64: string;       // raw base64 or data URL
 *   contentType?: string;      // default image/jpeg
 *   scanId?: string;           // if set, updates scans.scanned_image_url for that row
 * }
 *
 * Always returns a public https Storage URL. Never store file:// paths.
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

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const body = req.body as {
    imageBase64?: string;
    contentType?: string;
    scanId?: string;
  };

  if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const decoded = decodeScanImageBase64(body.imageBase64);
  if (!decoded.buffer) {
    return res.status(decoded.status ?? 400).json({ error: decoded.error });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  if (body.scanId) {
    const { data: scan, error: scanErr } = await admin
      .from('scans')
      .select('id, user_id')
      .eq('id', body.scanId)
      .single();
    if (scanErr || !scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    if (scan.user_id !== userData.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    const uploaded = await uploadScanImageToStorage(admin, {
      userId: userData.user.id,
      buffer: decoded.buffer,
      contentType: body.contentType,
      scanId: body.scanId,
    });

    if (body.scanId) {
      const { error: upErr } = await admin
        .from('scans')
        .update({ scanned_image_url: uploaded.url })
        .eq('id', body.scanId)
        .eq('user_id', userData.user.id);
      if (upErr) {
        return res.status(500).json({ error: upErr.message, url: uploaded.url });
      }
    }

    return res.status(200).json({
      success: true,
      url: uploaded.url,
      path: uploaded.path,
      scanId: body.scanId ?? null,
      updatedScan: Boolean(body.scanId),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upload-scan-image]', msg);
    return res.status(500).json({ error: msg });
  }
}
