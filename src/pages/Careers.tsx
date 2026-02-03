import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Briefcase, ArrowRight } from "lucide-react";

const openings = [
  {
    title: "Senior iOS Engineer",
    department: "Engineering",
    location: "San Francisco / Remote",
    type: "Full-time",
    description: "Build the future of sake discovery on iOS. Work on camera-based recognition, smooth animations, and delightful user experiences.",
  },
  {
    title: "Machine Learning Engineer",
    department: "Engineering",
    location: "San Francisco / Remote",
    type: "Full-time",
    description: "Improve our sake label recognition models and build recommendation systems that help users discover their next favorite sake.",
  },
  {
    title: "Sake Content Curator",
    department: "Content",
    location: "Tokyo / Remote",
    type: "Full-time",
    description: "Research and document sakes from breweries across Japan. Native Japanese speaker with deep knowledge of sake culture preferred.",
  },
  {
    title: "Product Designer",
    department: "Design",
    location: "San Francisco / Remote",
    type: "Full-time",
    description: "Shape the visual identity and user experience of Sake Scan. Create beautiful, intuitive designs that make sake accessible to everyone.",
  },
  {
    title: "Community Manager",
    department: "Marketing",
    location: "Remote",
    type: "Full-time",
    description: "Build and nurture our community of sake enthusiasts. Create engaging content, moderate discussions, and organize virtual events.",
  },
];

const perks = [
  "Competitive salary & equity",
  "Health, dental & vision insurance",
  "Unlimited PTO",
  "Remote-first culture",
  "Annual sake education budget",
  "Team trips to Japan",
  "Home office stipend",
  "Learning & development budget",
];

export default function Careers() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 text-center mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold mb-6">
            Join Our Team
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Help us bring the art of sake to the world. We're looking for passionate people who want to make a difference.
          </p>
        </section>

        {/* Perks */}
        <section className="max-w-4xl mx-auto px-6 mb-16">
          <Card className="p-8">
            <h2 className="text-xl font-semibold mb-6">Why Work With Us</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {perks.map((perk) => (
                <div key={perk} className="flex items-center gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span>{perk}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Open positions */}
        <section className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-serif font-bold mb-8">Open Positions</h2>
          <div className="space-y-4">
            {openings.map((job) => (
              <Card key={job.title} className="p-6 hover:border-primary/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {job.department}
                      </span>
                      <span className="text-xs text-muted-foreground">{job.type}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{job.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{job.description}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {job.location}
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" />
                        {job.type}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 flex-shrink-0">
                    Apply
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Don't see a fit */}
          <Card className="mt-8 p-6 border-dashed">
            <div className="text-center">
              <h3 className="font-semibold mb-2">Don't see a perfect fit?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                We're always looking for talented people. Send us your resume and tell us how you can contribute.
              </p>
              <Button variant="outline">
                Send General Application
              </Button>
            </div>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
}
