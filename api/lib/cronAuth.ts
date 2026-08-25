/**
 * Auth helpers for Vercel Cron + manual admin triggers.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when the secret is set.
 * Cron invocations also include Vercel-specific request metadata; accept those
 * signals so scheduled jobs still run when a project has not set CRON_SECRET.
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
  const legacyFlag = firstHeaderValue(headers['x-vercel-cron']);
  if (legacyFlag === '1' || legacyFlag?.toLowerCase() === 'true') return true;

  const cronAuthToken = firstHeaderValue(headers['x-vercel-cron-auth-token']);
  if (cronAuthToken) return true;

  const schedule = firstHeaderValue(headers['x-vercel-cron-schedule']);
  const userAgent = firstHeaderValue(headers['user-agent'])?.toLowerCase();
  return Boolean(schedule && userAgent?.includes('vercel-cron/'));
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
  return cronBearerMatches(headers, cronSecret) || isVercelCronRequest(headers);
}
