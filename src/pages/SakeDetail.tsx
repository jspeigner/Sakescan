import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { BlogCTA } from "@/components/blog/BlogCTA";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Droplets, Thermometer, Wine, Wheat, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Sake } from "@/lib/supabase-types";
import NotFound from "./NotFound";
import { withImageCacheBust } from "@/lib/image-url";

export default function SakeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const idFragment = slug?.split("-").pop() ?? "";

  const { data: sake, isLoading } = useQuery({
    queryKey: ["sake-detail", idFragment],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sake")
        .select("*")
        .like("id", `${idFragment}%`)
        .limit(1)
        .single();
      if (error) throw error;
      return data as Sake;
    },
    enabled: !!idFragment,
  });

  const { data: relatedSakes } = useQuery({
    queryKey: ["related-sake", sake?.brewery, sake?.type],
    queryFn: async () => {
      if (!sake) return [];
      const { data } = await supabase
        .from("sake")
        .select("id, name, type, average_rating, image_url")
        .eq("brewery", sake.brewery)
        .neq("id", sake.id)
        .limit(4);
      return data ?? [];
    },
    enabled: !!sake,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sake) return <NotFound />;

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: sake.name,
    description: sake.description ?? `${sake.name} ${sake.type ?? "sake"} from ${sake.brewery}`,
    image: sake.image_url,
    brand: { "@type": "Brand", name: sake.brewery },
    ...(sake.average_rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: sake.average_rating.toFixed(1),
            ratingCount: sake.total_ratings || 1,
          },
        }
      : {}),
  };

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${sake.name} — ${sake.type ?? "Sake"} from ${sake.brewery}`}
        description={sake.description ?? `${sake.name} is a ${sake.type ?? "sake"} made by ${sake.brewery}${sake.prefecture ? ` in ${sake.prefecture}` : ""}. Explore tasting notes, food pairings, and ratings.`}
        path={`/sake/${slug}`}
        image={sake.image_url ?? undefined}
        schema={productSchema}
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <Breadcrumbs
            items={[
              { label: "Explore", href: "/explore" },
              { label: sake.name },
            ]}
          />

          <div className="mt-6 flex flex-col md:flex-row gap-8">
            <div className="md:w-1/3 flex-shrink-0">
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted/50 flex items-center justify-center sticky top-28">
                {sake.image_url ? (
                  <img
                    src={withImageCacheBust(sake.image_url, sake.updated_at)}
                    alt={`${sake.name} sake`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Wine className="w-16 h-16 text-muted-foreground/20" />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-3">
                {sake.type ? <Badge>{sake.type}</Badge> : null}
                {sake.subtype ? <Badge variant="secondary">{sake.subtype}</Badge> : null}
              </div>

              <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-1">
                {sake.name}
              </h1>
              {sake.name_japanese ? (
                <p className="text-xl text-muted-foreground mb-4">{sake.name_japanese}</p>
              ) : null}

              <div className="flex items-center gap-4 mb-6">
                {sake.average_rating ? (
                  <div className="flex items-center gap-1.5">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold text-lg">{sake.average_rating.toFixed(1)}</span>
                    <span className="text-sm text-muted-foreground">({sake.total_ratings} ratings)</span>
                  </div>
                ) : null}
                <Link to={`/brewery/${slugify(sake.brewery)}`} className="text-sm text-primary hover:underline">
                  {sake.brewery}
                </Link>
              </div>

              {sake.description ? (
                <p className="text-muted-foreground mb-6">{sake.description}</p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 mb-8">
                {sake.polishing_ratio ? (
                  <Card className="p-3 flex items-center gap-3">
                    <Wheat className="w-5 h-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Polishing Ratio</p>
                      <p className="font-medium">{sake.polishing_ratio}%</p>
                    </div>
                  </Card>
                ) : null}
                {sake.alcohol_percentage ? (
                  <Card className="p-3 flex items-center gap-3">
                    <Wine className="w-5 h-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">ABV</p>
                      <p className="font-medium">{sake.alcohol_percentage}%</p>
                    </div>
                  </Card>
                ) : null}
                {sake.smv !== null && sake.smv !== undefined ? (
                  <Card className="p-3 flex items-center gap-3">
                    <Thermometer className="w-5 h-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">SMV</p>
                      <p className="font-medium">{sake.smv > 0 ? "+" : ""}{sake.smv}</p>
                    </div>
                  </Card>
                ) : null}
                {sake.acidity ? (
                  <Card className="p-3 flex items-center gap-3">
                    <Droplets className="w-5 h-5 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Acidity</p>
                      <p className="font-medium">{sake.acidity}</p>
                    </div>
                  </Card>
                ) : null}
              </div>

              <div className="space-y-4 mb-8">
                {sake.rice_variety ? (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium w-32 flex-shrink-0">Rice Variety</span>
                    <span className="text-sm text-muted-foreground">{sake.rice_variety}</span>
                  </div>
                ) : null}
                {sake.prefecture ? (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium w-32 flex-shrink-0 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> Region
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {sake.prefecture}{sake.region ? `, ${sake.region}` : ""}
                    </span>
                  </div>
                ) : null}
                {sake.water_source ? (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium w-32 flex-shrink-0">Water Source</span>
                    <span className="text-sm text-muted-foreground">{sake.water_source}</span>
                  </div>
                ) : null}
                {sake.yeasts ? (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium w-32 flex-shrink-0">Yeast</span>
                    <span className="text-sm text-muted-foreground">{sake.yeasts}</span>
                  </div>
                ) : null}
              </div>

              {relatedSakes && relatedSakes.length > 0 ? (
                <div className="mb-8">
                  <h2 className="text-lg font-serif font-semibold mb-3">More from {sake.brewery}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {relatedSakes.map((rs: { id: string; name: string; type: string | null; average_rating: number | null; image_url: string | null }) => (
                      <Link
                        key={rs.id}
                        to={`/sake/${slugify(rs.name)}-${rs.id.slice(0, 8)}`}
                        className="group"
                      >
                        <Card className="p-3 hover:shadow-sm transition-shadow">
                          <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">{rs.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {rs.type ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{rs.type}</Badge> : null}
                            {rs.average_rating ? (
                              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                {rs.average_rating.toFixed(1)}
                              </span>
                            ) : null}
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <BlogCTA />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
