import { describe, expect, test } from 'bun:test';
import {
  catalogImageReplaceFilter,
  placeCatalogImageIfStronger,
  provenanceForTrustedRetailer,
  provenanceForUserScan,
  provenanceForWebDiscover,
  shouldReplaceImage,
} from './imageProvenance.ts';

type Row = { id: string; image_url: string | null; image_quality: string | null };

/** Minimal chainable Supabase mock for placeCatalogImageIfStronger. */
function mockSupabase(rows: Map<string, Row>) {
  let lastUpdate: { id: string; payload: Record<string, unknown>; orFilter: string } | null =
    null;
  let updateMatches: Row[] = [];

  const api = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, id: string) {
              return {
                async maybeSingle() {
                  if (col !== 'id') return { data: null, error: { message: 'bad col' } };
                  return { data: rows.get(id) ?? null, error: null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(col: string, id: string) {
              if (col !== 'id') throw new Error('expected id eq');
              return {
                or(orFilter: string) {
                  lastUpdate = { id, payload, orFilter };
                  const row = rows.get(id);
                  updateMatches = [];
                  if (row && rowMatchesReplaceFilter(row, orFilter)) {
                    updateMatches = [row];
                    row.image_url = String(payload.image_url);
                    row.image_quality = String(payload.image_quality);
                  }
                  return {
                    async select(_cols: string) {
                      return {
                        data: updateMatches.map((r) => ({ id: r.id })),
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    getLastUpdate: () => lastUpdate,
  };
  return api;
}

function rowMatchesReplaceFilter(row: Row, orFilter: string): boolean {
  // Mirrors PostgREST OR semantics used by catalogImageReplaceFilter.
  const parts = orFilter.split(',');
  for (const part of parts) {
    if (part === 'image_url.is.null' && row.image_url == null) return true;
    if (part === 'image_url.eq.' && row.image_url === '') return true;
    if (part === 'image_quality.eq.t2' && row.image_quality === 't2') return true;
    if (part === 'image_quality.eq.t3' && row.image_quality === 't3') return true;
  }
  return false;
}

describe('catalogImageReplaceFilter', () => {
  test('t3 only fills empty URLs', () => {
    expect(catalogImageReplaceFilter('t3')).toBe('image_url.is.null,image_url.eq.');
  });

  test('t2 may upgrade t3 or fill empty', () => {
    expect(catalogImageReplaceFilter('t2')).toBe(
      'image_url.is.null,image_url.eq.,image_quality.eq.t3'
    );
  });

  test('t1 may upgrade t2/t3 or fill empty', () => {
    expect(catalogImageReplaceFilter('t1')).toBe(
      'image_url.is.null,image_url.eq.,image_quality.eq.t2,image_quality.eq.t3'
    );
  });
});

describe('placeCatalogImageIfStronger', () => {
  test('places T3 when catalog image is still missing', async () => {
    const rows = new Map<string, Row>([
      ['sake-1', { id: 'sake-1', image_url: null, image_quality: null }],
    ]);
    const sb = mockSupabase(rows);
    const result = await placeCatalogImageIfStronger(
      sb as never,
      'sake-1',
      'https://cdn.example/t3.jpg',
      provenanceForWebDiscover()
    );
    expect(result).toEqual({ placed: true, skippedWeaker: false });
    expect(rows.get('sake-1')?.image_url).toBe('https://cdn.example/t3.jpg');
    expect(rows.get('sake-1')?.image_quality).toBe('t3');
  });

  test('refuses T3 when promote filled T2 during discover (TOCTOU)', async () => {
    const rows = new Map<string, Row>([
      [
        'sake-1',
        {
          id: 'sake-1',
          image_url: 'https://cdn.example/user-scan.jpg',
          image_quality: 't2',
        },
      ],
    ]);
    const sb = mockSupabase(rows);
    const result = await placeCatalogImageIfStronger(
      sb as never,
      'sake-1',
      'https://cdn.example/web-junk.jpg',
      provenanceForWebDiscover()
    );
    expect(result).toEqual({ placed: false, skippedWeaker: true });
    expect(rows.get('sake-1')?.image_url).toBe('https://cdn.example/user-scan.jpg');
    expect(sb.getLastUpdate()).toBeNull();
  });

  test('allows T1 retailer to upgrade concurrent T2', async () => {
    const rows = new Map<string, Row>([
      [
        'sake-1',
        {
          id: 'sake-1',
          image_url: 'https://cdn.example/user-scan.jpg',
          image_quality: 't2',
        },
      ],
    ]);
    const sb = mockSupabase(rows);
    const result = await placeCatalogImageIfStronger(
      sb as never,
      'sake-1',
      'https://cdn.example/sakura.jpg',
      provenanceForTrustedRetailer()
    );
    expect(result.placed).toBe(true);
    expect(rows.get('sake-1')?.image_quality).toBe('t1');
  });

  test('refuses T2 promote when T1 already present', async () => {
    const rows = new Map<string, Row>([
      [
        'sake-1',
        {
          id: 'sake-1',
          image_url: 'https://cdn.example/retailer.jpg',
          image_quality: 't1',
        },
      ],
    ]);
    const sb = mockSupabase(rows);
    const result = await placeCatalogImageIfStronger(
      sb as never,
      'sake-1',
      'https://cdn.example/scan.jpg',
      provenanceForUserScan('scan-9')
    );
    expect(result).toEqual({ placed: false, skippedWeaker: true });
  });

  test('conditional update loses race when filter no longer matches', async () => {
    // Live read sees empty (shouldReplace true), but filter rejects after a
    // concurrent write — simulate by mutating between read and filter match.
    const rows = new Map<string, Row>([
      ['sake-1', { id: 'sake-1', image_url: null, image_quality: null }],
    ]);
    const base = mockSupabase(rows);
    const sb = {
      from(table: string) {
        const chain = base.from(table);
        return {
          select(cols: string) {
            return chain.select(cols);
          },
          update(payload: Record<string, unknown>) {
            // Concurrent promote lands before the write filter runs.
            rows.set('sake-1', {
              id: 'sake-1',
              image_url: 'https://cdn.example/promoted.jpg',
              image_quality: 't2',
            });
            return chain.update(payload);
          },
        };
      },
    };
    const result = await placeCatalogImageIfStronger(
      sb as never,
      'sake-1',
      'https://cdn.example/late-t3.jpg',
      provenanceForWebDiscover()
    );
    expect(result).toEqual({ placed: false, skippedWeaker: true });
    expect(rows.get('sake-1')?.image_url).toBe('https://cdn.example/promoted.jpg');
  });
});

describe('shouldReplaceImage (baseline)', () => {
  test('empty URL always replaceable', () => {
    expect(shouldReplaceImage(null, null, 't3')).toBe(true);
  });

  test('legacy URL blocks T2/T3', () => {
    expect(shouldReplaceImage(null, 'https://x', 't3')).toBe(false);
    expect(shouldReplaceImage(null, 'https://x', 't2')).toBe(false);
  });
});

describe('sake image WineEngine invalidation', () => {
  test('update payload clears wineengine_indexed_at', () => {
    const payload = sakeImageUpdatePayload(
      'https://example.supabase.co/storage/v1/object/public/sake-images/a.jpg',
      provenanceForAdmin()
    );
    expect(payload.image_url).toContain('sake-images');
    expect(payload.wineengine_indexed_at).toBeNull();
    expect(payload.image_quality).toBe('t1');
    expect(typeof payload.updated_at).toBe('string');
  });

  test('clear payload nulls image and wineengine_indexed_at', () => {
    const payload = sakeImageClearPayload();
    expect(payload.image_url).toBeNull();
    expect(payload.wineengine_indexed_at).toBeNull();
    expect(typeof payload.updated_at).toBe('string');
  });
});
