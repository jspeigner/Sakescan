import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  downloadAndStore,
  isSupabaseUrl,
  shouldClearExternalImageUrlOnError,
  sleep,
  supabaseProjectHost,
} from './lib/imageMirror.js';
import { requireCronOrAdmin } from '../lib/requireCronOrAdmin.js';

/** Low volume: brewery assets change rarely. */
const BREWERY_MAIN_BUDGET = 8;
const BREWERY_GALLERY_BUDGET = 5;
const DELAY_MS = 500;
/** Page size when scanning gallery JSON for external URLs (PostgREST-friendly). */
const GALLERY_SCAN_PAGE = 200;
const GALLERY_SCAN_MAX_PAGES = 25;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireCronOrAdmin(req, res))) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({
      error: 'Supabase not configured',
      hint: 'Set VITE_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY on Vercel.',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let breweryMainProcessed = 0;
  let breweryGalleryProcessed = 0;
  let failed = 0;
  let skippedPlaceholders = 0;
  let rateLimited = false;
  const errors: string[] = [];
  const seenHashes = new Set<string>();
  const knownPlaceholderHashes = new Set<string>();

  try {
    // Filter external URLs in the query — an unfiltered .limit(500) is nearly all
    // already-mirrored Supabase URLs, so the cron reported remaining work but mirrored 0.
    const projectHost = supabaseProjectHost(supabaseUrl);
    let breweryMainQuery = supabase
      .from('breweries')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .neq('image_url', '');
    if (projectHost) {
      breweryMainQuery = breweryMainQuery.not('image_url', 'ilike', `%${projectHost}%`);
    }
    breweryMainQuery = breweryMainQuery.not('image_url', 'ilike', '%supabase.co%');

    const { data: breweries } = await breweryMainQuery
      .order('updated_at', { ascending: true })
      .limit(Math.max(BREWERY_MAIN_BUDGET * 20, 100));

    const breweriesToProcess = (breweries || []).filter(
      (b) => b.image_url && !isSupabaseUrl(b.image_url, supabaseUrl)
    );

    for (const brewery of breweriesToProcess.slice(0, BREWERY_MAIN_BUDGET)) {
      if (rateLimited) break;
      try {
        const result = await downloadAndStore(
          supabase,
          brewery.image_url!,
          'brewery-images',
          brewery.name,
          seenHashes,
          knownPlaceholderHashes
        );

        if (result.rateLimited) {
          rateLimited = true;
          errors.push('Rate limited by image host - stopping this run');
          break;
        }

        if (result.skippedPlaceholder) {
          await supabase
            .from('breweries')
            .update({ image_url: null, updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
          skippedPlaceholders++;
        } else if (result.skippedDuplicate) {
          // Keep URL but rotate so the oldest-external queue can advance.
          await supabase
            .from('breweries')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
        } else {
          await supabase
            .from('breweries')
            .update({ image_url: result.url, updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
          breweryMainProcessed++;
        }

        await sleep(DELAY_MS);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Brewery "${brewery.name}": ${msg}`);

        if (shouldClearExternalImageUrlOnError(msg)) {
          await supabase
            .from('breweries')
            .update({ image_url: null, updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
        } else {
          // Transient failure — rotate updated_at so one bad host does not pin the queue.
          await supabase
            .from('breweries')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
        }
        await sleep(DELAY_MS);
      }
    }

    if (!rateLimited) {
      let galleryBudget = BREWERY_GALLERY_BUDGET;
      let galleryOffset = 0;

      // Gallery URLs live in JSON arrays — page oldest rows until the budget is filled
      // or we exhaust a bounded scan. An unfiltered first page is almost all mirrored.
      for (let page = 0; page < GALLERY_SCAN_MAX_PAGES && galleryBudget > 0 && !rateLimited; page++) {
        const { data: galleryBreweries } = await supabase
          .from('breweries')
          .select('id, name, gallery_images')
          .not('gallery_images', 'eq', '[]')
          .order('updated_at', { ascending: true })
          .range(galleryOffset, galleryOffset + GALLERY_SCAN_PAGE - 1);

        const pageRows = galleryBreweries || [];
        if (pageRows.length === 0) break;
        galleryOffset += pageRows.length;

        let pageHadExternal = false;

        for (const brewery of pageRows) {
          if (galleryBudget <= 0 || rateLimited) break;

          const gallery: string[] = Array.isArray(brewery.gallery_images) ? brewery.gallery_images : [];
          const hasExternal = gallery.some((url) => url && !isSupabaseUrl(url, supabaseUrl));
          if (!hasExternal) continue;
          pageHadExternal = true;

          let updated = false;
          let deferred = false;
          const newGallery = [...gallery];

          for (let i = 0; i < gallery.length; i++) {
            if (galleryBudget <= 0 || rateLimited) break;
            if (!gallery[i] || isSupabaseUrl(gallery[i], supabaseUrl)) continue;

            try {
              const result = await downloadAndStore(
                supabase,
                gallery[i],
                'brewery-gallery',
                `${brewery.name}-${i}`,
                seenHashes,
                knownPlaceholderHashes
              );

              if (result.rateLimited) {
                rateLimited = true;
                break;
              }

              if (result.skippedPlaceholder) {
                newGallery[i] = '';
                skippedPlaceholders++;
              } else if (result.skippedDuplicate) {
                deferred = true;
              } else {
                newGallery[i] = result.url;
                breweryGalleryProcessed++;
              }

              galleryBudget--;
              updated = true;
              await sleep(DELAY_MS);
            } catch (err) {
              failed++;
              galleryBudget--;
              const msg = err instanceof Error ? err.message : String(err);
              if (shouldClearExternalImageUrlOnError(msg)) {
                newGallery[i] = '';
                updated = true;
              } else {
                deferred = true;
              }
              await sleep(DELAY_MS);
            }
          }

          if (updated) {
            const cleanGallery = newGallery.filter((url) => url);
            await supabase
              .from('breweries')
              .update({ gallery_images: cleanGallery, updated_at: new Date().toISOString() })
              .eq('id', brewery.id);
          } else if (deferred) {
            await supabase
              .from('breweries')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', brewery.id);
          }
        }

        // If this oldest page had no external URLs, keep scanning newer pages.
        if (!pageHadExternal && pageRows.length < GALLERY_SCAN_PAGE) break;
      }
    }

    const projectHostForCount = supabaseProjectHost(supabaseUrl);
    let remainingBreweryMainQuery = supabase
      .from('breweries')
      .select('id', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .neq('image_url', '');
    if (projectHostForCount) {
      remainingBreweryMainQuery = remainingBreweryMainQuery.not(
        'image_url',
        'ilike',
        `%${projectHostForCount}%`
      );
    }
    remainingBreweryMainQuery = remainingBreweryMainQuery.not(
      'image_url',
      'ilike',
      '%supabase.co%'
    );
    const { count: remainingBreweryMainApprox } = await remainingBreweryMainQuery;
    const remainingBreweryMain = remainingBreweryMainApprox ?? 0;

    let remainingGalleryCount = 0;
    let galleryCountOffset = 0;
    for (let page = 0; page < GALLERY_SCAN_MAX_PAGES; page++) {
      const { data: gCheck } = await supabase
        .from('breweries')
        .select('gallery_images')
        .not('gallery_images', 'eq', '[]')
        .range(galleryCountOffset, galleryCountOffset + GALLERY_SCAN_PAGE - 1);
      const rows = gCheck || [];
      if (rows.length === 0) break;
      galleryCountOffset += rows.length;
      for (const b of rows) {
        const gallery: string[] = Array.isArray(b.gallery_images) ? b.gallery_images : [];
        remainingGalleryCount += gallery.filter(
          (url) => url && !isSupabaseUrl(url, supabaseUrl)
        ).length;
      }
      if (rows.length < GALLERY_SCAN_PAGE) break;
    }

    let remainingSakeQuery = supabase
      .from('sake')
      .select('image_url', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .neq('image_url', '');
    if (projectHostForCount) {
      remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', `%${projectHostForCount}%`);
    }
    remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', '%supabase.co%');
    const { count: remainingSakeApprox } = await remainingSakeQuery;
    const remainingSake = remainingSakeApprox ?? 0;

    const { count: nullC } = await supabase
      .from('sake')
      .select('id', { count: 'exact', head: true })
      .is('image_url', null);
    const { count: emptyC } = await supabase
      .from('sake')
      .select('id', { count: 'exact', head: true })
      .eq('image_url', '');
    const sakeMissingImage = (nullC ?? 0) + (emptyC ?? 0);

    console.log(
      `[process-brewery-images] OK main=${breweryMainProcessed} gallery=${breweryGalleryProcessed} failed=${failed}`
    );

    return res.status(200).json({
      success: true,
      job: 'brewery',
      processed: breweryMainProcessed + breweryGalleryProcessed,
      sakeProcessed: 0,
      breweryMainProcessed,
      galleryProcessed: breweryGalleryProcessed,
      failed,
      skippedPlaceholders,
      rateLimited,
      remaining: {
        breweryMainImages: Math.max(0, remainingBreweryMain),
        breweryGalleryImages: Math.max(0, remainingGalleryCount),
        sakeImages: Math.max(0, remainingSake),
        sakeMissingImage,
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron process-brewery-images error:', error);
    return res.status(500).json({ error: 'Processing failed', details: String(error) });
  }
}
