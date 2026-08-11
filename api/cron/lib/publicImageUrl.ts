const IPV4_PRIVATE_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

function isPrivateIpv4(host: string): boolean {
  return IPV4_PRIVATE_RANGES.some((re) => re.test(host));
}

function isPrivateIpv6(host: string): boolean {
  if (!host.includes(':')) return false;

  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

/** True for http(s) URLs whose hostname is not localhost / private / link-local. */
export function isPublicHttpImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === 'file' || host.endsWith('.local')) return false;
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) return false;

    return true;
  } catch {
    return false;
  }
}

export class NonPublicUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonPublicUrlError';
  }
}

/**
 * fetch() that refuses private/localhost targets and re-validates every redirect hop.
 * Prevents classic SSRF via open redirects to 127.0.0.1 / RFC1918.
 */
export async function fetchPublicHttpUrl(
  url: string,
  init?: RequestInit & { maxRedirects?: number }
): Promise<Response> {
  if (!isPublicHttpImageUrl(url)) {
    throw new NonPublicUrlError(`Blocked non-public URL: ${url}`);
  }

  const maxRedirects = init?.maxRedirects ?? 5;
  const { maxRedirects: _ignored, redirect: _redirect, ...rest } = init ?? {};
  let current = url.trim();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await fetch(current, {
      ...rest,
      redirect: 'manual',
    });

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new NonPublicUrlError(`Redirect without Location (${status})`);
      }
      const next = new URL(location, current).toString();
      if (!isPublicHttpImageUrl(next)) {
        throw new NonPublicUrlError(`Blocked redirect to non-public URL: ${next}`);
      }
      current = next;
      continue;
    }

    return response;
  }

  throw new NonPublicUrlError(`Too many redirects (>${maxRedirects})`);
}
