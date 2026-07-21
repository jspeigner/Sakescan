import { Link, useParams } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CareerApplicationForm } from "@/components/careers/CareerApplicationForm";
import { getCareerJob } from "@/lib/careers";
import { ArrowLeft, MapPin, Briefcase, Clock, Wallet } from "lucide-react";

export default function CareerJob() {
  const { slug } = useParams<{ slug: string }>();
  const job = slug ? getCareerJob(slug) : undefined;

  if (!job) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 max-w-2xl mx-auto px-6 text-center">
          <h1 className="text-2xl font-serif font-bold mb-4">Role not found</h1>
          <Button asChild variant="outline">
            <Link to="/careers">Back to careers</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${job.title} — Careers`}
        description={job.summary}
        path={`/careers/${job.slug}`}
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 gap-1">
            <Link to="/careers">
              <ArrowLeft className="w-4 h-4" />
              All roles
            </Link>
          </Button>

          <header className="mb-10">
            <p className="text-sm text-primary font-medium mb-2">{job.department}</p>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-4">{job.title}</h1>
            <p className="text-muted-foreground mb-6">{job.summary}</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 shrink-0" />
                {job.location}
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 shrink-0" />
                {job.type}
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 shrink-0" />
                {job.compensation}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                {job.timeZone}
              </div>
            </div>
          </header>

          <div className="space-y-8 mb-14">
            <section>
              <h2 className="text-xl font-semibold mb-3">About SakeScan</h2>
              <p className="text-muted-foreground leading-relaxed">{job.aboutCompany}</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold mb-3">About the role</h2>
              <p className="text-muted-foreground leading-relaxed">{job.aboutRole}</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold mb-3">What you&apos;ll do</h2>
              <ul className="space-y-2">
                {job.responsibilities.map((item) => (
                  <li key={item} className="flex gap-2 text-muted-foreground">
                    <span className="text-primary mt-1.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-xl font-semibold mb-3">What we&apos;re looking for</h2>
              <ul className="space-y-2">
                {job.requirements.map((item) => (
                  <li key={item} className="flex gap-2 text-muted-foreground">
                    <span className="text-primary mt-1.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
            {job.niceToHave && job.niceToHave.length > 0 ? (
              <section>
                <h2 className="text-xl font-semibold mb-3">Nice to have</h2>
                <ul className="space-y-2">
                  {job.niceToHave.map((item) => (
                    <li key={item} className="flex gap-2 text-muted-foreground">
                      <span className="text-primary mt-1.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section>
              <h2 className="text-xl font-semibold mb-3">How to apply</h2>
              <p className="text-muted-foreground leading-relaxed">{job.howToApply}</p>
            </section>
          </div>

          <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold mb-2">Apply for this role</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Submit your note and resume below. PDF preferred.
            </p>
            <CareerApplicationForm job={job} />
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
