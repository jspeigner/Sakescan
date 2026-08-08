import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

type UserPayload = {
  display_name: string | null;
  email: string | null;
  location: string | null;
  avatar_url: string | null;
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

  const body = req.body as { id?: string; payload?: UserPayload; action?: 'update' | 'delete' };
  if (!body?.id || typeof body.id !== 'string') {
    return res.status(400).json({ error: 'id is required' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  if (body.action === 'delete') {
    // Never allow an admin session to delete itself via this endpoint.
    if (body.id === userData.user.id) {
      return res.status(400).json({ error: 'Cannot delete the currently signed-in admin' });
    }

    await admin.from('ratings').delete().eq('user_id', body.id);
    await admin.from('scans').delete().eq('user_id', body.id);

    const { error: profileError } = await admin.from('users').delete().eq('id', body.id);
    if (profileError) {
      console.error('[admin-update-user] profile delete failed:', profileError);
      return res.status(500).json({ error: profileError.message });
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(body.id);
    if (authDeleteError) {
      // Profile row is already gone; surface auth cleanup failure clearly.
      console.error('[admin-update-user] auth delete failed:', authDeleteError);
      return res.status(500).json({
        error: `Profile deleted but auth user cleanup failed: ${authDeleteError.message}`,
      });
    }

    return res.status(200).json({ success: true, id: body.id, deleted: true });
  }

  if (!body.payload) {
    return res.status(400).json({ error: 'id and payload are required' });
  }

  // Keep Auth login identity in sync when admin edits profile email.
  const nextEmail = body.payload.email?.trim();
  if (nextEmail) {
    const { data: existingProfile, error: existingError } = await admin
      .from('users')
      .select('email')
      .eq('id', body.id)
      .maybeSingle();
    if (existingError) {
      console.error('[admin-update-user] profile lookup failed:', existingError);
      return res.status(500).json({ error: existingError.message });
    }
    if (!existingProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const prevEmail = (existingProfile.email ?? '').trim().toLowerCase();
    if (prevEmail !== nextEmail.toLowerCase()) {
      const { error: authEmailError } = await admin.auth.admin.updateUserById(body.id, {
        email: nextEmail,
      });
      if (authEmailError) {
        console.error('[admin-update-user] auth email update failed:', authEmailError);
        return res.status(500).json({
          error: `Auth email update failed: ${authEmailError.message}`,
        });
      }
    }
  }

  const { data, error } = await admin
    .from('users')
    .update(body.payload)
    .eq('id', body.id)
    .select('id')
    .single();

  if (error) {
    console.error('[admin-update-user]', error);
    return res.status(500).json({ error: error.message });
  }
  if (!data?.id) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ success: true, id: data.id });
}
