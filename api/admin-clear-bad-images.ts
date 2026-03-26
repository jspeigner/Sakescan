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

const NON_SAKE_URL_REGEXES = [
  /johnnie|walker|jwalker|jw\s*black|jw\s*red/i,
  /chivas|ballantine|macallan|glenfiddich|glenlivet|lagavulin|laphroaig|talisker/i,
  /\bwhisk(e)?y\b|\bscotch\b|\bbourbon\b|\brye\s+whisk/i,
  /\bvodka\b|\bgin\b|\brum\b|\btequila\b|\bmezcal\b|\bcognac\b|\bbrandy\b/i,
  /\bwine\b|\bchampagne\b|\bprosecco\b|\bcabernet\b|\bmerlot\b|\bchardonnay\b/i,
  /\bbeer\b|\blager\b|\bstout\b|\bipa\b|\bheineken\b|\bcorona\b|\bbudweiser\b/i,
  /jack\s*daniels|jim\s*beam|hennessy|martell|remy\s*martin/i,
];

function looksLikeNonSakeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NON_SAKE_URL_REGEXES.some((re) => re.test(lower));
}

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
  return url.includes(host) || url.includes('supabase.co');
}

async function imageUrlToDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SakeScan/1.0)',
        Accept: 'image/*',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (ct.includes('text/html')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500 || buf.length > 2_500_000) return null;
    const b64 = buf.toString('base64');
    const mime = ct.split(';')[0].trim() || 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

async function isNonSakeVision(openaiKey: string, imageUrl: string, sakeName: string): Promise<boolean> {
  const dataUrl = await imageUrlToDataUrl(imageUrl);
  if (!dataUrl) return false;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You verify product photos for a Japanese sake database. Reply with JSON only.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Sake name: "${sakeName}". Does this image show Japanese sake (nihonshu)? Return JSON: {"isSake": boolean, "reason": "brief"}. Set isSake=false for whisky, scotch, bourbon, beer, wine, or any non-sake product.`,
            },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) return false;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  try {
    const parsed = JSON.parse(content) as { isSake?: boolean };
    return parsed.isSake === false;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const openaiKey = process.env.OPENAI_API_KEY;

  const mode = (req.query.mode as string) || req.body?.mode || 'url';
  const dryRun = req.body?.dryRun === true;

  // Fetch all sakes with an image_url
  const { data: rows, error: fetchErr } = await supabase
    .from('sake')
    .select('id, name, image_url')
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .limit(2000);

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
        const isNonSake = await isNonSakeVision(openaiKey, row.image_url, row.name);
        if (isNonSake) {
          visionBadRows.push(row.id);
          if (!dryRun) {
            await supabase
              .from('sake')
              .update({ image_url: null, updated_at: new Date().toISOString() })
              .eq('id', row.id);
            visionCleared++;
            console.log(`[clear-bad-images/vision] cleared "${row.name}": ${row.image_url}`);
          }
        }
      } catch (e) {
        skipped.push(`${row.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return res.status(200).json({
    success: true,
    dryRun,
    mode,
    totalScanned: (rows || []).length,
    urlBadFound: urlBadRows.length,
    visionBadFound: visionBadRows.length,
    urlCleared: dryRun ? 0 : urlCleared,
    visionCleared: dryRun ? 0 : visionCleared,
    totalCleared: dryRun ? 0 : urlCleared + visionCleared,
    skipped: skipped.length > 0 ? skipped.slice(0, 10) : undefined,
    note: dryRun
      ? 'Dry run — no changes made. Remove dryRun flag to apply.'
      : `Cleared ${urlCleared + visionCleared} bad image(s). The cron job will discover correct images.`,
  });
}
