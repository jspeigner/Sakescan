import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

type SakePayload = {
  name: string;
  name_japanese: string | null;
  brewery: string;
  type: string | null;
  subtype: string | null;
  region: string | null;
  prefecture: string | null;
  description: string | null;
  rice_variety: string | null;
  polishing_ratio: number | null;
  alcohol_percentage: number | null;
  smv: number | null;
  acidity: number | null;
  image_url: string | null;
  updated_at: string;
};

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
    id?: string;
    payload?: SakePayload;
  };
  const payload = body?.payload;
  if (!payload?.name || !payload?.brewery) {
    return res.status(400).json({ error: 'name and brewery are required' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  if (body?.id) {
    const { data, error } = await admin
      .from('sake')
      .update(payload)
      .eq('id', body.id)
      .select('id')
      .single();

    if (error) {
      console.error('[admin-upsert-sake/update]', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.id) {
      return res.status(404).json({ error: 'Sake not found' });
    }
    return res.status(200).json({ success: true, id: data.id, mode: 'update' });
  }

  const { data, error } = await admin
    .from('sake')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('[admin-upsert-sake/insert]', error);
    return res.status(500).json({ error: error.message });
  }
  if (!data?.id) {
    return res.status(500).json({ error: 'Insert did not return id' });
  }

  return res.status(200).json({ success: true, id: data.id, mode: 'insert' });
}
