import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './lib/requireAdmin.js';
import { fetchPublicHttpUrl, isPublicHttpImageUrl } from './cron/lib/publicImageUrl.js';
import { MAX_IMAGE_BYTES } from './cron/lib/imageMirror.js';

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

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const contentLengthHeader = imageResponse.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({
        error: `Image too large (${contentLength} bytes > max ${MAX_IMAGE_BYTES})`,
      });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({
        error: `Image too large (${imageBuffer.byteLength} bytes > max ${MAX_IMAGE_BYTES})`,
      });
    }

    // Determine file extension from content type
    let extension = 'jpg';
    if (contentType.includes('png')) extension = 'png';
    else if (contentType.includes('webp')) extension = 'webp';
    else if (contentType.includes('gif')) extension = 'gif';

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
