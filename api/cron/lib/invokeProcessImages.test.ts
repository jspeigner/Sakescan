import { describe, expect, test } from 'bun:test';
import type { VercelRequest } from '@vercel/node';
import { processImagesAuthHeaders } from './invokeProcessImages.ts';

describe('invokeProcessImages', () => {
  test('builds delegated handler headers with Vercel cron auth metadata', () => {
    const headers = processImagesAuthHeaders(
      {
        headers: {
          authorization: 'Bearer secret-1',
          'x-vercel-cron-auth-token': 'vercel-managed-token',
          'x-vercel-cron-schedule': '*/15 * * * *',
          'user-agent': 'vercel-cron/1.0',
        },
      } as VercelRequest
    );

    expect(headers.authorization).toBe('Bearer secret-1');
    expect(headers['x-vercel-cron-auth-token']).toBe('vercel-managed-token');
    expect(headers['x-vercel-cron-schedule']).toBe('*/15 * * * *');
    expect(headers['user-agent']).toBe('vercel-cron/1.0');
  });
});
