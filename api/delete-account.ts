import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Authenticated self-serve account deletion (B09).
 * Prefers the delete_own_account() RPC; falls back to service-role cleanup.
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

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const userId = userData.user.id;

  const { error: rpcError } = await userClient.rpc('delete_own_account');
  if (!rpcError) {
    return res.status(200).json({ success: true, method: 'rpc' });
  }

  // Fallback if RPC is not deployed yet.
  console.warn('[delete-account] RPC failed, using service-role fallback:', rpcError.message);
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  await admin.storage.from('avatars').remove([userId, `${userId}/avatar`]);

  const { error: profileError } = await admin.from('users').delete().eq('id', userId);
  if (profileError) {
    console.error('[delete-account] profile delete failed:', profileError);
    return res.status(500).json({ error: profileError.message });
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    console.error('[delete-account] auth delete failed:', authDeleteError);
    return res.status(500).json({ error: authDeleteError.message });
  }

  return res.status(200).json({ success: true, method: 'service_role' });
}
