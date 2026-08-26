import { describe, expect, mock, test } from 'bun:test';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let forwardedHeaders: VercelRequest['headers'] | null = null;

mock.module('../process-images.js', () => ({
  default: async (req: VercelRequest, res: VercelResponse) => {
    forwardedHeaders = req.headers;
    return res.status(200).json({ success: true });
  },
}));
mock.module('../process-images.ts', () => ({
  default: async (req: VercelRequest, res: VercelResponse) => {
    forwardedHeaders = req.headers;
    return res.status(200).json({ success: true });
  },
}));

const { invokeProcessImages } = await import('./invokeProcessImages.ts?delegation-test');

describe('invokeProcessImages', () => {
  test('forwards Vercel cron metadata to the in-process image handler', async () => {
    const result = await invokeProcessImages(
      { mode: 'discover' },
      {
        headers: {
          authorization: 'Bearer secret-1',
          'x-vercel-cron': '1',
          'x-vercel-cron-schedule': '0 13 * * *',
          'user-agent': 'vercel-cron/1.0',
        },
      } as unknown as VercelRequest
    );

    expect(result.ok).toBe(true);
    expect(forwardedHeaders?.authorization).toBe('Bearer secret-1');
    expect(forwardedHeaders?.['x-vercel-cron']).toBe('1');
    expect(forwardedHeaders?.['x-vercel-cron-schedule']).toBe('0 13 * * *');
    expect(forwardedHeaders?.['user-agent']).toBe('vercel-cron/1.0');
  });
});
