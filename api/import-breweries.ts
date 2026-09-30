import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from './lib/requireAdmin.js';
import { fetchPublicHttpUrl, isPublicHttpImageUrl } from './cron/lib/publicImageUrl.js';
import { MAX_IMAGE_BYTES, MIN_IMAGE_BYTES } from './cron/lib/imageMirror.js';

interface BreweryInput {
  name: string;
  prefecture?: string;
  region?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  founded_year?: number;
  representative?: string;
  brands?: string[];
  description?: string;
  visiting_info?: string;
  tour_available?: boolean;
  image_url?: string;
  gallery_images?: string[];
  source_url?: string;
}

async function downloadAndStoreImage(
  supabase: SupabaseClient,
  imageUrl: string,
  breweryName: string
): Promise<string> {
  if (!isPublicHttpImageUrl(imageUrl)) {
    throw new Error('Image URL must be a public http(s) URL');
  }
  const imageResponse = await fetchPublicHttpUrl(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SakeScan/1.0)',
      'Accept': 'image/*',
    },
  });

  if (!imageResponse.ok) {
    throw new Error(`HTTP ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('Not an image (received HTML/JSON)');
  }

  const contentLength = Number.parseInt(imageResponse.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Too large (${contentLength} bytes > max ${MAX_IMAGE_BYTES})`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();

  if (imageBuffer.byteLength < MIN_IMAGE_BYTES) {
    throw new Error(`Too small (${imageBuffer.byteLength} bytes) - likely placeholder`);
  }
  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Too large (${imageBuffer.byteLength} bytes > max ${MAX_IMAGE_BYTES})`);
  }

  let extension = 'jpg';
  if (contentType.includes('png')) extension = 'png';
  else if (contentType.includes('webp')) extension = 'webp';
  else if (contentType.includes('gif')) extension = 'gif';

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const safeName = (breweryName || 'brewery')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);

  const filePath = `brewery-images/${safeName}-${timestamp}-${randomStr}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('sake-images')
    .upload(filePath, imageBuffer, { contentType, upsert: false });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('sake-images')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req, res);
  if (!auth.ok) return;

  const supabase = createClient(auth.supabaseUrl, auth.supabaseServiceKey);

  const { breweries, skipImages } = req.body as {
    breweries: BreweryInput[];
    skipImages?: boolean;
  };

  if (!breweries || !Array.isArray(breweries)) {
    return res.status(400).json({ error: 'breweries array is required' });
  }

  let insertedCount = 0;
  let skippedCount = 0;
  let imageCount = 0;
  const errors: string[] = [];

  for (const brewery of breweries) {
    try {
      // Check if brewery already exists
      const { data: existing } = await supabase
        .from('breweries')
        .select('id')
        .eq('name', brewery.name)
        .limit(1)
        .single();

      if (existing) {
        skippedCount++;
        continue;
      }

      // Download main image if available — never persist a rejected original URL.
      let storedImageUrl: string | null = null;
      if (brewery.image_url && !skipImages) {
        try {
          storedImageUrl = await downloadAndStoreImage(supabase, brewery.image_url, brewery.name);
          imageCount++;
        } catch (imgError) {
          const msg = imgError instanceof Error ? imgError.message : String(imgError);
          console.error(`Image download failed for ${brewery.name}:`, imgError);
          errors.push(`Inserted ${brewery.name} without image: ${msg.slice(0, 100)}`);
          storedImageUrl = null;
        }
      } else if (brewery.image_url && skipImages) {
        // Explicit skip: keep the provided URL only when admin opted out of hosting.
        storedImageUrl = isPublicHttpImageUrl(brewery.image_url) ? brewery.image_url : null;
      }

      const { error: insertError } = await supabase
        .from('breweries')
        .insert({
          name: brewery.name,
          prefecture: brewery.prefecture || null,
          region: brewery.region || null,
          address: brewery.address || null,
          phone: brewery.phone || null,
          website: brewery.website || null,
          email: brewery.email || null,
          founded_year: brewery.founded_year || null,
          representative: brewery.representative || null,
          brands: brewery.brands || [],
          description: brewery.description || null,
          visiting_info: brewery.visiting_info || null,
          tour_available: brewery.tour_available || false,
          image_url: storedImageUrl,
          gallery_images: brewery.gallery_images || [],
          source_url: brewery.source_url || null,
        });

      if (insertError) {
        // Handle unique constraint violation gracefully
        if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
          skippedCount++;
        } else {
          errors.push(`${brewery.name}: ${insertError.message}`);
        }
      } else {
        insertedCount++;
      }
    } catch (error) {
      errors.push(`${brewery.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return res.status(200).json({
    success: true,
    insertedCount,
    skippedCount,
    imageCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
