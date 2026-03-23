import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const BREWERY_MAIN_BUDGET = 8;
const BREWERY_GALLERY_BUDGET = 5;
const SAKE_BUDGET = 12;
const DELAY_MS = 500;

// Known placeholder image hashes (populated as we encounter them)
const KNOWN_PLACEHOLDER_HASHES = new Set<string>();

// Minimum size to be a real product photo (not a tiny icon/placeholder)
const MIN_IMAGE_BYTES = 3000;
// Maximum reasonable size to avoid downloading huge files
const MAX_IMAGE_BYTES = 15_000_000;

function isSupabaseUrl(url: string, supabaseUrl: string): boolean {
  return url.includes(supabaseUrl.replace('https://', '')) || url.includes('supabase.co/storage');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface DownloadResult {
  url: string;
  skippedPlaceholder?: boolean;
  rateLimited?: boolean;
}

async function downloadAndStore(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  folder: string,
  name: string,
  seenHashes: Set<string>
): Promise<DownloadResult> {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
      'Referer': imageUrl.includes('sakenomy') ? 'https://sakenomy.jp/' : 'https://japansake.or.jp/',
    },
    redirect: 'follow',
  });

  // Rate limit detection
  if (response.status === 429) {
    return { url: imageUrl, rateLimited: true };
  }

  if (response.status === 403 || response.status === 401) {
    throw new Error(`Blocked: HTTP ${response.status}`);
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';

  // Reject non-image responses (HTML error pages, redirects to login, etc.)
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('Not an image (received HTML/JSON)');
  }

  const buffer = await response.arrayBuffer();

  // Reject images that are too small (likely placeholders or icons)
  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    throw new Error(`Too small (${buffer.byteLength} bytes) - likely placeholder`);
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Too large (${buffer.byteLength} bytes)`);
  }

  // Hash the image content to detect duplicates/placeholders
  const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');

  // If we've seen this exact image before in this run, it's probably a placeholder
  if (KNOWN_PLACEHOLDER_HASHES.has(hash)) {
    return { url: imageUrl, skippedPlaceholder: true };
  }

  // Check if this hash appeared multiple times (track across run)
  if (seenHashes.has(hash)) {
    // Second time seeing this image = placeholder
    KNOWN_PLACEHOLDER_HASHES.add(hash);
    return { url: imageUrl, skippedPlaceholder: true };
  }
  seenHashes.add(hash);

  // Determine extension
  let ext = 'jpg';
  if (contentType.includes('png')) ext = 'png';
  else if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('gif')) ext = 'gif';
  else if (contentType.includes('avif')) ext = 'avif';

  const safeName = (name || 'img')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);

  const rand = Math.random().toString(36).substring(2, 8);
  const filePath = `${folder}/${safeName}-${Date.now()}-${rand}.${ext}`;

  const { error } = await supabase.storage
    .from('sake-images')
    .upload(filePath, buffer, { contentType: contentType || 'image/jpeg', upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('sake-images').getPublicUrl(filePath);
  return { url: data.publicUrl };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let breweryMainProcessed = 0;
  let breweryGalleryProcessed = 0;
  let sakeProcessed = 0;
  let failed = 0;
  let skippedPlaceholders = 0;
  let rateLimited = false;
  const errors: string[] = [];
  const seenHashes = new Set<string>();

  try {
    // --- BREWERY MAIN IMAGES ---
    const { data: breweries } = await supabase
      .from('breweries')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .limit(500);

    const breweriesToProcess = (breweries || []).filter(
      b => b.image_url && !isSupabaseUrl(b.image_url, supabaseUrl)
    );

    for (const brewery of breweriesToProcess.slice(0, BREWERY_MAIN_BUDGET)) {
      if (rateLimited) break;
      try {
        const result = await downloadAndStore(supabase, brewery.image_url!, 'brewery-images', brewery.name, seenHashes);

        if (result.rateLimited) {
          rateLimited = true;
          errors.push('Rate limited by image host - stopping this run');
          break;
        }

        if (result.skippedPlaceholder) {
          // Clear the URL so we don't keep trying this placeholder
          await supabase.from('breweries').update({ image_url: null, updated_at: new Date().toISOString() }).eq('id', brewery.id);
          skippedPlaceholders++;
        } else {
          await supabase.from('breweries').update({ image_url: result.url, updated_at: new Date().toISOString() }).eq('id', brewery.id);
          breweryMainProcessed++;
        }

        await sleep(DELAY_MS);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Brewery "${brewery.name}": ${msg}`);

        // If blocked, clear the URL to avoid retrying forever
        if (msg.includes('Blocked') || msg.includes('Not an image')) {
          await supabase.from('breweries').update({ image_url: null, updated_at: new Date().toISOString() }).eq('id', brewery.id);
        }
      }
    }

    // --- BREWERY GALLERY IMAGES ---
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
            const result = await downloadAndStore(supabase, gallery[i], 'brewery-gallery', `${brewery.name}-${i}`, seenHashes);

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
          }
        }

        if (updated) {
          // Remove empty strings from gallery
          const cleanGallery = newGallery.filter(url => url);
          await supabase.from('breweries').update({ gallery_images: cleanGallery, updated_at: new Date().toISOString() }).eq('id', brewery.id);
        }
      }
    }

    // --- SAKE IMAGES ---
    if (!rateLimited) {
      const { data: sakes } = await supabase
        .from('sake')
        .select('id, name, image_url')
        .not('image_url', 'is', null)
        .limit(500);

      const sakesToProcess = (sakes || []).filter(
        (s) => s.image_url && !isSupabaseUrl(s.image_url, supabaseUrl)
      );

      let sakeBudget = SAKE_BUDGET;

      for (const sake of sakesToProcess.slice(0, sakeBudget)) {
        if (rateLimited) break;

        if (sake.image_url && !isSupabaseUrl(sake.image_url, supabaseUrl)) {
          try {
            const result = await downloadAndStore(supabase, sake.image_url, 'sake-images', sake.name, seenHashes);
            if (result.rateLimited) {
              rateLimited = true;
              break;
            }
            if (result.skippedPlaceholder) {
              await supabase
                .from('sake')
                .update({ image_url: null, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              skippedPlaceholders++;
            } else {
              await supabase
                .from('sake')
                .update({ image_url: result.url, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
              sakeProcessed++;
            }
            await sleep(DELAY_MS);
          } catch (err) {
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Blocked') || msg.includes('Not an image') || msg.includes('Too small')) {
              await supabase
                .from('sake')
                .update({ image_url: null, updated_at: new Date().toISOString() })
                .eq('id', sake.id);
            }
          }
        }
      }
    }

    // --- STATUS ---
    const remainingBreweryMain = breweriesToProcess.length - breweryMainProcessed - skippedPlaceholders;

    let remainingGalleryCount = 0;
    const { data: gCheck } = await supabase.from('breweries').select('gallery_images').not('gallery_images', 'eq', '[]').limit(2000);
    (gCheck || []).forEach(b => {
      const gallery: string[] = Array.isArray(b.gallery_images) ? b.gallery_images : [];
      remainingGalleryCount += gallery.filter(url => url && !isSupabaseUrl(url, supabaseUrl)).length;
    });

    const { data: sCheck } = await supabase
      .from('sake')
      .select('image_url')
      .not('image_url', 'is', null)
      .limit(5000);
    let remainingSake = 0;
    (sCheck || []).forEach((s) => {
      if (s.image_url && !isSupabaseUrl(s.image_url, supabaseUrl)) remainingSake++;
    });

    const totalProcessed = breweryMainProcessed + sakeProcessed + breweryGalleryProcessed;
    console.log(`[process-images] OK processed=${totalProcessed} sake=${sakeProcessed} breweryMain=${breweryMainProcessed} gallery=${breweryGalleryProcessed} failed=${failed} remaining=${remainingBreweryMain + remainingGalleryCount + remainingSake}`);

    return res.status(200).json({
      success: true,
      processed: breweryMainProcessed + sakeProcessed,
      galleryProcessed: breweryGalleryProcessed,
      sakeProcessed,
      breweryMainProcessed,
      failed,
      skippedPlaceholders,
      rateLimited,
      remaining: {
        breweryMainImages: Math.max(0, remainingBreweryMain),
        breweryGalleryImages: Math.max(0, remainingGalleryCount),
        sakeImages: Math.max(0, remainingSake),
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron process-images error:', error);
    return res.status(500).json({ error: 'Processing failed', details: String(error) });
  }
}
