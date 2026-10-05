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
 * Normalize brewery strings for equality matching / slugs.
 * - Drops parenthetical location tags: "Asahi Shuzo (Niigata)" → "Asahi Shuzo"
 * - Maps English "Sake Brewing/Brewery" to Shuzou (Hakutsuru Sake Brewing → Hakutsuru Shuzou)
 * - Drops trailing English "Sake" / "Sake Company" (Gekkeikan Sake → Gekkeikan)
 * - Collapses Shuzo ↔ Shuzou spelling
 */
export function normalizeBreweryNameForMatch(name: string): string {
  let s = stripBreweryCorporateSuffix(name);
  s = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  // English translation of 酒造 — apply before bare "Sake" strip.
  s = s.replace(/\s+sake\s+brew(?:ing|ery)\.?$/i, " Shuzou").trim();
  s = s.replace(/\s+sake\s+company\.?$/i, "").trim();
  s = s.replace(/\s+sake$/i, "").trim();
  s = s.replace(/\bshuzo\b/gi, "Shuzou");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * URL slug for linking from a sake row's brewery field to /brewery/:slug.
 * "Akita Meijyo Co.,Ltd" → "akita-meijyo" (matches breweries.name "Akita Meijyo").
 * "Hakutsuru Sake Brewing Co.,Ltd." → "hakutsuru-shuzou".
 * "Asahi Shuzo" → "asahi-shuzou".
 */
export function brewerySlugFromSakeBreweryField(breweryField: string): string {
  return slugify(normalizeBreweryNameForMatch(breweryField));
}

/**
 * Brand core used for PostgREST candidate fetch (prefix ilike).
 * "Hakutsuru Shuzou" → "Hakutsuru" so "Hakutsuru Sake Brewing…" rows are candidates.
 */
export function breweryBrandCore(breweryName: string): string {
  const normalized = normalizeBreweryNameForMatch(breweryName);
  const withoutShuzou = normalized.replace(/\s+shuzou$/i, "").trim();
  return withoutShuzou || normalized;
}

/**
 * Pattern for matching sake.brewery to a catalog brewery name.
 * Uses brand core + prefix so English "Sake Brewing" rows are fetched for
 * "… Shuzou" catalog pages, then filtered with sakeBreweryMatchesCatalogName.
 */
export function brewerySakeNamePattern(breweryName: string): string {
  // Strip LIKE wildcards from the name; trailing % is the intentional prefix.
  const cleaned = breweryName.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim();
  const core = breweryBrandCore(cleaned).replace(/[%_]/g, " ").replace(/\s+/g, " ").trim();
  return `${core || cleaned}%`;
}

/**
 * True when a sake.brewery string belongs to the catalog brewery name.
 * Prefix `ilike` alone is too loose for short names ("Ito" → "Ito Shuzo",
 * "Itou"); require equality after normalizing corporate suffixes, English
 * descriptors, and Shuzo/Shuzou spelling. Does not collapse bare "Kaetsu" with
 * "Kaetsu Shuzou" — those are distinct catalog rows.
 */
export function sakeBreweryMatchesCatalogName(
  sakeBreweryField: string,
  catalogBreweryName: string
): boolean {
  const catalog = normalizeBreweryNameForMatch(catalogBreweryName).toLowerCase();
  if (!catalog) return false;
  const sakeNorm = normalizeBreweryNameForMatch(sakeBreweryField).toLowerCase();
  if (!sakeNorm) return false;
  if (sakeNorm === catalog) return true;
  // Raw equality after corporate-suffix strip only (legacy path).
  const stripped = stripBreweryCorporateSuffix(sakeBreweryField).toLowerCase();
  return stripped === catalogBreweryName.trim().toLowerCase();
}

export type BrewerySakeListItem = Pick<
  Sake,
  "id" | "name" | "type" | "average_rating" | "image_url" | "polishing_ratio" | "updated_at" | "brewery"
>;

export async function fetchSakesForBreweryName(
  breweryName: string,
  limit = 100
): Promise<BrewerySakeListItem[]> {
  // Over-fetch: prefix ilike is only a candidate filter; normalized equality
  // runs client-side so short names (Ito, Kaetsu) do not pull sibling breweries.
  const fetchLimit = Math.min(Math.max(limit * 5, 100), 1000);
  const { data, error } = await supabase
    .from("sake")
    .select("id, name, type, average_rating, image_url, polishing_ratio, updated_at, brewery")
    .ilike("brewery", brewerySakeNamePattern(breweryName))
    .order("average_rating", { ascending: false, nullsFirst: false })
    .limit(fetchLimit);
  if (error) throw error;
  const matched = ((data ?? []) as BrewerySakeListItem[]).filter((row) =>
    sakeBreweryMatchesCatalogName(row.brewery ?? "", breweryName)
  );
  return matched.slice(0, limit);
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
