import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { normalizeBreweryWebsite } from './lib/breweryWebsite.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

type BreweryPayload = {
  name: string;
  prefecture: string | null;
  region: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  founded_year: number | null;
  description: string | null;
  updated_at: string;
};

function parseBreweryPayload(raw: unknown): BreweryPayload | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: 'payload is required' };
  }
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return { error: 'payload.name is required' };
  }

  const websiteResult = normalizeBreweryWebsite(
    body.website === null || body.website === undefined
      ? null
      : typeof body.website === 'string'
        ? body.website
        : String(body.website)
  );
  if (websiteResult && typeof websiteResult === 'object' && 'error' in websiteResult) {
    return websiteResult;
  }

  const foundedRaw = body.founded_year;
  let founded_year: number | null = null;
  if (foundedRaw !== null && foundedRaw !== undefined && foundedRaw !== '') {
    const n = typeof foundedRaw === 'number' ? foundedRaw : Number.parseInt(String(foundedRaw), 10);
    if (!Number.isFinite(n) || n < 500 || n > 3000) {
      return { error: 'founded_year must be a plausible year' };
    }
    founded_year = n;
  }

  const strOrNull = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t : null;
  };

  return {
    name,
    prefecture: strOrNull(body.prefecture),
    region: strOrNull(body.region),
    address: strOrNull(body.address),
    phone: strOrNull(body.phone),
    website: websiteResult as string | null,
    email: strOrNull(body.email),
    founded_year,
    description: strOrNull(body.description),
    updated_at:
      typeof body.updated_at === 'string' && body.updated_at.trim()
        ? body.updated_at
        : new Date().toISOString(),
  };
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

  const body = req.body as { id?: string; payload?: unknown };
  if (!body?.id || typeof body.id !== 'string') {
    return res.status(400).json({ error: 'id and payload.name are required' });
  }

  const parsed = parseBreweryPayload(body.payload);
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await admin
    .from('breweries')
    .update(parsed)
    .eq('id', body.id)
    .select('id')
    .single();

  if (error) {
    console.error('[admin-update-brewery]', error);
    return res.status(500).json({ error: error.message });
  }
  if (!data?.id) {
    return res.status(404).json({ error: 'Brewery not found' });
  }

  return res.status(200).json({ success: true, id: data.id });
}
