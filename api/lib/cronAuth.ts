/**
 * Auth helpers for Vercel Cron + manual admin triggers.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when the secret is set,
 * legacy jobs sent `x-vercel-cron: 1`, and current scheduler jobs identify as
 * `vercel-cron` with an `x-vercel-cron-schedule` header.
 */

export function firstHeaderValue(
  value: string | string[] | undefined | null
): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first.trim() : undefined;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function isVercelCronRequest(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const flag = firstHeaderValue(headers['x-vercel-cron']);
  if (flag === '1' || flag?.toLowerCase() === 'true') return true;

  const userAgent = firstHeaderValue(headers['user-agent'])?.toLowerCase();
  const schedule = firstHeaderValue(headers['x-vercel-cron-schedule']);
  return Boolean(schedule && userAgent?.includes('vercel-cron'));
}

export function cronBearerMatches(
  headers: Record<string, string | string[] | undefined>,
  cronSecret: string | undefined | null
): boolean {
  const secret = cronSecret?.trim();
  if (!secret) return false;
  const auth = firstHeaderValue(headers.authorization);
  if (!auth) return false;
  return auth === `Bearer ${secret}` || auth === secret;
}

/**
 * Scheduled Vercel cron jobs must run even when CRON_SECRET is missing or the
 * Authorization header arrives as a string[] (Node IncomingHttpHeaders).
 */
export function isAuthorizedCronRequest(
  headers: Record<string, string | string[] | undefined>,
  cronSecret: string | undefined | null = process.env.CRON_SECRET
): boolean {
  if (cronBearerMatches(headers, cronSecret)) return true;
  if (cronSecret?.trim()) return false;
  return isVercelCronRequest(headers);
}
