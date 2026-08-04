import { describe, expect, test } from 'bun:test';
import {
  assertResolvesToPublicAddress,
  isPublicHttpImageUrl,
  NonPublicUrlError,
} from './publicImageUrl.ts';

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
    expect(isPublicHttpImageUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::ffff:10.0.0.1]/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::ffff:192.168.1.1]/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://[::ffff:7f00:1]/x')).toBe(false); // 127.0.0.1
    expect(isPublicHttpImageUrl('http://[::ffff:a00:1]/x')).toBe(false); // 10.0.0.1
    expect(isPublicHttpImageUrl('http://[::]/x')).toBe(false);
  });

  test('blocks hostnames that embed private IPv4 labels (nip.io-style)', () => {
    expect(isPublicHttpImageUrl('http://spoofed.127.0.0.1.nip.io/x')).toBe(false);
    expect(isPublicHttpImageUrl('http://foo.169.254.169.254.nip.io/latest/meta-data')).toBe(
      false
    );
    expect(isPublicHttpImageUrl('http://10.0.0.1.sslip.io/x')).toBe(false);
  });

  test('blocks non-http schemes', () => {
    expect(isPublicHttpImageUrl('file:///etc/passwd')).toBe(false);
    expect(isPublicHttpImageUrl('ftp://example.com/a.jpg')).toBe(false);
    expect(isPublicHttpImageUrl(null)).toBe(false);
    expect(isPublicHttpImageUrl('')).toBe(false);
  });
});

describe('assertResolvesToPublicAddress', () => {
  test('rejects DNS names that resolve to loopback', async () => {
    // localtest.me publicly resolves to 127.0.0.1 / ::1
    await expect(assertResolvesToPublicAddress('http://localtest.me/x')).rejects.toBeInstanceOf(
      NonPublicUrlError
    );
  });

  test('allows a known public hostname', async () => {
    await expect(
      assertResolvesToPublicAddress('https://example.com/sake.jpg')
    ).resolves.toBeUndefined();
  });
});
