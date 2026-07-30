import { describe, expect, test } from 'bun:test';
import {
  normalizeScanImageMime,
  sniffScanImageMime,
} from './scanImageUpload.ts';

describe('normalizeScanImageMime', () => {
  test('allows common image types', () => {
    expect(normalizeScanImageMime('image/jpeg')).toBe('image/jpeg');
    expect(normalizeScanImageMime('image/png; charset=binary')).toBe('image/png');
    expect(normalizeScanImageMime(undefined)).toBe('image/jpeg');
  });

  test('rejects non-images', () => {
    expect(normalizeScanImageMime('text/html')).toBeNull();
    expect(normalizeScanImageMime('application/javascript')).toBeNull();
    expect(normalizeScanImageMime('application/pdf')).toBeNull();
  });
});

describe('sniffScanImageMime', () => {
  test('detects jpeg/png/gif/webp', () => {
    expect(sniffScanImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffScanImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ).toBe('image/png');
    expect(sniffScanImageMime(Buffer.from('GIF89a'))).toBe('image/gif');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    expect(sniffScanImageMime(webp)).toBe('image/webp');
  });

  test('rejects html payload', () => {
    expect(sniffScanImageMime(Buffer.from('<!DOCTYPE html><script>'))).toBeNull();
  });
});
