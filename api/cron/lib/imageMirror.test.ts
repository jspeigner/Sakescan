import { describe, expect, test } from 'bun:test';
import {
  isTransientDownloadError,
  shouldClearExternalImageUrlOnError,
} from './imageMirror.ts';

describe('shouldClearExternalImageUrlOnError', () => {
  test('clears permanent content/access failures', () => {
    expect(shouldClearExternalImageUrlOnError('Blocked: HTTP 403')).toBe(true);
    expect(shouldClearExternalImageUrlOnError('Not an image (received HTML/JSON)')).toBe(true);
    expect(shouldClearExternalImageUrlOnError('Too small (1200 bytes) - likely placeholder')).toBe(
      true
    );
  });

  test('does not clear transient network/DNS/timeouts', () => {
    // Regression: process-images previously nulled image_url on these, wiping
    // valid catalog URLs during short CDN outages.
    expect(shouldClearExternalImageUrlOnError('fetch failed')).toBe(false);
    expect(shouldClearExternalImageUrlOnError('TypeError: network error')).toBe(false);
    expect(shouldClearExternalImageUrlOnError('Error: ECONNRESET')).toBe(false);
    expect(shouldClearExternalImageUrlOnError('Error: ETIMEDOUT')).toBe(false);
    expect(shouldClearExternalImageUrlOnError('AbortError: timeout')).toBe(false);
    expect(shouldClearExternalImageUrlOnError('HTTP 503')).toBe(false);
    expect(shouldClearExternalImageUrlOnError('HTTP 429')).toBe(false);
  });
});

describe('isTransientDownloadError', () => {
  test('recognizes retryable failures', () => {
    expect(isTransientDownloadError('fetch failed')).toBe(true);
    expect(isTransientDownloadError('HTTP 502')).toBe(true);
    expect(isTransientDownloadError('Blocked: HTTP 403')).toBe(false);
  });
});
