import { describe, expect, test } from 'bun:test';
import {
  isDuplicateSha256EmbedError,
  shouldSkipEmbedForExistingSha256,
} from './sakeImageEmbed.ts';

describe('shouldSkipEmbedForExistingSha256', () => {
  test('skips when another sake already owns the hash', () => {
    expect(shouldSkipEmbedForExistingSha256('sake-a', 'sake-b')).toBe(true);
  });

  test('does not skip when hash is free or owned by the same sake', () => {
    expect(shouldSkipEmbedForExistingSha256(null, 'sake-b')).toBe(false);
    expect(shouldSkipEmbedForExistingSha256(undefined, 'sake-b')).toBe(false);
    expect(shouldSkipEmbedForExistingSha256('sake-b', 'sake-b')).toBe(false);
  });
});

describe('isDuplicateSha256EmbedError', () => {
  test('detects Postgres unique_violation and sha256 index name', () => {
    expect(isDuplicateSha256EmbedError({ code: '23505' })).toBe(true);
    expect(
      isDuplicateSha256EmbedError({
        message: 'duplicate key value violates unique constraint "sake_image_embeddings_sha256_uidx"',
      })
    ).toBe(true);
    expect(isDuplicateSha256EmbedError({ message: 'permission denied' })).toBe(false);
  });
});
