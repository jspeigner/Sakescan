import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Star, Wine, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";
import { withImageCacheBust } from "@/lib/image-url";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function SakeExplore() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 24;

  const { data, isLoading } = useQuery({
    queryKey: ["explore-sake", search, typeFilter, regionFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("sake")
        .select("*", { count: "exact" })
        .order("average_rating", { ascending: false, nullsFirst: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,brewery.ilike.%${search}%`);
      }
      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter);
      }
      if (regionFilter !== "all") {
        query = query.eq("region", regionFilter);
      }

      const { data: sakes, count, error } = await query;
      if (error) throw error;
      return { sakes: (sakes ?? []) as Sake[], total: count ?? 0 };
    },
  });

  const { data: filters } = useQuery({
    queryKey: ["sake-filters"],
    queryFn: async () => {
      const [typesRes, regionsRes] = await Promise.all([
        supabase.from("sake").select("type").not("type", "is", null),
        supabase.from("sake").select("region").not("region", "is", null),
      ]);
      const types = [...new Set((typesRes.data ?? []).map((r) => r.type as string))].filter(Boolean).sort();
      const regions = [...new Set((regionsRes.data ?? []).map((r) => r.region as string))].filter(Boolean).sort();
      return { types, regions };
    },
    staleTime: 1000 * 60 * 60,
  });

  const sakes = data?.sakes ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Explore Sake — Browse 50,000+ Sakes"
        description="Browse and discover over 50,000 sakes from breweries across Japan. Filter by type, region, and rating to find your perfect sake."
        path="/explore"
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <Breadcrumbs items={[{ label: "Explore Sake" }]} />

          <div className="mt-6 mb-8">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-3">
              Explore Sake
            </h1>
            <p className="text-lg text-muted-foreground">
              Browse our database of {total > 0 ? total.toLocaleString() : "50,000+"} sakes from breweries across Japan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search sake or brewery..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sake Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(filters?.types ?? []).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={regionFilter} onValueChange={(v) => { setRegionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {(filters?.regions ?? []).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : sakes.length === 0 ? (
            <div className="text-center py-20">
              <Wine className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No sakes found matching your filters.</p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sakes.map((sake) => (
                  <Link key={sake.id} to={`/sake/${slugify(sake.name)}-${sake.id.slice(0, 8)}`} className="group block">
                    <Card className="overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
                      <div className="aspect-[4/3] bg-muted/50 flex items-center justify-center overflow-hidden">
                        {sake.label_image_url ? (
                          <img
                            src={withImageCacheBust(sake.label_image_url, sake.updated_at)}
                            alt={`${sake.name} sake label`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <Wine className="w-10 h-10 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="p-3.5">
                        <h3 className="font-medium text-sm mb-1 line-clamp-1 group-hover:text-primary transition-colors">
                          {sake.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{sake.brewery}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {sake.type ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sake.type}</Badge> : null}
                          {sake.average_rating ? (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              {sake.average_rating.toFixed(1)}
                            </span>
                          ) : null}
                          {sake.prefecture ? (
                            <span className="text-[10px] text-muted-foreground">{sake.prefecture}</span>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
