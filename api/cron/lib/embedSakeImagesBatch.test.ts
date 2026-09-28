import { describe, expect, test } from 'bun:test';
import { isUnusableEmbedTarget } from './embedSakeImagesBatch.ts';

describe('isUnusableEmbedTarget', () => {
  test('treats private URLs and download failures as skippable', () => {
    expect(isUnusableEmbedTarget('hashImageUrl HTTP 403')).toBe(true);
    expect(isUnusableEmbedTarget('Blocked non-public URL: file:///var/mobile/a.jpg')).toBe(true);
    expect(isUnusableEmbedTarget('OpenAI label extract HTTP 400: bad image')).toBe(true);
    expect(isUnusableEmbedTarget('Error while downloading https://cdn.example/a.jpg')).toBe(true);
  });

  test('keeps quota, server, and database errors as real failures', () => {
    expect(isUnusableEmbedTarget('OpenAI label extract HTTP 500: upstream')).toBe(false);
    expect(isUnusableEmbedTarget('OpenAI embeddings HTTP 429')).toBe(false);
    expect(isUnusableEmbedTarget('sake_image_embeddings upsert: permission denied')).toBe(false);
  });
});
