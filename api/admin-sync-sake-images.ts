import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

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

  const body = req.body as {
    sakeId?: string;
    label_image_url?: string | null;
    bottle_image_url?: string | null;
  };

  const { sakeId, label_image_url, bottle_image_url } = body;
  if (!sakeId || typeof sakeId !== 'string') {
    return res.status(400).json({ error: 'sakeId is required' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await admin
    .from('sake')
    .update({
      label_image_url: label_image_url ?? null,
      bottle_image_url: bottle_image_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sakeId)
    .select('id, label_image_url, bottle_image_url')
    .single();

  if (error) {
    console.error('[admin-sync-sake-images]', error);
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: 'Sake not found' });
  }

  return res.status(200).json({ success: true, sake: data });
}
