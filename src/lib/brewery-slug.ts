import { supabase } from "@/lib/supabase";
import type { Brewery, Sake } from "@/lib/supabase-types";
import { slugify } from "@/lib/slugify";

export function breweryNameFromSlug(slug: string): string {
  return slug.replace(/-/g, " ");
}

/** Common corporate suffixes on sake.brewery that are absent from breweries.name. */
const CORPORATE_SUFFIX_RE =
  /\s*(?:co\.?\s*,?\s*ltd\.?|co\.?|ltd\.?|inc\.?|llc|corp\.?|kk|株式会社|有限会社)\.?$/i;

/** Strip trailing Co.,Ltd / 株式会社 etc. so slugify matches catalog brewery pages. */
export function stripBreweryCorporateSuffix(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(CORPORATE_SUFFIX_RE, "").replace(/[.,\s]+$/g, "").trim();
  return stripped || trimmed;
}

/**
 * URL slug for linking from a sake row's brewery field to /brewery/:slug.
 * "Akita Meijyo Co.,Ltd" → "akita-meijyo" (matches breweries.name "Akita Meijyo").
 */
export function brewerySlugFromSakeBreweryField(breweryField: string): string {
  return slugify(stripBreweryCorporateSuffix(breweryField));
}

/**
 * Pattern for matching sake.brewery to a catalog brewery name.
 * Exact equality misses common corporate suffixes
 * ("Akita Meijyo" vs "Akita Meijyo Co.,Ltd"). A case-insensitive
 * prefix match covers those without the old substring match that
 * attached unrelated names (e.g. "Chiyo Shuzou" → "Fukuchiyo…").
 */
export function brewerySakeNamePattern(breweryName: string): string {
  // Strip LIKE wildcards from the name; trailing % is the intentional prefix.
  const cleaned = breweryName.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned}%`;
}

export type BrewerySakeListItem = Pick<
  Sake,
  "id" | "name" | "type" | "average_rating" | "image_url" | "polishing_ratio" | "updated_at"
>;

export async function fetchSakesForBreweryName(
  breweryName: string,
  limit = 20
): Promise<BrewerySakeListItem[]> {
  const { data, error } = await supabase
    .from("sake")
    .select("id, name, type, average_rating, image_url, polishing_ratio, updated_at")
    .ilike("brewery", brewerySakeNamePattern(breweryName))
    .order("average_rating", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BrewerySakeListItem[];
}

/**
 * Pick the brewery whose slugify(name) exactly matches the URL slug.
 * Avoids substring false positives (e.g. "asahi-shuzou" → Tamaasahi Shuzou).
 */
export function pickBreweryBySlug<T extends { name: string }>(
  rows: T[],
  slug: string
): T | null {
  const bySlug = rows.find((row) => slugify(row.name) === slug);
  if (bySlug) return bySlug;

  const nameGuess = breweryNameFromSlug(slug).toLowerCase();
  return rows.find((row) => row.name.toLowerCase() === nameGuess) ?? null;
}

/** Returns null when the slug does not match a brewery. Throws only on query/transport failures. */
export async function fetchBreweryBySlug(slug: string): Promise<Brewery | null> {
  const nameGuess = breweryNameFromSlug(slug);
  // Hyphens in the URL may be spaces OR hyphens in the real name (e.g. Den-en).
  // Expand to a LIKE pattern, then require an exact slugify(name) match.
  const fuzzyPattern = `%${slug.replace(/-/g, "%")}%`;

  const exact = await supabase
    .from("breweries")
    .select("*")
    .ilike("name", nameGuess)
    .limit(10);
  if (exact.error) throw exact.error;

  const exactMatch = pickBreweryBySlug((exact.data ?? []) as Brewery[], slug);
  if (exactMatch) return exactMatch;

  const { data, error } = await supabase
    .from("breweries")
    .select("*")
    .ilike("name", fuzzyPattern)
    .limit(50);
  if (error) throw error;

  return pickBreweryBySlug((data ?? []) as Brewery[], slug);
}
