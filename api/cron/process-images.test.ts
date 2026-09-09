import { describe, expect, mock, test } from 'bun:test';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Chainable Supabase stand-in: every builder method returns the chain, and
 * awaiting it yields an empty successful result. Enough to drive process-images
 * through a run where discover/audit are disabled (no Firecrawl/OpenAI keys).
 */
function supabaseChain(): unknown {
  const empty = { data: [], error: null, count: 0 };
  const chain: unknown = new Proxy(function noop() {}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(empty).then(resolve, reject);
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return async () => ({ data: null, error: null });
      }
      return () => chain;
    },
    apply() {
      return chain;
    },
  });
  return chain;
}

mock.module('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => supabaseChain(),
    storage: { from: () => supabaseChain() },
  }),
}));

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
// The crash only reproduces when WineEngine credentials are present.
process.env.WINEENGINE_USERNAME = 'wineengine-user';
process.env.WINEENGINE_PASSWORD = 'wineengine-pass';
delete process.env.WINEENGINE_ENABLED;
delete process.env.FIRECRAWL_API_KEY;
delete process.env.OPENAI_API_KEY;

const { default: handler } = await import(`./process-images.ts?wineengine-payload=${Date.now()}`);

function mockRes() {
  let statusCode = 200;
  let body: Record<string, unknown> | null = null;
  const res = {
    headersSent: false,
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      body = data;
      res.headersSent = true;
      return res;
    },
  };
  return {
    res: res as unknown as VercelResponse,
    result: () => ({ statusCode, body }),
  };
}

function discoverCronReq(): VercelRequest {
  return {
    method: 'GET',
    headers: { 'x-vercel-cron': '1' },
    query: { chunk: '1', mode: 'discover', search: 'trusted-first', speed: 'accelerated' },
  } as unknown as VercelRequest;
}

describe('process-images success payload with WineEngine configured', () => {
  test('returns 200 with a stopReason instead of a ReferenceError 500', async () => {
    const response = mockRes();

    await handler(discoverCronReq(), response.res);
    const { statusCode, body } = response.result();

    expect(statusCode).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.error).toBeUndefined();
    expect(typeof body?.stopReason).toBe('string');
    const wineEngine = body?.wineEngine as Record<string, unknown>;
    expect(wineEngine.disabled).toBeUndefined();
    expect(wineEngine.activeInDiscover).toBe(false);
    expect(wineEngine).not.toHaveProperty('collectionCount');
  });
});
