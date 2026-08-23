import { describe, expect, test } from 'bun:test';
import type { VercelRequest } from '@vercel/node';
import { forwardedProcessImageHeaders } from './invokeProcessImages.ts';

describe('invokeProcessImages', () => {
  test('forwards Vercel cron auth context to process-images', async () => {
    const parentReq = {
      headers: {
        authorization: 'Bearer cron-secret',
        'x-vercel-cron': '1',
        'x-vercel-cron-schedule': '*/10 * * * *',
        'user-agent': 'vercel-cron/1.0',
      },
    } as unknown as VercelRequest;

    const headers = forwardedProcessImageHeaders(parentReq);

    expect(headers.authorization).toBe('Bearer cron-secret');
    expect(headers['x-vercel-cron']).toBe('1');
    expect(headers['x-vercel-cron-schedule']).toBe('*/10 * * * *');
    expect(headers['user-agent']).toBe('vercel-cron/1.0');
  });
});
