import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const TOTAL_BUDGET = 25;
const BREWERY_MAIN_BUDGET = 8;
const BREWERY_GALLERY_BUDGET = 5;
const SAKE_BUDGET = 12;

function isSupabaseUrl(url: string, supabaseUrl: string): boolean {
  return url.includes(supabaseUrl.replace('https://', '')) || url.includes('supabase.co/storage');
}

async function downloadAndStore(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  folder: string,
  name: string
): Promise<string> {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SakeScan/1.0)',
      'Accept': 'image/*',
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength < 500) throw new Error('Too small');

  let ext = 'jpg';
  if (contentType.includes('png')) ext = 'png';
  else if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('gif')) ext = 'gif';

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
    .upload(filePath, buffer, { contentType, upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('sake-images').getPublicUrl(filePath);
  return data.publicUrl;
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
  const errors: string[] = [];

  try {
    // --- BREWERY MAIN IMAGES (parallel track 1) ---
    const { data: breweries } = await supabase
      .from('breweries')
      .select('id, name, image_url')
      .not('image_url', 'is', null)
      .limit(500);

    const breweriesToProcess = (breweries || []).filter(
      b => b.image_url && !isSupabaseUrl(b.image_url, supabaseUrl)
    );

    for (const brewery of breweriesToProcess.slice(0, BREWERY_MAIN_BUDGET)) {
      try {
        const newUrl = await downloadAndStore(supabase, brewery.image_url!, 'brewery-images', brewery.name);
        await supabase.from('breweries').update({ image_url: newUrl, updated_at: new Date().toISOString() }).eq('id', brewery.id);
        breweryMainProcessed++;
      } catch (err) {
        failed++;
        errors.push(`Brewery "${brewery.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --- BREWERY GALLERY IMAGES (parallel track 2) ---
    const { data: galleryBreweries } = await supabase
      .from('breweries')
      .select('id, name, gallery_images')
      .not('gallery_images', 'eq', '[]')
      .limit(200);

    let galleryBudget = BREWERY_GALLERY_BUDGET;

    for (const brewery of galleryBreweries || []) {
      if (galleryBudget <= 0) break;

      const gallery: string[] = Array.isArray(brewery.gallery_images) ? brewery.gallery_images : [];
      let updated = false;
      const newGallery = [...gallery];

      for (let i = 0; i < gallery.length; i++) {
        if (galleryBudget <= 0) break;
        if (!gallery[i] || isSupabaseUrl(gallery[i], supabaseUrl)) continue;

        try {
          const newUrl = await downloadAndStore(supabase, gallery[i], 'brewery-gallery', `${brewery.name}-${i}`);
          newGallery[i] = newUrl;
          breweryGalleryProcessed++;
          galleryBudget--;
          updated = true;
        } catch {
          failed++;
          galleryBudget--;
        }
      }

      if (updated) {
        await supabase.from('breweries').update({ gallery_images: newGallery, updated_at: new Date().toISOString() }).eq('id', brewery.id);
      }
    }

    // --- SAKE IMAGES (parallel track 3) ---
    const { data: sakes } = await supabase
      .from('sake')
      .select('id, name, label_image_url, bottle_image_url')
      .not('label_image_url', 'is', null)
      .limit(500);

    const sakesToProcess = (sakes || []).filter(s =>
      (s.label_image_url && !isSupabaseUrl(s.label_image_url, supabaseUrl)) ||
      (s.bottle_image_url && !isSupabaseUrl(s.bottle_image_url, supabaseUrl))
    );

    let sakeBudget = SAKE_BUDGET;

    for (const sake of sakesToProcess.slice(0, sakeBudget)) {
      if (sake.label_image_url && !isSupabaseUrl(sake.label_image_url, supabaseUrl)) {
        try {
          const newUrl = await downloadAndStore(supabase, sake.label_image_url, 'sake-images', sake.name);
          await supabase.from('sake').update({ label_image_url: newUrl, updated_at: new Date().toISOString() }).eq('id', sake.id);
          sakeProcessed++;
        } catch {
          failed++;
        }
      }
      if (sake.bottle_image_url && !isSupabaseUrl(sake.bottle_image_url, supabaseUrl)) {
        try {
          const newUrl = await downloadAndStore(supabase, sake.bottle_image_url, 'sake-images', `${sake.name}-bottle`);
          await supabase.from('sake').update({ bottle_image_url: newUrl, updated_at: new Date().toISOString() }).eq('id', sake.id);
          sakeProcessed++;
        } catch {
          failed++;
        }
      }
    }

    // --- STATUS: Count remaining ---
    const remainingBreweryMain = breweriesToProcess.length - breweryMainProcessed;

    let remainingGalleryCount = 0;
    (galleryBreweries || []).forEach(b => {
      const gallery: string[] = Array.isArray(b.gallery_images) ? b.gallery_images : [];
      remainingGalleryCount += gallery.filter(url => url && !isSupabaseUrl(url, supabaseUrl)).length;
    });
    remainingGalleryCount -= breweryGalleryProcessed;

    const remainingSake = sakesToProcess.length - Math.ceil(sakeProcessed / 2);

    return res.status(200).json({
      success: true,
      processed: breweryMainProcessed + sakeProcessed,
      galleryProcessed: breweryGalleryProcessed,
      sakeProcessed,
      breweryMainProcessed,
      failed,
      remaining: {
        breweryMainImages: Math.max(0, remainingBreweryMain),
        breweryGalleryImages: Math.max(0, remainingGalleryCount),
        sakeImages: Math.max(0, remainingSake),
      },
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron process-images error:', error);
    return res.status(500).json({ error: 'Processing failed', details: String(error) });
  }
}
