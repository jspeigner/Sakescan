import { describe, expect, test } from 'bun:test';
import {
  clearSakeCatalogImage,
  embeddingMatchesLiveCatalog,
  syncEmbeddingCatalogUrl,
} from './sakeImageClear.ts';

describe('embeddingMatchesLiveCatalog', () => {
  test('rejects cleared or empty catalog URLs', () => {
    expect(embeddingMatchesLiveCatalog('https://cdn.example/a.jpg', null)).toBe(false);
    expect(embeddingMatchesLiveCatalog('https://cdn.example/a.jpg', '')).toBe(false);
    expect(embeddingMatchesLiveCatalog('https://cdn.example/a.jpg', '   ')).toBe(false);
  });

  test('rejects when catalog photo was replaced', () => {
    expect(
      embeddingMatchesLiveCatalog(
        'https://cdn.example/old-whisky.jpg',
        'https://cdn.example/new-sake.jpg'
      )
    ).toBe(false);
  });

  test('accepts exact live catalog URL', () => {
    const url = 'https://cdn.example/sake.jpg';
    expect(embeddingMatchesLiveCatalog(url, url)).toBe(true);
    expect(embeddingMatchesLiveCatalog(` ${url} `, url)).toBe(true);
  });
});

describe('clearSakeCatalogImage', () => {
  test('nulls image_url + wineengine_indexed_at then deletes embedding for sake_id', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown; filter?: unknown }> = [];

    const supabase = {
      from(table: string) {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                calls.push({ table, op: 'update', payload, filter: { column, value } });
                return Promise.resolve({ error: null });
              },
            };
          },
          delete() {
            return {
              eq(column: string, value: string) {
                calls.push({ table, op: 'delete', filter: { column, value } });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };

    await clearSakeCatalogImage(supabase as never, 'sake-1');

    expect(calls).toEqual([
      {
        table: 'sake',
        op: 'update',
        payload: {
          image_url: null,
          wineengine_indexed_at: null,
          updated_at: (calls[0]?.payload as { updated_at: string }).updated_at,
        },
        filter: { column: 'id', value: 'sake-1' },
      },
      {
        table: 'sake_image_embeddings',
        op: 'delete',
        filter: { column: 'sake_id', value: 'sake-1' },
      },
    ]);
    expect(typeof (calls[0]?.payload as { updated_at: string }).updated_at).toBe('string');
  });

  test('surfaces update failures before delete', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'sake') {
          return {
            update() {
              return {
                eq() {
                  return Promise.resolve({ error: { message: 'rlw' } });
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await expect(clearSakeCatalogImage(supabase as never, 'sake-1')).rejects.toThrow(
      /clear sake image: rlw/
    );
  });
});

describe('syncEmbeddingCatalogUrl', () => {
  test('rewrites embedding image_url for the sake after a host-only mirror', async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown; filter?: unknown }> = [];
    const mirrored =
      'https://abc.supabase.co/storage/v1/object/public/sake-images/mirror/x.jpg';

    const supabase = {
      from(table: string) {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                calls.push({ table, op: 'update', payload, filter: { column, value } });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };

    await syncEmbeddingCatalogUrl(supabase as never, 'sake-1', mirrored);

    expect(calls).toEqual([
      {
        table: 'sake_image_embeddings',
        op: 'update',
        payload: {
          image_url: mirrored,
          updated_at: (calls[0]?.payload as { updated_at: string }).updated_at,
        },
        filter: { column: 'sake_id', value: 'sake-1' },
      },
    ]);
  });
});
