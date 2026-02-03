import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/card";
import { Heart, Target, Users, Globe } from "lucide-react";

const values = [
  {
    icon: Heart,
    title: "Passion for Sake",
    description: "We believe sake is more than a drink—it's a centuries-old craft that deserves to be understood and appreciated by everyone.",
  },
  {
    icon: Target,
    title: "Accessible Knowledge",
    description: "We're breaking down barriers to sake appreciation, making expert knowledge available to curious beginners and seasoned connoisseurs alike.",
  },
  {
    icon: Users,
    title: "Community First",
    description: "Our community of sake lovers drives everything we do. Their reviews, discoveries, and passion shape the Sake Scan experience.",
  },
  {
    icon: Globe,
    title: "Global Appreciation",
    description: "We're connecting sake enthusiasts worldwide, bridging cultures and bringing Japanese brewing traditions to a global audience.",
  },
];

const team = [
  { name: "Yuki Tanaka", role: "Founder & CEO", initials: "YT" },
  { name: "James Chen", role: "CTO", initials: "JC" },
  { name: "Mika Sato", role: "Head of Sake Curation", initials: "MS" },
  { name: "Alex Rivera", role: "Head of Design", initials: "AR" },
];

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 text-center mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold mb-6">
            Bringing Sake to the World
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Sake Scan was born from a simple idea: everyone should be able to discover and appreciate the art of sake, no matter where they are in their journey.
          </p>
        </section>

        {/* Story */}
        <section className="max-w-4xl mx-auto px-6 mb-20">
          <Card className="p-8 sm:p-12">
            <h2 className="text-2xl font-serif font-bold mb-6">Our Story</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                It started in a small izakaya in Tokyo. Our founder, Yuki, watched as tourists struggled to navigate the sake menu, missing out on incredible experiences simply because they couldn't read the labels or understand the terminology.
              </p>
              <p>
                That moment sparked an idea: what if anyone could point their phone at a sake bottle and instantly understand everything about it? The brewery's history, the flavor profile, what food to pair it with, what other sake lovers thought about it.
              </p>
              <p>
                In 2023, Sake Scan launched with a simple mission: democratize sake knowledge. Today, we've cataloged over 50,000 sakes from breweries across Japan and beyond, built a community of 25,000+ passionate enthusiasts, and helped countless people discover their new favorite drink.
              </p>
              <p>
                We're just getting started. Our dream is a world where everyone can walk into any restaurant or shop, scan a bottle, and feel confident in their choice. Where sake appreciation isn't limited by language or expertise. Where every sip comes with a story.
              </p>
            </div>
          </Card>
        </section>

        {/* Values */}
        <section className="max-w-6xl mx-auto px-6 mb-20">
          <h2 className="text-2xl font-serif font-bold text-center mb-10">What We Believe</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((value) => (
              <Card key={value.title} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <value.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">{value.title}</h3>
                    <p className="text-sm text-muted-foreground">{value.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-serif font-bold text-center mb-10">Our Team</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {team.map((member) => (
              <div key={member.name} className="text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-semibold text-lg">{member.initials}</span>
                </div>
                <h3 className="font-semibold">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
