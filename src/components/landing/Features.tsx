import { Card } from "@/components/ui/card";
import { Scan, BookOpen, Utensils, Users, TrendingUp, Globe } from "lucide-react";

const features = [
  {
    icon: Scan,
    title: "Instant Label Scanning",
    description: "Point your camera at any sake label and get detailed information in seconds using AI-powered recognition.",
  },
  {
    icon: BookOpen,
    title: "Comprehensive Database",
    description: "Access detailed profiles of over 50,000 sakes from breweries across Japan and the world.",
  },
  {
    icon: Utensils,
    title: "Food Pairing Suggestions",
    description: "Get personalized recommendations for dishes that complement each sake's unique flavor profile.",
  },
  {
    icon: Users,
    title: "Community Reviews",
    description: "Read authentic reviews from sake enthusiasts and share your own tasting experiences.",
  },
  {
    icon: TrendingUp,
    title: "Personal Taste Profile",
    description: "Track your favorites and get AI-powered recommendations based on your preferences.",
  },
  {
    icon: Globe,
    title: "Brewery Discovery",
    description: "Explore sake regions, learn about traditional brewing methods, and discover hidden gems.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold mb-4">
            Everything You Need to
            <br />
            <span className="text-primary">Master Sake</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Whether you&apos;re a curious beginner or a seasoned connoisseur, Sake Scan gives you the tools to explore, learn, and enjoy sake like never before.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="p-6 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
