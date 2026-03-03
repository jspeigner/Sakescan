import { Link } from "react-router-dom";
import { BlogCard } from "@/components/blog/BlogCard";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { getPillarPosts } from "@/lib/blog-data";

export function BlogShowcase() {
  const pillars = getPillarPosts().slice(0, 3);

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold mb-3">
              Learn About Sake
            </h2>
            <p className="text-muted-foreground max-w-lg">
              Expert guides to help you navigate the world of sake, from beginner basics to advanced types and food pairings.
            </p>
          </div>
          <Button variant="outline" className="hidden sm:flex gap-2" asChild>
            <Link to="/blog">
              View All Articles <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Button variant="outline" className="gap-2" asChild>
            <Link to="/blog">
              View All Articles <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
