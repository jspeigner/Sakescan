import { describe, expect, test } from 'bun:test';
import { hashImageUrl } from './imageHash.ts';
import { NonPublicUrlError } from './publicImageUrl.ts';
import { extractLabelTextFromImage } from './sakeImageEmbed.ts';
import { isPublicHttpImageUrl } from './publicImageUrl.ts';

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
