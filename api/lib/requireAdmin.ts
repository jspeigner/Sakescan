import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type User } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

export type AdminAuthResult =
  | { ok: true; user: User; supabaseUrl: string; supabaseAnonKey: string; supabaseServiceKey: string }
  | { ok: false };

/**
 * Require a Supabase JWT for ADMIN_EMAIL. Writes 401/403/500 and returns { ok: false } on failure.
 */
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<AdminAuthResult> {
  const authHeader = req.headers.authorization;
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) {
    res.status(401).json({ error: 'Missing authorization' });
    return { ok: false };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    res.status(500).json({ error: 'Supabase not configured' });
    return { ok: false };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.email) {
    res.status(401).json({ error: 'Invalid session' });
    return { ok: false };
  }
  if (userData.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Forbidden' });
    return { ok: false };
  }

  return {
    ok: true,
    user: userData.user,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
  };
}
