import { describe, expect, test } from 'bun:test';
import { isPublicHttpImageUrl } from './publicImageUrl.ts';

describe('isPublicHttpImageUrl', () => {
  test('allows public https hosts', () => {
    expect(isPublicHttpImageUrl('https://cdn.example.com/sake.jpg')).toBe(true);
    expect(isPublicHttpImageUrl('http://images.example.org/a.png')).toBe(true);
  });

  test('blocks localhost and private networks', () => {
    expect(isPublicHttpImageUrl('http://127.0.0.1/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://localhost/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://10.0.0.5/secret')).toBe(false);
    expect(isPublicHttpImageUrl('http://192.168.1.1/img')).toBe(false);
    expect(isPublicHttpImageUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::1]/')).toBe(false);
  });

  test('blocks IPv4-mapped IPv6 private addresses', () => {
    // Regression: hostname "::ffff:127.0.0.1" bypassed the IPv4 private check.
    expect(isPublicHttpImageUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::ffff:10.0.0.1]/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::ffff:192.168.1.1]/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::ffff:7f00:1]/x')).toBe(false); // 127.0.0.1
    expect(isPublicHttpImageUrl('http://[::ffff:a00:1]/x')).toBe(false); // 10.0.0.1
  });

  test('blocks non-http schemes', () => {
    expect(isPublicHttpImageUrl('file:///etc/passwd')).toBe(false);
    expect(isPublicHttpImageUrl('ftp://example.com/a.jpg')).toBe(false);
    expect(isPublicHttpImageUrl(null)).toBe(false);
    expect(isPublicHttpImageUrl('')).toBe(false);
  });
});
