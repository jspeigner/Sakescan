import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export const MIN_IMAGE_BYTES = 3000;
/** Product shots rarely need more; large files risk OOM in serverless. */
const parsedMaxImageBytes = Number.parseInt(process.env.IMAGE_MAX_BYTES || '25000000', 10);
export const MAX_IMAGE_BYTES = Number.isFinite(parsedMaxImageBytes) ? parsedMaxImageBytes : 25_000_000;

export function isSupabaseUrl(url: string, supabaseUrl: string): boolean {
  return url.includes(supabaseUrl.replace('https://', '')) || url.includes('supabase.co/storage');
}

export function supabaseProjectHost(supabaseUrl: string): string | null {
  try {
    const normalized = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`;
    return new URL(normalized).hostname || null;
  } catch {
    const host = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0]?.trim();
    return host || null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DownloadResult {
  url: string;
  skippedPlaceholder?: boolean;
  rateLimited?: boolean;
}

export async function downloadAndStore(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  folder: string,
  name: string,
  seenHashes: Set<string>,
  knownPlaceholderHashes: Set<string>
): Promise<DownloadResult> {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
      Referer: imageUrl.includes('sakenomy') ? 'https://sakenomy.jp/' : 'https://japansake.or.jp/',
    },
    redirect: 'follow',
  });

  if (response.status === 429) {
    return { url: imageUrl, rateLimited: true };
  }

  if (response.status === 403 || response.status === 401) {
    throw new Error(`Blocked: HTTP ${response.status}`);
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('Not an image (received HTML/JSON)');
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    throw new Error(`Too small (${buffer.byteLength} bytes) - likely placeholder`);
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Too large (${buffer.byteLength} bytes > max ${MAX_IMAGE_BYTES})`);
  }

  const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');

  if (knownPlaceholderHashes.has(hash)) {
    return { url: imageUrl, skippedPlaceholder: true };
  }

  if (seenHashes.has(hash)) {
    knownPlaceholderHashes.add(hash);
    return { url: imageUrl, skippedPlaceholder: true };
  }
  seenHashes.add(hash);

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
