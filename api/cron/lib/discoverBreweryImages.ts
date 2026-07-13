/**
 * Fill missing brewery.image_url from gallery[0] or og:image on website/source_url.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadAndStore, sleep } from './imageMirror.js';

export type BreweryDiscoverResult = {
  attempted: number;
  fromGallery: number;
  fromWebsite: number;
  errors: string[];
};

function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.startsWith('http')) return m[1].trim();
  }
  return null;
}

async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SakeScanBot/1.0 (+https://www.sakescan.com)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    return extractOgImage(html.slice(0, 200_000));
  } catch {
    return null;
  }
}

export async function discoverBreweryImagesBatch(
  supabase: SupabaseClient,
  options?: { batchSize?: number }
): Promise<BreweryDiscoverResult> {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 12, 3), 25);
  const errors: string[] = [];
  let attempted = 0;
  let fromGallery = 0;
  let fromWebsite = 0;
  const seenHashes = new Set<string>();
  const knownPlaceholderHashes = new Set<string>();

  const { data: rows, error } = await supabase
    .from('breweries')
    .select('id, name, image_url, website, source_url, gallery_images')
    .or('image_url.is.null,image_url.eq.')
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    return { attempted: 0, fromGallery: 0, fromWebsite: 0, errors: [error.message] };
  }

  for (const brewery of rows || []) {
    attempted++;
    try {
      const gallery: string[] = Array.isArray(brewery.gallery_images) ? brewery.gallery_images : [];
      const galleryFirst = gallery.find((u) => typeof u === 'string' && u.startsWith('http'));

      if (galleryFirst) {
        const stored = await downloadAndStore(
          supabase,
          galleryFirst,
          'brewery-images',
          brewery.name,
          seenHashes,
          knownPlaceholderHashes
        );
        if (!stored.rateLimited && !stored.skippedPlaceholder) {
          await supabase
            .from('breweries')
            .update({ image_url: stored.url, updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
          fromGallery++;
          await sleep(120);
          continue;
        }
      }

      const pageUrl = (brewery.website || brewery.source_url || '').trim();
      if (!pageUrl.startsWith('http')) continue;

      const og = await fetchOgImage(pageUrl);
      await sleep(200);
      if (!og) continue;

      const stored = await downloadAndStore(
        supabase,
        og,
        'brewery-images',
        brewery.name,
        seenHashes,
        knownPlaceholderHashes
      );
      if (stored.rateLimited || stored.skippedPlaceholder) continue;

      await supabase
        .from('breweries')
        .update({ image_url: stored.url, updated_at: new Date().toISOString() })
        .eq('id', brewery.id);
      fromWebsite++;
      await sleep(120);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (errors.length < 8) errors.push(`${brewery.name}: ${msg.slice(0, 100)}`);
    }
  }

  return { attempted, fromGallery, fromWebsite, errors };
}
