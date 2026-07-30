/**
 * Upload a user scan photo into public Supabase Storage and return an https URL.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_DECODED_BYTES = 2_500_000;

const ALLOWED_SCAN_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export function normalizeScanImageMime(mime: string | undefined | null): string | null {
  if (!mime) return 'image/jpeg';
  const base = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!ALLOWED_SCAN_MIME.has(base)) return null;
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}

export function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  return 'jpg';
}

/** Best-effort magic-byte sniff so clients cannot label HTML/JS as image/jpeg. */
export function sniffScanImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  // HEIC/HEIF (ISO BMFF) — 'ftyp' at offset 4
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (/heic|heix|heif|mif1|msf1/i.test(brand)) return 'image/heic';
  }
  return null;
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
  const claimed = normalizeScanImageMime(params.contentType);
  if (!claimed) {
    throw new Error('Unsupported image type (use JPEG, PNG, WebP, GIF, or HEIC)');
  }

  const sniffed = sniffScanImageMime(params.buffer);
  // Prefer magic bytes; allow HEIC/HEIF claims when sniff cannot confirm (mobile).
  const contentType =
    sniffed ?? (claimed === 'image/heic' || claimed === 'image/heif' ? claimed : null);
  if (!contentType) {
    throw new Error('File bytes are not a recognized image');
  }

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
