import { Link } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowRight } from "lucide-react";
import { cityGuides } from "@/lib/city-data";

export default function CityGuides() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Sake City Guides — Best Sake Bars and Restaurants in the US"
        description="Discover the best sake bars, Japanese restaurants, and sake shops in major US cities. Expert local guides for NYC, LA, SF, Chicago, Seattle, and more."
        path="/guides"
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <Breadcrumbs items={[{ label: "City Guides" }]} />

          <div className="mt-6 mb-10">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-3">
              Sake City Guides
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Find the best sake bars, Japanese restaurants, and specialty shops in your city. Expert-curated guides to sake scenes across the United States.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cityGuides.map((city) => (
              <Link key={city.slug} to={`/guides/${city.slug}`} className="group block">
                <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={city.heroImage}
                      alt={city.heroImageAlt}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <h2 className="text-xl font-serif font-bold text-white mb-1">
                        {city.name}
                      </h2>
                      <div className="flex items-center gap-1 text-white/80 text-sm">
                        <MapPin className="w-3.5 h-3.5" />
                        {city.state}
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {city.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {city.topVenues.length} venues
                      </Badge>
                      <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Explore <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
