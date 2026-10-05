import { describe, expect, test } from 'bun:test';
import { HASH_IMAGE_MAX_BYTES, readResponseBodyLimited } from './imageHash.ts';

function mockResponse(params: {
  body?: BodyInit | null;
  contentLength?: string | null;
  withReader?: boolean;
}): Response {
  const headers = new Headers();
  if (params.contentLength != null) {
    headers.set('content-length', params.contentLength);
  }
  if (params.withReader === false) {
    // Force the no-reader fallback path by providing a Response whose body
    // is already consumed / unavailable — use arrayBuffer via Response.
    return new Response(params.body ?? null, { status: 200, headers });
  }
  return new Response(params.body ?? null, { status: 200, headers });
}

describe('readResponseBodyLimited', () => {
  test('rejects oversized Content-Length before reading the body', async () => {
    const huge = String(HASH_IMAGE_MAX_BYTES + 1);
    // Body would be huge if read — Content-Length gate must throw first.
    const res = mockResponse({
      body: 'x',
      contentLength: huge,
    });
    await expect(readResponseBodyLimited(res, HASH_IMAGE_MAX_BYTES)).rejects.toThrow(
      /too large/
    );
  });

  test('accepts a small body under the cap', async () => {
    const bytes = Buffer.alloc(200, 7);
    const res = mockResponse({ body: bytes, contentLength: String(bytes.length) });
    const out = await readResponseBodyLimited(res, HASH_IMAGE_MAX_BYTES);
    expect(out.length).toBe(200);
    expect(out[0]).toBe(7);
  });

  test('streams and aborts when body exceeds max without Content-Length', async () => {
    const max = 1024;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(800).fill(1));
        controller.enqueue(new Uint8Array(800).fill(2));
        controller.close();
      },
    });
    const res = new Response(stream, { status: 200 });
    await expect(readResponseBodyLimited(res, max)).rejects.toThrow(/too large/);
  });
});
