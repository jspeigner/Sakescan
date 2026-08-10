import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

type ReviewPayload = {
  rating: number;
  review_text: string | null;
  updated_at: string;
};

/**
 * Recompute denormalized sake.average_rating / total_ratings from remaining rating rows.
 * There is no DB trigger for this in repo migrations; mobile upserts only touch `ratings`.
 */
export async function recomputeSakeRatingAggregates(
  admin: SupabaseClient,
  sakeId: string
): Promise<void> {
  const { data: rows, error } = await admin
    .from('ratings')
    .select('rating')
    .eq('sake_id', sakeId);

  if (error) {
    throw new Error(error.message);
  }

  const ratings = (rows ?? [])
    .map((row) => row.rating)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

  const total_ratings = ratings.length;
  const average_rating =
    total_ratings === 0
      ? null
      : Math.round((ratings.reduce((sum, n) => sum + n, 0) / total_ratings) * 10) / 10;

  const { error: updateError } = await admin
    .from('sake')
    .update({ average_rating, total_ratings })
    .eq('id', sakeId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function parseReviewPayload(raw: unknown): ReviewPayload | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: 'payload is required' };
  }
  const body = raw as Record<string, unknown>;
  const rating = body.rating;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { error: 'rating must be a number between 1 and 5' };
  }
  const review_text =
    body.review_text === null || body.review_text === undefined
      ? null
      : typeof body.review_text === 'string'
        ? body.review_text
        : null;
  const updated_at =
    typeof body.updated_at === 'string' && body.updated_at.trim()
      ? body.updated_at
      : new Date().toISOString();

  return { rating, review_text, updated_at };
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

  const body = req.body as {
    id?: string;
    payload?: unknown;
    action?: 'delete' | 'update';
  };
  if (!body?.id || typeof body.id !== 'string') {
    return res.status(400).json({ error: 'id is required' });
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  // Anon can currently delete ratings while RLS migration is pending; admin UI must
  // go through the service-role path so delete keeps working after lockdown.
  if (body.action === 'delete') {
    // Must return sake_id so Explore/Detail aggregates can be recomputed (no DB trigger).
    const { data, error } = await admin
      .from('ratings')
      .delete()
      .eq('id', body.id)
      .select('id, sake_id')
      .maybeSingle();

    if (error) {
      console.error('[admin-update-review/delete]', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.id) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (data.sake_id) {
      try {
        await recomputeSakeRatingAggregates(admin, data.sake_id);
      } catch (aggErr) {
        console.error('[admin-update-review/delete] aggregate', aggErr);
        return res.status(500).json({
          error: 'Review deleted but failed to refresh sake rating totals',
          details: aggErr instanceof Error ? aggErr.message : String(aggErr),
        });
      }
    }

    return res.status(200).json({ success: true, id: data.id, mode: 'delete' });
  }

  const parsed = parseReviewPayload(body.payload);
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const { data, error } = await admin
    .from('ratings')
    .update(parsed)
    .eq('id', body.id)
    .select('id, sake_id')
    .single();

  if (error) {
    console.error('[admin-update-review]', error);
    return res.status(500).json({ error: error.message });
  }
  if (!data?.id) {
    return res.status(404).json({ error: 'Review not found' });
  }

  if (data.sake_id) {
    try {
      await recomputeSakeRatingAggregates(admin, data.sake_id);
    } catch (aggErr) {
      console.error('[admin-update-review/update] aggregate', aggErr);
      return res.status(500).json({
        error: 'Review updated but failed to refresh sake rating totals',
        details: aggErr instanceof Error ? aggErr.message : String(aggErr),
      });
    }
  }

  return res.status(200).json({ success: true, id: data.id });
}
