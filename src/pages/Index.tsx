import { Header, Hero, Features, HowItWorks, Testimonials, BlogShowcase, CTA, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        description="Discover, learn, and rate sake with SakeScan. Scan any sake label to get instant ratings, tasting notes, food pairings, and personalized recommendations. 50,000+ sakes cataloged."
        path="/"
      />
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <BlogShowcase />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
