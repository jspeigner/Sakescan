import { describe, expect, test } from 'bun:test';
import {
  isEligibleCatalogShareCandidate,
  isPromotableScanImageUrl,
  resolvePromoteRequireOptIn,
  resolvePromoteScanIds,
} from './promoteScanImages.ts';

describe('resolvePromoteRequireOptIn', () => {
  test('defaults to requiring opt-in', () => {
    expect(resolvePromoteRequireOptIn()).toBe(true);
    expect(resolvePromoteRequireOptIn(undefined)).toBe(true);
  });

  test('allows explicit legacy backfill override', () => {
    expect(resolvePromoteRequireOptIn(false)).toBe(false);
    expect(resolvePromoteRequireOptIn(true)).toBe(true);
  });
});

describe('resolvePromoteScanIds', () => {
  test('empty when omitted', () => {
    expect(resolvePromoteScanIds()).toEqual([]);
    expect(resolvePromoteScanIds([])).toEqual([]);
  });

  test('keeps unique non-empty ids for targeted promoteNow', () => {
    expect(resolvePromoteScanIds(['a', '', 'b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('isEligibleCatalogShareCandidate', () => {
  test('rejects declined and unset scans when opt-in is required', () => {
    expect(isEligibleCatalogShareCandidate(false, true)).toBe(false);
    expect(isEligibleCatalogShareCandidate(null, true)).toBe(false);
    expect(isEligibleCatalogShareCandidate(undefined, true)).toBe(false);
  });

  test('accepts only explicit opt-in when required', () => {
    expect(isEligibleCatalogShareCandidate(true, true)).toBe(true);
  });

  test('accepts any candidate when opt-in is not required', () => {
    expect(isEligibleCatalogShareCandidate(false, false)).toBe(true);
    expect(isEligibleCatalogShareCandidate(null, false)).toBe(true);
  });
});

describe('isPromotableScanImageUrl', () => {
  test('accepts http(s) and rejects file:// / empty', () => {
    expect(isPromotableScanImageUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(isPromotableScanImageUrl('http://cdn.example/a.jpg')).toBe(true);
    expect(isPromotableScanImageUrl('file:///var/mobile/a.jpg')).toBe(false);
    expect(isPromotableScanImageUrl(null)).toBe(false);
    expect(isPromotableScanImageUrl('')).toBe(false);
  });
});
