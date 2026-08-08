import { describe, expect, test } from 'bun:test';
import {
  isSupabaseUrl,
  isTransientDownloadError,
  shouldClearExternalImageUrlOnError,
} from './imageMirror.ts';

describe('isSupabaseUrl', () => {
  const project = 'https://qpsdebikkmcdzddhphlk.supabase.co';

  test('accepts this project host only', () => {
    expect(
      isSupabaseUrl(
        'https://qpsdebikkmcdzddhphlk.supabase.co/storage/v1/object/public/sake-images/x.jpg',
        project
      )
    ).toBe(true);
  });

  test('rejects attacker hosts that embed the project host as a substring', () => {
    expect(
      isSupabaseUrl(
        'https://evil.example/qpsdebikkmcdzddhphlk.supabase.co/storage/v1/object/public/x.jpg',
        project
      )
    ).toBe(false);
    expect(
      isSupabaseUrl('https://qpsdebikkmcdzddhphlk.supabase.co.attacker.test/x.jpg', project)
    ).toBe(false);
  });

  test('rejects other supabase projects', () => {
    expect(
      isSupabaseUrl('https://otherproject.supabase.co/storage/v1/object/public/x.jpg', project)
    ).toBe(false);
  });
});


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
