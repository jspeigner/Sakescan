import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

function parseStorageObjectPath(publicUrl: string, bucket: string): string | null {
  try {
    const u = new URL(publicUrl);
    const marker = `/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

function isSafeSakeImagePath(path: string): boolean {
  if (!path || path.includes('..')) return false;
  if (!path.startsWith('sake-images/')) return false;
  const rest = path.slice('sake-images/'.length);
  return /^[a-zA-Z0-9._-]+$/.test(rest);
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

  const { publicUrl } = req.body as { publicUrl?: string };
  if (!publicUrl || typeof publicUrl !== 'string') {
    return res.status(400).json({ error: 'publicUrl is required' });
  }

  const host = (() => {
    try {
      return new URL(supabaseUrl).hostname;
    } catch {
      return '';
    }
  })();
  if (!host || !publicUrl.includes(host)) {
    return res.status(400).json({ error: 'URL must be from this Supabase project' });
  }
  if (!publicUrl.includes('/object/public/sake-images/')) {
    return res.status(400).json({ error: 'Not a sake-images public URL' });
  }

  const bucket = 'sake-images';
  const objectPath = parseStorageObjectPath(publicUrl, bucket);
  if (!objectPath || !isSafeSakeImagePath(objectPath)) {
    return res.status(400).json({ error: 'Invalid storage path' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { error: removeError } = await admin.storage.from(bucket).remove([objectPath]);

  if (removeError) {
    console.error('[delete-sake-storage]', removeError);
    return res.status(500).json({ error: removeError.message });
  }

  return res.status(200).json({ success: true });
}
