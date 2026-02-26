import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  breweryName: string
): Promise<string> {
  const imageResponse = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SakeScan/1.0)',
      'Accept': 'image/*',
    },
  });

  if (!imageResponse.ok) {
    throw new Error(`HTTP ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const imageBuffer = await imageResponse.arrayBuffer();

  if (imageBuffer.byteLength < 500) {
    throw new Error('Image too small, likely an error page');
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

      // Download main image if available
      let storedImageUrl: string | null = null;
      if (brewery.image_url && !skipImages) {
        try {
          storedImageUrl = await downloadAndStoreImage(supabase, brewery.image_url, brewery.name);
          imageCount++;
        } catch (imgError) {
          // Keep original URL as fallback
          storedImageUrl = brewery.image_url;
          console.error(`Image download failed for ${brewery.name}:`, imgError);
        }
      } else if (brewery.image_url) {
        storedImageUrl = brewery.image_url;
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
