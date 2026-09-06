import { describe, expect, test } from 'bun:test';
import {
  provenanceForAdmin,
  sakeImageClearPayload,
  sakeImageUpdatePayload,
} from './imageProvenance.ts';

describe('sake image WineEngine invalidation', () => {
  test('update payload clears wineengine_indexed_at', () => {
    const payload = sakeImageUpdatePayload(
      'https://example.supabase.co/storage/v1/object/public/sake-images/a.jpg',
      provenanceForAdmin()
    );
    expect(payload.image_url).toContain('sake-images');
    expect(payload.wineengine_indexed_at).toBeNull();
    expect(payload.image_quality).toBe('t1');
    expect(typeof payload.updated_at).toBe('string');
  });

  test('clear payload nulls image and wineengine_indexed_at', () => {
    const payload = sakeImageClearPayload();
    expect(payload.image_url).toBeNull();
    expect(payload.wineengine_indexed_at).toBeNull();
    expect(typeof payload.updated_at).toBe('string');
  });
});
