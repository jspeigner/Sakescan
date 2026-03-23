import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

/** Stay under Vercel ~4.5MB request body limit (base64 is ~4/3 of raw). */
const MAX_DECODED_BYTES = 2_500_000;

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  return 'jpg';
}

function extFromFileName(name: string | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\.([a-zA-Z0-9]{1,8})$/);
  if (!m) return null;
  const e = m[1].toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(e)) {
    return e === 'jpeg' ? 'jpg' : e === 'heif' ? 'heic' : e;
  }
  return null;
}

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
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL or SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({
      error: 'Supabase not configured',
      hint:
        'Server uploads need all three values on your host (Vercel ENV tab, etc.). The service role key is only for API routes — copy it from Supabase → Project Settings → API → service_role (secret).',
      missing,
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.email) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  if (userData.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const body = req.body as {
    imageBase64?: string;
    contentType?: string;
    originalFileName?: string;
  };

  if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.imageBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 image data' });
  }

  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Empty file' });
  }
  if (buffer.length > MAX_DECODED_BYTES) {
    return res.status(413).json({
      error: `Image too large (max ~${Math.round(MAX_DECODED_BYTES / 1024 / 1024)}MB). Try a smaller file.`,
    });
  }

  const contentType = body.contentType?.trim() || 'image/jpeg';
  const ext =
    extFromFileName(body.originalFileName) ?? extFromMime(contentType);

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const filePath = `sake-images/admin-${timestamp}-${randomStr}.${ext}`;

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  const { error: uploadError } = await admin.storage.from('sake-images').upload(filePath, buffer, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    console.error('[upload-sake-image]', uploadError);
    return res.status(500).json({ error: uploadError.message });
  }

  const { data: urlData } = admin.storage.from('sake-images').getPublicUrl(filePath);

  return res.status(200).json({
    success: true,
    url: urlData.publicUrl,
  });
}
