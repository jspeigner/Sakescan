import { useState } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { BlogCard } from "@/components/blog/BlogCard";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { getPublishedPosts, BLOG_CATEGORIES, type BlogCategory } from "@/lib/blog-data";

export default function Blog() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<BlogCategory | "All">("All");

  const published = getPublishedPosts();

  const filtered = published.filter((post) => {
    const matchesSearch =
      search === "" ||
      post.title.toLowerCase().includes(search.toLowerCase()) ||
      post.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || post.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const featured = published.find((p) => p.isPillar);
  const rest = filtered.filter((p) => p.slug !== featured?.slug || search !== "" || activeCategory !== "All");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Sake Blog — Guides, Tips, and Reviews"
        description="Expert sake guides, tasting tips, food pairing advice, and app reviews. Learn everything about sake from the SakeScan team."
        path="/blog"
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <Breadcrumbs items={[{ label: "Blog" }]} />

          <div className="mt-6 mb-10">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold mb-3">
              The Sake Blog
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Expert guides, tasting tips, and everything you need to navigate the world of sake with confidence.
            </p>
          </div>

          {featured && search === "" && activeCategory === "All" ? (
            <div className="mb-12">
              <BlogCard post={featured} featured />
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search articles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={activeCategory === "All" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setActiveCategory("All")}
              >
                All
              </Badge>
              {BLOG_CATEGORIES.map((cat) => (
                <Badge
                  key={cat}
                  variant={activeCategory === cat ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </div>

          {rest.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No articles found matching your search.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
