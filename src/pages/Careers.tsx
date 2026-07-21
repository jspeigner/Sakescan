import { Link } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CAREER_JOBS } from "@/lib/careers";
import { MapPin, Briefcase, ArrowRight, Clock } from "lucide-react";

const perks = [
  "Remote-first contractor roles",
  "Paid in USD via crypto / stablecoin",
  "Small pod — your work ships weekly",
  "AI-first tooling culture",
  "Direct ownership of outcomes",
  "Path from 3-month engagement to long-term",
];

export default function Careers() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Careers at SakeScan"
        description="Join SakeScan — open roles for Marketing Lead, Product Developer, and Content Creator. Remote contractor positions with real ownership."
        path="/careers"
      />
      <Header />
      <main className="pt-24 pb-16">
        <section className="max-w-4xl mx-auto px-6 text-center mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold mb-6">
            Careers
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We&apos;re hiring a tight product pod — marketing, engineering, and content — to grow SakeScan.
            Remote, ownership-heavy, AI-augmented.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mb-16">
          <Card className="p-8">
            <h2 className="text-xl font-semibold mb-6">How we work</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {perks.map((perk) => (
                <div key={perk} className="flex items-start gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  <span>{perk}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-serif font-bold mb-8">Open positions</h2>
          <div className="space-y-4">
            {CAREER_JOBS.map((job) => (
              <Card key={job.slug} className="p-6 hover:border-primary/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-medium px-2 py-1 rounded-md bg-primary/10 text-primary">
                        {job.department}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{job.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{job.summary}</p>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {job.location}
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" />
                        Contractor
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        US Eastern overlap
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="gap-2 flex-shrink-0 min-h-[44px]">
                    <Link to={`/careers/${job.slug}`}>
                      View & apply
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-8 p-6 border-dashed">
            <div className="text-center">
              <h3 className="font-semibold mb-2">Don&apos;t see a perfect fit?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Send a note and resume to{" "}
                <a href="mailto:careers@sakescan.com" className="text-primary hover:underline">
                  careers@sakescan.com
                </a>
                .
              </p>
            </div>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
}
