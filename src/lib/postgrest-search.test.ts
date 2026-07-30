import { describe, expect, test } from 'bun:test';
import { sanitizePostgrestSearch } from '../../src/lib/postgrest-search.ts';

describe('sanitizePostgrestSearch', () => {
  test('strips filter metacharacters', () => {
    expect(sanitizePostgrestSearch('foo%,bar(baz)')).toBe('foo bar baz');
    expect(sanitizePostgrestSearch('a_b.c')).toBe('a b c');
  });

  test('trims and caps length', () => {
    expect(sanitizePostgrestSearch('  sake  ')).toBe('sake');
    expect(sanitizePostgrestSearch('x'.repeat(100)).length).toBe(80);
  });
});
