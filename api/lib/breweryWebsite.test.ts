import { describe, expect, test } from 'bun:test';
import { normalizeBreweryWebsite } from './breweryWebsite.js';

describe('normalizeBreweryWebsite', () => {
  test('allows https', () => {
    expect(normalizeBreweryWebsite('https://example.com/path')).toBe('https://example.com/path');
  });

  test('allows http', () => {
    expect(normalizeBreweryWebsite('http://example.com')).toBe('http://example.com/');
  });

  test('adds https when scheme missing', () => {
    expect(normalizeBreweryWebsite('asahishuzo.or.jp')).toBe('https://asahishuzo.or.jp/');
  });

  test('rejects javascript: XSS', () => {
    const result = normalizeBreweryWebsite('javascript:alert(1)');
    expect(result).toEqual({ error: 'Website must be an http(s) URL' });
  });

  test('rejects data:', () => {
    const result = normalizeBreweryWebsite('data:text/html,<script>alert(1)</script>');
    expect(result).toEqual({ error: 'Website must be an http(s) URL' });
  });

  test('null/blank -> null', () => {
    expect(normalizeBreweryWebsite(null)).toBeNull();
    expect(normalizeBreweryWebsite('   ')).toBeNull();
  });
});
