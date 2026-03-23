/** Bust browser/CDN cache when the row changes but URL string stays similar. */
export function withImageCacheBust(url: string, updatedAt?: string | null): string {
  if (!url?.trim()) return url;
  if (!updatedAt) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(updatedAt)}`;
}
