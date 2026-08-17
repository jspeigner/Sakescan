import { createHash } from 'crypto';
import { fetchPublicHttpUrl, NonPublicUrlError } from './publicImageUrl.js';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/*,*/*;q=0.8',
};

export type ImageBytesResult = {
  sha256: string;
  bytes: Buffer;
  contentType: string;
};

/** Download image bytes and return SHA-256 of the raw body. Blocks private/localhost SSRF targets. */
export async function hashImageUrl(imageUrl: string): Promise<ImageBytesResult> {
  let res: Response;
  try {
    res = await fetchPublicHttpUrl(imageUrl, {
      headers: FETCH_HEADERS,
    });
  } catch (e) {
    if (e instanceof NonPublicUrlError) throw e;
    throw new Error(`hashImageUrl fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    throw new Error(`hashImageUrl HTTP ${res.status}`);
  }
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new Error(`hashImageUrl too small (${buf.length} bytes)`);
  }
  if (buf.length > 12_000_000) {
    throw new Error(`hashImageUrl too large (${buf.length} bytes)`);
  }
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { sha256, bytes: buf, contentType };
}

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
