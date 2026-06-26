import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { getPublishedPosts } from "@/lib/blog-data";
import { cityGuides } from "@/lib/city-data";
import type { SitemapEntry } from "@/lib/sitemap";
import { sakeSlug, slugify } from "@/lib/slugify";
import { setSakeIdMap } from "@/lib/sake-id-map";

const STATIC_ROUTES = [
  "/",
  "/about",
  "/explore",
  "/blog",
  "/guides",
  "/contact",
  "/careers",
  "/privacy",
  "/terms",
];

const STATIC_LASTMOD: Record<string, string> = {
  "/": "2026-05-19",
  "/about": "2026-02-01",
  "/explore": "2026-05-19",
  "/guides": "2026-02-15",
  "/contact": "2026-02-01",
  "/careers": "2026-02-01",
  "/privacy": "2026-01-01",
  "/terms": "2026-01-01",
};

function buildLastmodMap(): Map<string, string> {
  const lastmodByPath = new Map<string, string>(Object.entries(STATIC_LASTMOD));
  const publishedPosts = getPublishedPosts();

  const latestBlogDate = publishedPosts.reduce<string | undefined>((latest, post) => {
    const date = post.modifiedDate ?? post.publishDate;
    if (!latest || date > latest) {
      return date;
    }
    return latest;
  }, undefined);

  if (latestBlogDate) {
    lastmodByPath.set("/blog", latestBlogDate);
  }

  for (const post of publishedPosts) {
    lastmodByPath.set(`/blog/${post.slug}`, post.modifiedDate ?? post.publishDate);
  }

  for (const city of cityGuides) {
    lastmodByPath.set(`/guides/${city.slug}`, "2026-02-15");
  }

  return lastmodByPath;
}

function getSupabaseForPrerender() {
  const url =
    process.env.VITE_SUPABASE_URL ??
    import.meta.env.VITE_SUPABASE_URL ??
    "https://qpsdebikkmcdzddhphlk.supabase.co";
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    "sb_publishable_2_EyN29uDqznDNteH_-DMA_hWZ46p-D";
  return createClient(url, key);
}

async function fetchDynamicSlugs(): Promise<{ sake: string[]; brewery: string[]; sakeIdMap: Record<string, string> }> {
  const maxSake = Number(process.env.PRERENDER_MAX_SAKE ?? import.meta.env.PRERENDER_MAX_SAKE ?? "5000");
  const maxBrewery = Number(process.env.PRERENDER_MAX_BREWERY ?? import.meta.env.PRERENDER_MAX_BREWERY ?? "2000");

  const supabase = getSupabaseForPrerender();
  const sakeRoutes: string[] = [];
  const breweryRoutes: string[] = [];
  const sakeIdMap: Record<string, string> = {};

  const pageSize = 1000;
  for (let offset = 0; offset < maxSake; offset += pageSize) {
    const { data, error } = await supabase
      .from("sake")
      .select("id, name")
      .order("average_rating", { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.warn("[prerender] Failed to fetch sake slugs:", error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.name && row.id) {
        const slug = sakeSlug(row.name, row.id);
        sakeRoutes.push(`/sake/${slug}`);
        sakeIdMap[slug] = row.id;
      }
    }
    if (data.length < pageSize) break;
  }

  for (let offset = 0; offset < maxBrewery; offset += pageSize) {
    const { data, error } = await supabase
      .from("breweries")
      .select("name")
      .order("name")
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.warn("[prerender] Failed to fetch brewery slugs:", error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.name) {
        breweryRoutes.push(`/brewery/${slugify(row.name)}`);
      }
    }
    if (data.length < pageSize) break;
  }

  return { sake: sakeRoutes, brewery: breweryRoutes, sakeIdMap };
}

export async function getPrerenderRoutes(distDir?: string): Promise<string[]> {
  const blogRoutes = getPublishedPosts().map((post) => `/blog/${post.slug}`);
  const guideRoutes = cityGuides.map((city) => `/guides/${city.slug}`);

  let dynamicRoutes: string[] = [];
  try {
    const { sake, brewery, sakeIdMap } = await fetchDynamicSlugs();
    dynamicRoutes = [...sake, ...brewery];
    setSakeIdMap(sakeIdMap);

    if (distDir) {
      const mapPath = path.join(distDir, "data/sake-id-map.json");
      fs.mkdirSync(path.dirname(mapPath), { recursive: true });
      fs.writeFileSync(mapPath, JSON.stringify(sakeIdMap), "utf-8");
    }

    console.log(`[prerender] ${sake.length} sake + ${brewery.length} brewery routes`);
  } catch (err) {
    console.warn("[prerender] Skipping dynamic routes:", err);
  }

  return [...STATIC_ROUTES, ...blogRoutes, ...guideRoutes, ...dynamicRoutes];
}

export async function getSitemapEntries(distDir?: string): Promise<SitemapEntry[]> {
  const routes = await getPrerenderRoutes(distDir);
  return toSitemapEntries(routes);
}

export function toSitemapEntries(routes: string[]): SitemapEntry[] {
  const lastmodByPath = buildLastmodMap();

  return routes.map((route) => ({
    path: route,
    lastmod: lastmodByPath.get(route),
  }));
}
