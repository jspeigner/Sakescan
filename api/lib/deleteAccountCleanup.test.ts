import { describe, expect, test } from 'bun:test';
import { scanUploadsPrefix } from './deleteAccountCleanup.ts';

describe('scanUploadsPrefix', () => {
  test('builds the public scan-upload folder for a user id', () => {
    expect(scanUploadsPrefix('11111111-2222-3333-4444-555555555555')).toBe(
      'scan-uploads/11111111-2222-3333-4444-555555555555'
    );
  });

  test('rejects empty or path-injection user ids', () => {
    expect(() => scanUploadsPrefix('')).toThrow();
    expect(() => scanUploadsPrefix('  ')).toThrow();
    expect(() => scanUploadsPrefix('../other')).toThrow();
    expect(() => scanUploadsPrefix('a/b')).toThrow();
  });
});
