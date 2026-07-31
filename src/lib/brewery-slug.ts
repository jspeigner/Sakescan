import { supabase } from "@/lib/supabase";
import type { Brewery } from "@/lib/supabase-types";
import { slugify } from "@/lib/slugify";

export function breweryNameFromSlug(slug: string): string {
  return slug.replace(/-/g, " ");
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
