import { describe, expect, test } from 'bun:test';
import {
  collectEmbedTodoRows,
  needsEmbedding,
  type EmbedCandidateRow,
} from './embedSakeImagesBatch.ts';

function row(id: string, imageUrl: string): EmbedCandidateRow {
  return {
    id,
    name: id,
    name_japanese: null,
    brewery: null,
    image_url: imageUrl,
  };
}

describe('needsEmbedding', () => {
  test('requires work when missing or stale vs current image_url', () => {
    const map = new Map([['a', 'https://cdn.example/a.jpg']]);
    expect(needsEmbedding({ id: 'a', image_url: 'https://cdn.example/a.jpg' }, map)).toBe(false);
    expect(needsEmbedding({ id: 'a', image_url: 'https://cdn.example/a2.jpg' }, map)).toBe(true);
    expect(needsEmbedding({ id: 'b', image_url: 'https://cdn.example/b.jpg' }, map)).toBe(true);
    expect(needsEmbedding({ id: 'c', image_url: null }, map)).toBe(false);
    expect(needsEmbedding({ id: 'c', image_url: '  ' }, map)).toBe(false);
  });
});

describe('collectEmbedTodoRows', () => {
  test('pages past an already-embedded tip so older rows still get indexed', async () => {
    // Tip (newest) rows 0–79 already embedded; older 80–99 still need work.
    const catalog = Array.from({ length: 100 }, (_, i) =>
      row(`sake-${i}`, `https://cdn.example/${i}.jpg`)
    );
    const embeddedTip = new Map(
      catalog.slice(0, 80).map((r) => [r.id, r.image_url as string])
    );

    const ranges: Array<[number, number]> = [];
    const { todo, scanned } = await collectEmbedTodoRows(
      async (from, to) => {
        ranges.push([from, to]);
        return { data: catalog.slice(from, to + 1), error: null };
      },
      async (ids) => {
        const map = new Map<string, string>();
        for (const id of ids) {
          const prev = embeddedTip.get(id);
          if (prev) map.set(id, prev);
        }
        return map;
      },
      10,
      40
    );

    expect(scanned).toBeGreaterThan(80);
    expect(todo).toHaveLength(10);
    expect(todo.map((r) => r.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `sake-${80 + i}`)
    );
    // Must have walked past the first tip page — old tip-only limit(80) would return [].
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0]).toEqual([0, 39]);
  });

  test('stops when a short final page has no remaining work', async () => {
    const catalog = Array.from({ length: 5 }, (_, i) =>
      row(`sake-${i}`, `https://cdn.example/${i}.jpg`)
    );
    const allEmbedded = new Map(catalog.map((r) => [r.id, r.image_url as string]));

    const { todo, scanned } = await collectEmbedTodoRows(
      async (from, to) => ({ data: catalog.slice(from, to + 1), error: null }),
      async (ids) => {
        const map = new Map<string, string>();
        for (const id of ids) {
          const prev = allEmbedded.get(id);
          if (prev) map.set(id, prev);
        }
        return map;
      },
      20,
      10
    );

    expect(todo).toEqual([]);
    expect(scanned).toBe(5);
  });

  test('includes stale embeddings when image_url changed', async () => {
    const catalog = [row('sake-0', 'https://cdn.example/new.jpg')];
    const { todo } = await collectEmbedTodoRows(
      async () => ({ data: catalog, error: null }),
      async () => new Map([['sake-0', 'https://cdn.example/old.jpg']]),
      5,
      10
    );
    expect(todo.map((r) => r.id)).toEqual(['sake-0']);
  });
});
