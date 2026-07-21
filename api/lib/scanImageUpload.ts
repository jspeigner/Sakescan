/**
 * Upload a user scan photo into public Supabase Storage and return an https URL.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_DECODED_BYTES = 2_500_000;

export function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  return 'jpg';
}

export function isHttpScanImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

export function decodeScanImageBase64(imageBase64: string): {
  buffer?: Buffer;
  error?: string;
  status?: number;
} {
  let buffer: Buffer;
  try {
    // Allow data-URL prefix from mobile clients
    const raw = imageBase64.includes(',')
      ? imageBase64.slice(imageBase64.indexOf(',') + 1)
      : imageBase64;
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return { error: 'Invalid base64 image data', status: 400 };
  }
  if (buffer.length === 0) return { error: 'Empty file', status: 400 };
  if (buffer.length > MAX_DECODED_BYTES) {
    return {
      error: `Image too large (max ~${Math.round(MAX_DECODED_BYTES / 1024 / 1024)}MB)`,
      status: 413,
    };
  }
  return { buffer };
}

export async function uploadScanImageToStorage(
  admin: SupabaseClient,
  params: {
    userId: string;
    buffer: Buffer;
    contentType?: string;
    scanId?: string;
  }
): Promise<{ url: string; path: string }> {
  const contentType = params.contentType?.trim() || 'image/jpeg';
  const ext = extFromMime(contentType);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const scanPart = params.scanId ? `${params.scanId}-` : '';
  const filePath = `scan-uploads/${params.userId}/${scanPart}${timestamp}-${randomStr}.${ext}`;

  const { error: uploadError } = await admin.storage.from('sake-images').upload(filePath, params.buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: urlData } = admin.storage.from('sake-images').getPublicUrl(filePath);
  return { url: urlData.publicUrl, path: filePath };
}
