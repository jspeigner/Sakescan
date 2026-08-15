/** Only http(s) — blocks javascript:/data: stored XSS on BreweryDetail + admin links. */
export function normalizeBreweryWebsite(
  raw: string | null | undefined
): string | null | { error: string } {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: 'Invalid website URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Website must be an http(s) URL' };
  }
  if (!parsed.hostname) {
    return { error: 'Invalid website URL' };
  }
  return parsed.toString();
}
