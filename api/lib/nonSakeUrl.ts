/**
 * Destructive URL-mode clears must stay brand/spirit-specific.
 * Category tokens like \bwine\b / \bbeer\b match legitimate sake product
 * filenames ("pure-rice-wine", "wine-cell") and retailer paths
 * ("/wine-and-sake/") — never null catalog URLs from those alone.
 */
const NON_SAKE_URL_REGEXES = [
  /johnnie|walker|jwalker|jw\s*black|jw\s*red/i,
  /chivas|ballantine|macallan|glenfiddich|glenlivet|lagavulin|laphroaig|talisker/i,
  /\bwhisk(e)?y\b|\bscotch\b|\bbourbon\b|\brye\s+whisk/i,
  /\bvodka\b|\bgin\b|\brum\b|\btequila\b|\bmezcal\b|\bcognac\b|\bbrandy\b/i,
  /\bcabernet\b|\bmerlot\b|\bchardonnay\b|\bpinot\s*noir\b|\bsauvignon\b/i,
  /heineken|corona|budweiser|guinness|stella\s*artois/i,
  /jack[\s-]*daniels|jim[\s-]*beam|hennessy|martell|remy[\s-]*martin/i,
];

/** URL-only gate before clearing sake.image_url in admin clear-bad-images. */
export function looksLikeNonSakeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return NON_SAKE_URL_REGEXES.some((re) => re.test(lower));
}
