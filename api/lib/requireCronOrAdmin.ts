import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from './requireAdmin.js';

/**
 * Allow Vercel Cron (Authorization: Bearer CRON_SECRET) or an admin JWT.
 * Admin UI triggers cron jobs manually; scheduled runs use CRON_SECRET.
 */
export async function requireCronOrAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const admin = await requireAdmin(req, res);
  return admin.ok;
}
