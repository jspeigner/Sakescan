import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";
import { getSakeIdFromSlug, loadSakeIdMap } from "@/lib/sake-id-map";
import { sanitizePostgrestSearch } from "@/lib/postgrest-search";

export function parseSakeSlug(slug: string): { idFragment: string; nameSlug: string } {
  const idFragment = slug.split("-").pop() ?? "";
  const nameSlug = slug.slice(0, slug.length - idFragment.length - 1);
  return { idFragment, nameSlug };
}

async function fetchSakeByIdPrefix(idFragment: string): Promise<Sake | null> {
  if (!/^[0-9a-f]{8}$/i.test(idFragment)) return null;

  // UUID first segment range — works when slugify strips non-ASCII names to "-xxxxxxxx".
  const { data, error } = await supabase
    .from("sake")
    .select("*")
    .gte("id", `${idFragment}-0000-0000-0000-000000000000`)
    .lte("id", `${idFragment}-ffff-ffff-ffff-ffffffffffff`)
    .limit(5);

  if (error) throw error;
  const match = (data ?? []).find((row) => String(row.id).startsWith(idFragment));
  return (match as Sake | undefined) ?? null;
}

/** Returns null when the slug does not match a sake. Throws only on query/transport failures. */
export async function fetchSakeBySlug(slug: string): Promise<Sake | null> {
  const mappedId = getSakeIdFromSlug(slug) ?? (await loadSakeIdMap())[slug];
  if (mappedId) {
    const { data, error } = await supabase.from("sake").select("*").eq("id", mappedId).maybeSingle();
    if (error) throw error;
    return (data as Sake | null) ?? null;
  }

  const { idFragment, nameSlug } = parseSakeSlug(slug);
  const namePattern = sanitizePostgrestSearch(nameSlug.replace(/-/g, " "));

  // Japanese-only names slugify to empty → "/sake/-080467c8". Resolve by UUID prefix.
  if (!namePattern) {
    return fetchSakeByIdPrefix(idFragment);
  }

  const { data, error } = await supabase
    .from("sake")
    .select("*")
    .ilike("name", `%${namePattern}%`)
    .limit(20);

  if (error) throw error;

  const sake = data?.find((row) => String(row.id).startsWith(idFragment));
  if (sake) return sake as Sake;

  // Name ilike can miss romanization drift; fall back to id prefix.
  return fetchSakeByIdPrefix(idFragment);
}
