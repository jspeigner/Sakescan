import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Brewery, Sake } from "@/lib/supabase-types";
import { fetchSakeBySlug } from "@/lib/sake-slug";

const EXPLORE_PAGE_SIZE = 24;

async function fetchRelatedSakes(sake: Sake) {
  const { data } = await supabase
    .from("sake")
    .select("id, name, type, average_rating, image_url")
    .eq("brewery", sake.brewery)
    .neq("id", sake.id)
    .limit(4);
  return data ?? [];
}

async function fetchBreweryBySlug(slug: string): Promise<Brewery> {
  const breweryName = slug.replace(/-/g, " ");
  const { data, error } = await supabase
    .from("breweries")
    .select("*")
    .ilike("name", `%${breweryName}%`)
    .limit(1)
    .single();
  if (error) throw error;
  return data as Brewery;
}

async function fetchBrewerySakes(breweryName: string) {
  const { data } = await supabase
    .from("sake")
    .select("id, name, type, average_rating, image_url, polishing_ratio, updated_at")
    .ilike("brewery", `%${breweryName}%`)
    .order("average_rating", { ascending: false, nullsFirst: false })
    .limit(20);
  return data ?? [];
}

async function fetchExploreSakes() {
  const { data: sakes, count, error } = await supabase
    .from("sake")
    .select("*", { count: "exact" })
    .order("average_rating", { ascending: false, nullsFirst: false })
    .range(0, EXPLORE_PAGE_SIZE - 1);
  if (error) throw error;
  return { sakes: (sakes ?? []) as Sake[], total: count ?? 0 };
}

export async function prefetchForUrl(url: string, queryClient: QueryClient): Promise<void> {
  const pathname = url.split("?")[0].replace(/\/$/, "") || "/";

  if (pathname === "/explore") {
    await queryClient.prefetchQuery({
      queryKey: ["explore-sake", "", "all", "all", 0],
      queryFn: fetchExploreSakes,
    });
    return;
  }

  const sakeMatch = pathname.match(/^\/sake\/(.+)$/);
  if (sakeMatch) {
    const slug = sakeMatch[1];
    const idFragment = slug.split("-").pop() ?? "";
    if (!idFragment) return;

    await queryClient.prefetchQuery({
      queryKey: ["sake-detail", idFragment],
      queryFn: () => fetchSakeBySlug(slug),
    });

    const sake = queryClient.getQueryData<Sake>(["sake-detail", idFragment]);
    if (sake) {
      await queryClient.prefetchQuery({
        queryKey: ["related-sake", sake.brewery, sake.type],
        queryFn: () => fetchRelatedSakes(sake),
      });
    }
    return;
  }

  const breweryMatch = pathname.match(/^\/brewery\/(.+)$/);
  if (breweryMatch) {
    const slug = breweryMatch[1];
    await queryClient.prefetchQuery({
      queryKey: ["brewery-detail", slug],
      queryFn: () => fetchBreweryBySlug(slug),
    });

    const brewery = queryClient.getQueryData<Brewery>(["brewery-detail", slug]);
    if (brewery) {
      await queryClient.prefetchQuery({
        queryKey: ["brewery-sakes", brewery.name],
        queryFn: () => fetchBrewerySakes(brewery.name),
      });
    }
  }
}
