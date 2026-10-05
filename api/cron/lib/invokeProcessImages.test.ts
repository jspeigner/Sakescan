import { describe, expect, mock, test } from 'bun:test';
import type { VercelRequest } from '@vercel/node';

let capturedReq: VercelRequest | null = null;

const processImagesStub = {
  default: async (
    req: VercelRequest,
    res: { status: (code: number) => unknown; json: (data: unknown) => unknown }
  ) => {
    capturedReq = req;
    res.status(200);
    res.json({ success: true });
  },
};

mock.module('../process-images.js', () => processImagesStub);
mock.module('../process-images.ts', () => processImagesStub);

const { invokeProcessImages } = await import(`./invokeProcessImages.ts?delegation-test=${Date.now()}`);

describe('invokeProcessImages', () => {
  test('forwards current Vercel scheduler metadata to process-images', async () => {
    const inv = await invokeProcessImages(
      { mode: 'discover' },
      {
        headers: {
          'user-agent': 'vercel-cron/1.0',
          'x-vercel-cron-schedule': '*/15 * * * *',
        },
      } as unknown as VercelRequest
    );

    expect(inv.ok).toBe(true);
    expect(capturedReq?.headers['user-agent']).toBe('vercel-cron/1.0');
    expect(capturedReq?.headers['x-vercel-cron-schedule']).toBe('*/15 * * * *');
    expect(capturedReq?.query).toEqual({ chunk: '1', mode: 'discover' });
  });
});
