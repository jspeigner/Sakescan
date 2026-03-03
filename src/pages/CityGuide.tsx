import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { BlogCTA } from "@/components/blog/BlogCTA";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Utensils, Wine, ShoppingBag, Star, Lightbulb, CalendarDays, ArrowLeft } from "lucide-react";
import { getCityBySlug } from "@/lib/city-data";
import NotFound from "./NotFound";

const venueIcons = { bar: Wine, restaurant: Utensils, shop: ShoppingBag } as const;

export default function CityGuide() {
  const { city } = useParams<{ city: string }>();
  const data = city ? getCityBySlug(city) : undefined;

  if (!data) return <NotFound />;

  const citySchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.seoTitle,
    description: data.seoDescription,
    image: data.heroImage,
    author: { "@type": "Organization", name: "SakeScan" },
    publisher: {
      "@type": "Organization",
      name: "SakeScan",
      logo: { "@type": "ImageObject", url: "https://www.sakescan.com/favicon.svg" },
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={data.seoTitle}
        description={data.seoDescription}
        path={`/guides/${data.slug}`}
        image={data.heroImage}
        type="article"
        schema={citySchema}
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <Breadcrumbs items={[{ label: "City Guides", href: "/guides" }, { label: data.name }]} />

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary">
                <MapPin className="w-3 h-3 mr-1" />
                {data.state}
              </Badge>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold mb-4">
              {data.seoTitle}
            </h1>
            <p className="text-lg text-muted-foreground">
              {data.description}
            </p>
          </div>

          <div className="relative aspect-[2/1] rounded-xl overflow-hidden mb-10">
            <img src={data.heroImage} alt={data.heroImageAlt} className="w-full h-full object-cover" />
          </div>

          <div className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-serif">
            <p className="text-lg">{data.intro}</p>

            <h2 id="sake-scene">The Sake Scene in {data.name}</h2>
            <p>{data.sakeScene}</p>

            <h2 id="top-venues">Top Sake Venues</h2>
          </div>

          <div className="space-y-4 my-8">
            {data.topVenues.map((venue, i) => {
              const Icon = venueIcons[venue.type];
              return (
                <Card key={i} className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-lg">{venue.name}</h3>
                        <Badge variant="outline" className="text-xs capitalize">{venue.type}</Badge>
                        <span className="text-sm text-muted-foreground">{venue.neighborhood}</span>
                      </div>
                      <p className="text-muted-foreground text-sm mb-2">{venue.description}</p>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Star className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="font-medium">{venue.highlight}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-serif">
            <h2 id="local-tips">
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="w-6 h-6 text-yellow-500 not-prose" />
                Local Tips
              </span>
            </h2>
            <ul>
              {data.localTips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>

            {data.events.length > 0 ? (
              <>
                <h2 id="events">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="w-6 h-6 text-primary not-prose" />
                    Sake Events
                  </span>
                </h2>
                <ul>
                  {data.events.map((event, i) => (
                    <li key={i}>{event}</li>
                  ))}
                </ul>
              </>
            ) : null}

            <h2 id="explore-sake">Explore Sake in {data.name} with SakeScan</h2>
            <p>
              Whether you're at a sake bar, browsing a liquor store, or decoding a Japanese menu at a restaurant in {data.name}, SakeScan is your pocket sake sommelier. Scan any sake label for instant ratings, tasting notes, food pairings, and serving suggestions.
            </p>
          </div>

          <BlogCTA variant="banner" />

          <div className="mt-8 flex items-center justify-between">
            <Link to="/guides" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" />
              All City Guides
            </Link>
            <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Read the Sake Blog →
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
