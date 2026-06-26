import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";
import { getSakeIdFromSlug, loadSakeIdMap } from "@/lib/sake-id-map";

export function parseSakeSlug(slug: string): { idFragment: string; nameSlug: string } {
  const idFragment = slug.split("-").pop() ?? "";
  const nameSlug = slug.slice(0, slug.length - idFragment.length - 1);
  return { idFragment, nameSlug };
}

export async function fetchSakeBySlug(slug: string): Promise<Sake> {
  const mappedId = getSakeIdFromSlug(slug) ?? (await loadSakeIdMap())[slug];
  if (mappedId) {
    const { data, error } = await supabase.from("sake").select("*").eq("id", mappedId).single();
    if (error) throw error;
    return data as Sake;
  }

  const { idFragment, nameSlug } = parseSakeSlug(slug);
  const namePattern = nameSlug.replace(/-/g, " ");

  if (!namePattern) {
    throw new Error(`Sake not found: ${slug}`);
  }

  const { data, error } = await supabase
    .from("sake")
    .select("*")
    .ilike("name", `%${namePattern}%`)
    .limit(20);

  if (error) throw error;

  const sake = data?.find((row) => String(row.id).startsWith(idFragment));
  if (!sake) {
    throw new Error(`Sake not found: ${slug}`);
  }

  return sake as Sake;
}
