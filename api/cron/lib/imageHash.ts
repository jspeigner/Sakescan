import { createHash } from 'crypto';
import { fetchPublicHttpUrl, NonPublicUrlError } from './publicImageUrl.js';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/*,*/*;q=0.8',
};

/** Hard cap for identify / WineEngine cache downloads (bytes). */
export const HASH_IMAGE_MAX_BYTES = 12_000_000;
export const HASH_IMAGE_MIN_BYTES = 100;

export type ImageBytesResult = {
  sha256: string;
  bytes: Buffer;
  contentType: string;
};

/**
 * Read a fetch Response body with a hard byte cap.
 * Rejects oversized Content-Length before buffering, and streams when possible
 * so missing/lying Content-Length cannot OOM the isolate.
 */
export async function readResponseBodyLimited(
  res: Response,
  maxBytes: number
): Promise<Buffer> {
  const contentLength = Number.parseInt(res.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`hashImageUrl too large (${contentLength} bytes)`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`hashImageUrl too large (${buf.length} bytes)`);
    }
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore cancel errors */
      }
      throw new Error(`hashImageUrl too large (>${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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
  const buf = await readResponseBodyLimited(res, HASH_IMAGE_MAX_BYTES);
  if (buf.length < HASH_IMAGE_MIN_BYTES) {
    throw new Error(`hashImageUrl too small (${buf.length} bytes)`);
  }
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { sha256, bytes: buf, contentType };
}

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
