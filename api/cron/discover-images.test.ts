import { describe, expect, mock, test } from 'bun:test';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const inserts: Array<Record<string, unknown>> = [];
let discoverCalls = 0;

mock.module('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { value: { yields: [0], lowYieldStreak: 1 } }, error: null }),
        }),
      }),
    }),
  }),
}));

mock.module('./lib/invokeProcessImages.ts', () => ({
  invokeProcessImages: async (_query: Record<string, string>) => {
    discoverCalls += 1;
    return {
      ok: true,
      json: {
        sakeDiscovered: 1,
        discoverHealth: {
          placed: 1,
          attempts: 2,
          yield: 0.5,
          firecrawlErrors: 0,
        },
        diagnostics: {
          discover: {
            poolRows: 2000,
            poolPagesScanned: 2,
            eligibleRows: 2,
            skippedByBackoff: 1998,
            attemptedRows: 2,
          },
        },
        stopReason: 'chunk_complete_continue',
      },
    };
  },
}));

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { default: handler } = await import('./discover-images.ts');

function mockRes() {
  let statusCode = 200;
  let body: Record<string, unknown> | null = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      body = data;
      return res;
    },
  };
  return {
    res: res as unknown as VercelResponse,
    result: () => ({ statusCode, body }),
  };
}

function cronReq(): VercelRequest {
  return {
    method: 'GET',
    headers: { 'x-vercel-cron': '1' },
    query: {},
  } as unknown as VercelRequest;
}

describe('discover-images cron job', () => {
  test('runs a discover import and is safe to run again immediately', async () => {
    const first = mockRes();
    await handler(cronReq(), first.res);
    const firstResult = first.result();

    const second = mockRes();
    await handler(cronReq(), second.res);
    const secondResult = second.result();

    expect(firstResult.statusCode).toBe(200);
    expect(firstResult.body?.success).toBe(true);
    expect(firstResult.body?.runStatus).toBe('ok');
    expect(firstResult.body?.job).toBe('images-discover');
    expect(firstResult.body?.sakeDiscovered).toBe(1);
    expect(firstResult.body?.diagnostics).toEqual({
      discover: {
        poolRows: 2000,
        poolPagesScanned: 2,
        eligibleRows: 2,
        skippedByBackoff: 1998,
        attemptedRows: 2,
      },
    });
    expect(firstResult.body?.errors).toBeUndefined();

    expect(secondResult.statusCode).toBe(200);
    expect(secondResult.body?.success).toBe(true);
    expect(secondResult.body?.runStatus).toBe('ok');
    expect(secondResult.body?.sakeDiscovered).toBe(1);
    expect(secondResult.body?.errors).toBeUndefined();

    expect(discoverCalls).toBe(2);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.job).toBe('images-discover');
    expect(
      ((inserts[0]?.stats as { phases?: Array<{ stats?: Record<string, unknown> }> })?.phases?.[0]
        ?.stats as Record<string, unknown>)?.diagnostics
    ).toEqual({
      discover: {
        poolRows: 2000,
        poolPagesScanned: 2,
        eligibleRows: 2,
        skippedByBackoff: 1998,
        attemptedRows: 2,
      },
    });
    expect(inserts[1]?.status).toBe('ok');
  });
});
