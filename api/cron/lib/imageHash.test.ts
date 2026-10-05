import { describe, expect, test } from 'bun:test';
import { HASH_IMAGE_MAX_BYTES, hashImageUrl, readResponseBodyLimited } from './imageHash.ts';
import { NonPublicUrlError, isPublicHttpImageUrl } from './publicImageUrl.ts';

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

describe('hashImageUrl SSRF guards', () => {
  test('rejects localhost and private targets before fetch', async () => {
    const blocked = [
      'http://127.0.0.1/latest/meta-data',
      'http://localhost/secret',
      'http://10.0.0.5/img.jpg',
      'http://192.168.1.1/a.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
    ];
    for (const url of blocked) {
      expect(isPublicHttpImageUrl(url)).toBe(false);
      await expect(hashImageUrl(url)).rejects.toBeInstanceOf(NonPublicUrlError);
    }
  });

  test('rejects file and non-http schemes', async () => {
    await expect(hashImageUrl('file:///etc/passwd')).rejects.toBeInstanceOf(NonPublicUrlError);
  });
});

describe('extractLabelTextFromImage SSRF guards', () => {
  test('returns empty extract for private URLs without calling OpenAI', async () => {
    const result = await extractLabelTextFromImage('sk-test-should-not-be-used', 'http://127.0.0.1/x');
    expect(result).toEqual({
      labelText: '',
      brandGuess: null,
      breweryGuess: null,
      rawLines: [],
    });
  });
});
