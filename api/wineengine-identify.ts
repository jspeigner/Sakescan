import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Identify sake from a label/product image URL using WineEngine.
 * Disabled — TinEye subscription not active.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(503).json({
    error: 'WineEngine disabled',
    hint: 'TinEye WineEngine subscription is not active this month.',
  });
}
