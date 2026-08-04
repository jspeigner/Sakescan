import { lookup } from 'dns/promises';

const IPV4_PRIVATE_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

/** Dotted-quad private/link-local/loopback IPv4 embedded anywhere in a hostname label sequence. */
const EMBEDDED_PRIVATE_IPV4 =
  /(?:^|\.)((?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?:\.|$)/;

function isPrivateIpv4(host: string): boolean {
  return IPV4_PRIVATE_RANGES.some((re) => re.test(host));
}

/** Extract dotted IPv4 from IPv4-mapped IPv6 forms like ::ffff:127.0.0.1 or ::ffff:7f00:1. */
function ipv4FromMappedIpv6(normalized: string): string | null {
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted?.[1]) return dotted[1];

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex?.[1] || !hex[2]) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

function isPrivateIpv6(host: string): boolean {
  if (!host.includes(':')) return false;

  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }

  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  return mappedIpv4 !== null && isPrivateIpv4(mappedIpv4);
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (isPrivateIpv4(normalized)) return true;
  if (isPrivateIpv6(normalized)) return true;
  return false;
}

/**
 * nip.io / sslip.io-style hosts embed the target IP in the name
 * (e.g. foo.169.254.169.254.nip.io → 169.254.169.254). The bare
 * hostname-equals-IP check misses these.
 */
function hostnameEmbedsPrivateIpv4(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!normalized.includes('.')) return false;
  return EMBEDDED_PRIVATE_IPV4.test(normalized);
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
    if (hostnameEmbedsPrivateIpv4(host)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve hostname and reject when any address is loopback/private/link-local.
 * Covers DNS rebinding helpers (localtest.me → 127.0.0.1) that pass string checks.
 */
export async function assertResolvesToPublicAddress(url: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    throw new NonPublicUrlError(`Blocked non-public URL: ${url}`);
  }

  const host = hostname.replace(/^\[|\]$/g, '');
  if (!host) {
    throw new NonPublicUrlError(`Blocked non-public URL: ${url}`);
  }

  // IP literals — no DNS needed.
  if (isPrivateIpAddress(host)) {
    throw new NonPublicUrlError(`Blocked non-public URL: ${url}`);
  }
  // Literal IPv4/IPv6 that isn't private is fine.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return;
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length) {
      throw new NonPublicUrlError(`Blocked URL with no DNS records: ${url}`);
    }
    for (const record of records) {
      if (isPrivateIpAddress(record.address)) {
        throw new NonPublicUrlError(
          `Blocked URL resolving to private address ${record.address}: ${url}`
        );
      }
    }
  } catch (err) {
    if (err instanceof NonPublicUrlError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new NonPublicUrlError(`Blocked URL with DNS failure (${msg}): ${url}`);
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
  await assertResolvesToPublicAddress(url);

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
      await assertResolvesToPublicAddress(next);
      current = next;
      continue;
    }

    return response;
  }

  throw new NonPublicUrlError(`Too many redirects (>${maxRedirects})`);
}
