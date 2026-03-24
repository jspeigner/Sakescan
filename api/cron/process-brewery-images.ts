import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  downloadAndStore,
  isSupabaseUrl,
  sleep,
  supabaseProjectHost,
} from './lib/imageMirror.js';

/** Low volume: brewery assets change rarely. */
const BREWERY_MAIN_BUDGET = 8;
const BREWERY_GALLERY_BUDGET = 5;
const DELAY_MS = 500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const { data: breweries } = await supabase
      .from('breweries')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .limit(500);

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

        if (msg.includes('Blocked') || msg.includes('Not an image')) {
          await supabase
            .from('breweries')
            .update({ image_url: null, updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
        }
        await sleep(DELAY_MS);
      }
    }

    if (!rateLimited) {
      const { data: galleryBreweries } = await supabase
        .from('breweries')
        .select('id, name, gallery_images')
        .not('gallery_images', 'eq', '[]')
        .limit(200);

      let galleryBudget = BREWERY_GALLERY_BUDGET;

      for (const brewery of galleryBreweries || []) {
        if (galleryBudget <= 0 || rateLimited) break;

        const gallery: string[] = Array.isArray(brewery.gallery_images) ? brewery.gallery_images : [];
        let updated = false;
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
            } else {
              newGallery[i] = result.url;
              breweryGalleryProcessed++;
            }

            galleryBudget--;
            updated = true;
            await sleep(DELAY_MS);
          } catch {
            failed++;
            galleryBudget--;
            await sleep(DELAY_MS);
          }
        }

        if (updated) {
          const cleanGallery = newGallery.filter((url) => url);
          await supabase
            .from('breweries')
            .update({ gallery_images: cleanGallery, updated_at: new Date().toISOString() })
            .eq('id', brewery.id);
        }
      }
    }

    const remainingBreweryMain = Math.max(0, breweriesToProcess.length - breweryMainProcessed);

    let remainingGalleryCount = 0;
    const { data: gCheck } = await supabase
      .from('breweries')
      .select('gallery_images')
      .not('gallery_images', 'eq', '[]')
      .limit(2000);
    (gCheck || []).forEach((b) => {
      const gallery: string[] = Array.isArray(b.gallery_images) ? b.gallery_images : [];
      remainingGalleryCount += gallery.filter((url) => url && !isSupabaseUrl(url, supabaseUrl)).length;
    });

    const projectHostForSake = supabaseProjectHost(supabaseUrl);
    let remainingSakeQuery = supabase
      .from('sake')
      .select('image_url', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .neq('image_url', '');
    if (projectHostForSake) {
      remainingSakeQuery = remainingSakeQuery.not('image_url', 'ilike', `%${projectHostForSake}%`);
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
        breweryMainImages: remainingBreweryMain,
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
