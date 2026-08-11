import { describe, expect, test } from 'bun:test';
import { POSTGREST_PAGE_SIZE, fetchAllSelectPages } from './fetchAllSelectPages.ts';

describe('fetchAllSelectPages', () => {
  test('pages until a short final response (simulates PostgREST max-rows=1000)', async () => {
    const calls: Array<[number, number]> = [];
    // Catalog larger than one capped page — old Sakura loop (pageSize=5000) would stop after page 1.
    const total = POSTGREST_PAGE_SIZE * 2 + 50;
    const all = Array.from({ length: total }, (_, i) => ({ id: String(i) }));

    const rows = await fetchAllSelectPages(async (from, to) => {
      calls.push([from, to]);
      // Server silently returns at most POSTGREST_PAGE_SIZE even if a wider range was requested.
      const slice = all.slice(from, Math.min(to + 1, from + POSTGREST_PAGE_SIZE));
      return { data: slice, error: null };
    });

    expect(rows).toHaveLength(total);
    expect(rows[0]?.id).toBe('0');
    expect(rows[total - 1]?.id).toBe(String(total - 1));
    expect(calls).toEqual([
      [0, POSTGREST_PAGE_SIZE - 1],
      [POSTGREST_PAGE_SIZE, POSTGREST_PAGE_SIZE * 2 - 1],
      [POSTGREST_PAGE_SIZE * 2, POSTGREST_PAGE_SIZE * 3 - 1],
    ]);
  });

  test('stops immediately on empty first page', async () => {
    const rows = await fetchAllSelectPages(async () => ({ data: [], error: null }));
    expect(rows).toEqual([]);
  });

  test('throws on fetch error', async () => {
    await expect(
      fetchAllSelectPages(async () => ({ data: null, error: { message: 'boom' } }))
    ).rejects.toThrow('boom');
  });
});
