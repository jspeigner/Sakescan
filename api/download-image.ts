import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './lib/requireAdmin.js';
import { fetchPublicHttpUrl, isPublicHttpImageUrl } from './cron/lib/publicImageUrl.js';
import { extFromMime, sniffScanImageMime } from './lib/scanImageUpload.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req, res);
  if (!auth.ok) return;

  const { imageUrl, sakeName } = req.body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Image URL is required' });
  }
  if (!isPublicHttpImageUrl(imageUrl)) {
    return res.status(400).json({ error: 'Image URL must be a public http(s) URL' });
  }

  // Create Supabase client with service role key for storage access
  const supabase = createClient(auth.supabaseUrl, auth.supabaseServiceKey);

  try {
    // Download the image (blocks private hosts + unsafe redirects)
    const imageResponse = await fetchPublicHttpUrl(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SakeScan/1.0)',
        'Accept': 'image/*',
      },
    });

    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const claimedType = (imageResponse.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase() || '';
    // Reject HTML/JSON/SVG even when a remote host lies about content-type (ImageSearchModal uses this path).
    if (
      claimedType.includes('text/html') ||
      claimedType.includes('application/json') ||
      claimedType === 'image/svg+xml' ||
      (claimedType && !claimedType.startsWith('image/'))
    ) {
      return res.status(400).json({ error: 'URL did not return a raster image' });
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const sniffed = sniffScanImageMime(imageBuffer);
    if (!sniffed || sniffed === 'image/heic') {
      // Admin catalog art must be browser-displayable raster bytes (not HTML/PDF/HEIC).
      return res.status(400).json({ error: 'Downloaded bytes are not a JPEG/PNG/WebP/GIF image' });
    }
    const contentType = sniffed;

    // Determine file extension from sniffed type
    const extension = extFromMime(contentType);

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const safeName = (sakeName || 'sake')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 30);
    const fileName = `${safeName}-${timestamp}-${randomStr}.${extension}`;
    const filePath = `sake-images/${fileName}`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('sake-images')
      .upload(filePath, imageBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('sake-images')
      .getPublicUrl(filePath);

    return res.status(200).json({
      success: true,
      url: urlData.publicUrl,
      originalUrl: imageUrl,
    });
  } catch (error) {
    console.error('Download/upload error:', error);
    return res.status(500).json({
      error: 'Failed to download and save image',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
