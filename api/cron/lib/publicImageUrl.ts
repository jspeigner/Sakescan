const PUBLIC_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

export function isPublicHttpImageUrl(imageUrl: string): boolean {
  try {
    const parsed = new URL(imageUrl.trim());
    return PUBLIC_IMAGE_PROTOCOLS.has(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
