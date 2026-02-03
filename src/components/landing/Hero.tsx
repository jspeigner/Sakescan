import { Button } from "@/components/ui/button";
import { Scan, Star, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 pb-16 overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Subtle wave pattern */}
        <svg className="absolute bottom-0 left-0 right-0 w-full h-48 text-primary/5" preserveAspectRatio="none" viewBox="0 0 1440 320">
          <path fill="currentColor" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,112C672,96,768,96,864,112C960,128,1056,160,1152,160C1248,160,1344,128,1392,112L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>

        {/* Floating sake-related decorations - hidden on mobile to avoid clutter */}
        <div className="hidden lg:block absolute top-1/4 left-[5%] w-20 h-20 opacity-10 animate-float">
          <span className="text-6xl text-primary">🍶</span>
        </div>
        <div className="hidden lg:block absolute top-1/3 right-[5%] w-16 h-16 opacity-10 animate-float delay-300">
          <span className="text-5xl text-primary">🏯</span>
        </div>
        <div className="hidden lg:block absolute bottom-1/3 left-[8%] w-14 h-14 opacity-10 animate-float delay-500">
          <span className="text-4xl text-primary">🌸</span>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left side - Text content */}
          <div className="text-center lg:text-left order-2 lg:order-1">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 animate-fade-in-up">
              <Sparkles className="w-4 h-4" />
              <span>The #1 Sake Discovery App</span>
            </div>

            {/* Main heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold leading-tight mb-6 animate-fade-in-up delay-100">
              Scan. Discover.
              <br />
              <span className="text-primary">Savor.</span>
            </h1>

            {/* Subheading */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 animate-fade-in-up delay-200">
              Unlock the world of sake with a simple scan. Get instant ratings, tasting notes, food pairings, and recommendations from thousands of sake enthusiasts.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 mb-10 animate-fade-in-up delay-300">
              <Button size="lg" className="gap-2 text-base px-8 py-6">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Download for iOS
              </Button>
              <Button variant="outline" size="lg" className="gap-2 text-base px-8 py-6">
                <Scan className="w-5 h-5" />
                See How It Works
              </Button>
            </div>

            {/* Social proof */}
            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 sm:gap-6 text-sm text-muted-foreground animate-fade-in-up delay-400">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                ))}
                <span className="ml-2">4.9 on App Store</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <span>50,000+ Sakes</span>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <span>25,000+ Users</span>
            </div>
          </div>

          {/* Right side - Phone Mockup with real screenshot */}
          <div className="relative flex justify-center lg:justify-end order-1 lg:order-2 animate-fade-in-up delay-500">
            <div className="relative">
              {/* Phone frame */}
              <div className="relative rounded-[3rem] bg-gradient-to-b from-gray-800 to-gray-900 p-2 shadow-2xl">
                {/* Screen */}
                <div className="rounded-[2.5rem] overflow-hidden bg-white">
                  <img
                    src="/screen.png"
                    alt="Sake Scan App - Scan sake labels to discover ratings, tasting notes, and food pairings"
                    className="w-[260px] sm:w-[300px] h-auto"
                  />
                </div>

                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full" />
              </div>

              {/* Decorative glow */}
              <div className="absolute -inset-8 bg-primary/15 rounded-[5rem] blur-3xl -z-10" />

              {/* Floating badge - right side */}
              <div className="absolute -right-2 sm:-right-6 top-1/4 bg-card border border-border rounded-xl p-2.5 sm:p-3 shadow-lg animate-float">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent/20 flex items-center justify-center">
                    <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-accent text-accent" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium">Dassai 45</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">5.0 rating</p>
                  </div>
                </div>
              </div>

              {/* Floating badge - left side */}
              <div className="absolute -left-2 sm:-left-6 bottom-1/3 bg-card border border-border rounded-xl p-2.5 sm:p-3 shadow-lg animate-float delay-300">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium">Instant Scan</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">AI-powered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
