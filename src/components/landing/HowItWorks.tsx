import { Scan, Search, Star, Share2 } from "lucide-react";

const steps = [
  {
    icon: Scan,
    number: "01",
    title: "Scan the Label",
    description: "Open the app and point your camera at any sake bottle label. Our AI instantly recognizes it.",
  },
  {
    icon: Search,
    number: "02",
    title: "Get Instant Info",
    description: "See detailed information including brewery, region, rice type, SMV, and tasting notes.",
  },
  {
    icon: Star,
    number: "03",
    title: "Rate & Review",
    description: "Record your impressions, rate the sake, and add it to your personal collection.",
  },
  {
    icon: Share2,
    number: "04",
    title: "Share & Discover",
    description: "Share your finds with friends and discover new favorites based on your taste profile.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From scan to sip in seconds. Here&apos;s how easy it is to unlock the story behind every bottle.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent -translate-y-1/2" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="relative text-center lg:text-left"
              >
                {/* Step card */}
                <div className="relative bg-card rounded-2xl p-6 border border-border hover:border-primary/30 transition-colors">
                  {/* Number badge */}
                  <div className="absolute -top-3 left-6 px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full">
                    {step.number}
                  </div>

                  {/* Icon */}
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto lg:mx-0 mt-2 mb-4">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>

                  {/* Content */}
                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Arrow for desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-6 text-primary/40 -translate-y-1/2 z-10">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
