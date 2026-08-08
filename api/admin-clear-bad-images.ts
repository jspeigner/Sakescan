/**
 * Admin endpoint: scan the sake table for image_urls that are clearly non-sake products
 * (whisky, beer, wine, etc.) and clear them so the cron job can discover correct images.
 *
 * Two modes:
 *   ?mode=url  — fast, URL-pattern only (no vision API calls)
 *   ?mode=vision — also checks Supabase-hosted images via OpenAI vision (slower, costs tokens)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { looksLikeNonSakeUrl } from './lib/nonSakeUrl.js';
import {
  shouldClearHostedImageFromAudit,
  validateJapaneseSakeProductPhoto,
} from './cron/lib/sakeImageVision.js';

function supabaseProjectHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSupabaseUrl(url: string, supabaseUrl: string): boolean {
  const host = supabaseProjectHost(supabaseUrl);
  if (!host) return false;
  try {
    // Hostname equality only — substring includes() lets attacker hosts embed the project host.
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const openaiKey = process.env.OPENAI_API_KEY;

  const mode = (req.query.mode as string) || req.body?.mode || 'url';
  const dryRun = req.body?.dryRun === true;
  // Vision mode processes a small batch per call to stay within Vercel's timeout.
  // Callers can pass an offset to page through the full table.
  const offset = parseInt((req.body?.offset as string) || '0', 10) || 0;
  const VISION_BATCH = 30;
  const URL_LIMIT = 2000;

  // Fetch sakes with an image_url
  const { data: rows, error: fetchErr } = await supabase
    .from('sake')
    .select('id, name, image_url')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .range(offset, offset + (mode === 'vision' ? VISION_BATCH - 1 : URL_LIMIT - 1));

  if (fetchErr) {
    return res.status(500).json({ error: fetchErr.message });
  }

  const urlBadRows: string[] = [];
  const visionBadRows: string[] = [];
  let urlCleared = 0;
  let visionCleared = 0;
  const skipped: string[] = [];

  for (const row of rows || []) {
    if (!row.image_url) continue;

    // --- URL check (fast, free) ---
    if (looksLikeNonSakeUrl(row.image_url)) {
      urlBadRows.push(row.id);
      if (!dryRun) {
        await supabase
          .from('sake')
          .update({ image_url: null, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        urlCleared++;
        console.log(`[clear-bad-images/url] cleared "${row.name}": ${row.image_url}`);
      }
      continue;
    }

    // --- Vision check (slower, costs tokens, only for Supabase-hosted images) ---
    if (mode === 'vision' && openaiKey && isSupabaseUrl(row.image_url, supabaseUrl)) {
      try {
        const vision = await validateJapaneseSakeProductPhoto(openaiKey, row.image_url, {
          sakeName: row.name,
        });
        // Only clear on high-confidence not-sake (same gate as process-images audit).
        if (shouldClearHostedImageFromAudit(vision)) {
          visionBadRows.push(row.id);
          if (!dryRun) {
            await supabase
              .from('sake')
              .update({ image_url: null, updated_at: new Date().toISOString() })
              .eq('id', row.id);
            visionCleared++;
            console.log(
              `[clear-bad-images/vision] cleared "${row.name}": ${vision.briefReason || row.image_url}`
            );
          }
        }
      } catch (e) {
        skipped.push(`${row.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const scannedCount = (rows || []).length;
  const nextOffset = offset + scannedCount;
  const hasMore = mode === 'vision' && scannedCount === VISION_BATCH;

  return res.status(200).json({
    success: true,
    dryRun,
    mode,
    offset,
    nextOffset,
    hasMore,
    totalScanned: scannedCount,
    urlBadFound: urlBadRows.length,
    visionBadFound: visionBadRows.length,
    urlCleared: dryRun ? 0 : urlCleared,
    visionCleared: dryRun ? 0 : visionCleared,
    totalCleared: dryRun ? 0 : urlCleared + visionCleared,
    skipped: skipped.length > 0 ? skipped.slice(0, 10) : undefined,
    note: dryRun
      ? 'Dry run — no changes made. Remove dryRun flag to apply.'
      : `Cleared ${urlCleared + visionCleared} bad image(s) in this batch. The cron job will discover correct images.`,
  });
}
