import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { BlogCTA } from "@/components/blog/BlogCTA";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Globe, Phone, Calendar, Wine, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Brewery, Sake } from "@/lib/supabase-types";
import NotFound from "./NotFound";
import { withImageCacheBust } from "@/lib/image-url";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function BreweryDetail() {
  const { slug } = useParams<{ slug: string }>();
  const breweryName = slug?.replace(/-/g, " ") ?? "";

  const { data: brewery, isLoading } = useQuery({
    queryKey: ["brewery-detail", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breweries")
        .select("*")
        .ilike("name", `%${breweryName}%`)
        .limit(1)
        .single();
      if (error) throw error;
      return data as Brewery;
    },
    enabled: !!slug,
  });

  const { data: sakes } = useQuery({
    queryKey: ["brewery-sakes", brewery?.name],
    queryFn: async () => {
      if (!brewery) return [];
      const { data } = await supabase
        .from("sake")
        .select("id, name, type, average_rating, label_image_url, polishing_ratio, updated_at")
        .ilike("brewery", `%${brewery.name}%`)
        .order("average_rating", { ascending: false, nullsFirst: false })
        .limit(20);
      return (data ?? []) as Pick<
        Sake,
        "id" | "name" | "type" | "average_rating" | "label_image_url" | "polishing_ratio" | "updated_at"
      >[];
    },
    enabled: !!brewery,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!brewery) return <NotFound />;

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brewery.name,
    description: brewery.description ?? `${brewery.name} sake brewery${brewery.prefecture ? ` in ${brewery.prefecture}, Japan` : ""}`,
    ...(brewery.website ? { url: brewery.website } : {}),
    ...(brewery.image_url ? { image: brewery.image_url } : {}),
    ...(brewery.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: brewery.address,
            addressCountry: "JP",
          },
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${brewery.name} — Sake Brewery${brewery.prefecture ? ` in ${brewery.prefecture}` : ""}`}
        description={brewery.description ?? `Explore ${brewery.name}, a sake brewery${brewery.prefecture ? ` based in ${brewery.prefecture}, Japan` : ""}. Discover their sake lineup, history, and visiting information.`}
        path={`/brewery/${slug}`}
        image={brewery.image_url ?? undefined}
        schema={orgSchema}
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <Breadcrumbs
            items={[
              { label: "Explore", href: "/explore" },
              { label: brewery.name },
            ]}
          />

          <div className="mt-6 mb-8">
            <div className="flex flex-col md:flex-row gap-8">
              {brewery.image_url ? (
                <div className="md:w-1/3 flex-shrink-0">
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/50">
                    <img
                      src={brewery.image_url}
                      alt={`${brewery.name} brewery`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex-1 min-w-0">
                <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-4">
                  {brewery.name}
                </h1>

                <div className="flex flex-wrap gap-3 mb-4 text-sm text-muted-foreground">
                  {brewery.prefecture ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {brewery.prefecture}{brewery.region ? `, ${brewery.region}` : ""}
                    </span>
                  ) : null}
                  {brewery.founded_year ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Founded {brewery.founded_year}
                    </span>
                  ) : null}
                  {brewery.tour_available ? (
                    <Badge variant="secondary">Tours Available</Badge>
                  ) : null}
                </div>

                {brewery.description ? (
                  <p className="text-muted-foreground mb-6">{brewery.description}</p>
                ) : null}

                <div className="space-y-2 text-sm">
                  {brewery.address ? (
                    <div className="flex gap-2">
                      <span className="font-medium w-24 flex-shrink-0">Address</span>
                      <span className="text-muted-foreground">{brewery.address}</span>
                    </div>
                  ) : null}
                  {brewery.phone ? (
                    <div className="flex gap-2">
                      <span className="font-medium w-24 flex-shrink-0 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> Phone
                      </span>
                      <span className="text-muted-foreground">{brewery.phone}</span>
                    </div>
                  ) : null}
                  {brewery.website ? (
                    <div className="flex gap-2">
                      <span className="font-medium w-24 flex-shrink-0 flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" /> Website
                      </span>
                      <a href={brewery.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        {brewery.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  ) : null}
                  {brewery.visiting_info ? (
                    <div className="flex gap-2">
                      <span className="font-medium w-24 flex-shrink-0">Visiting</span>
                      <span className="text-muted-foreground">{brewery.visiting_info}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {brewery.gallery_images && brewery.gallery_images.length > 0 ? (
            <div className="mb-10">
              <h2 className="text-xl font-serif font-semibold mb-4">Gallery</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {brewery.gallery_images.slice(0, 6).map((img, i) => (
                  <div key={i} className="aspect-[4/3] rounded-lg overflow-hidden bg-muted/50">
                    <img src={img} alt={`${brewery.name} gallery image ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {sakes && sakes.length > 0 ? (
            <div className="mb-10">
              <h2 className="text-xl font-serif font-semibold mb-4">Sake Lineup ({sakes.length})</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {sakes.map((sake) => (
                  <Link
                    key={sake.id}
                    to={`/sake/${slugify(sake.name)}-${sake.id.slice(0, 8)}`}
                    className="group"
                  >
                    <Card className="p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                      <div className="w-12 h-16 rounded bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {sake.label_image_url ? (
                          <img
                            src={withImageCacheBust(sake.label_image_url, sake.updated_at)}
                            alt={sake.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Wine className="w-5 h-5 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-1">
                          {sake.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {sake.type ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sake.type}</Badge> : null}
                          {sake.polishing_ratio ? <span className="text-[10px] text-muted-foreground">{sake.polishing_ratio}% polish</span> : null}
                          {sake.average_rating ? (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              {sake.average_rating.toFixed(1)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <BlogCTA variant="banner" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
