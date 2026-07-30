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
