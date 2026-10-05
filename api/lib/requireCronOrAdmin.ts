import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAuthorizedCronRequest } from './cronAuth.js';
import { requireAdmin } from './requireAdmin.js';

/**
 * Allow Vercel Cron (Bearer CRON_SECRET, x-vercel-cron, or current scheduler
 * User-Agent + x-vercel-cron-schedule) or an admin JWT.
 * Admin UI triggers cron jobs manually; scheduled runs use Vercel cron headers.
 */
export async function requireCronOrAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  if (isAuthorizedCronRequest(req.headers, process.env.CRON_SECRET)) {
    return true;
  }

  const admin = await requireAdmin(req, res);
  return admin.ok;
}
