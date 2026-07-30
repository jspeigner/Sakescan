import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Admin WineEngine collection sync — disabled (subscription not active).
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(503).json({
    error: 'WineEngine disabled',
    hint: 'TinEye WineEngine subscription is not active this month.',
  });
}
