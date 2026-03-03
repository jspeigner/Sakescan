import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight } from "lucide-react";
import type { BlogPost } from "@/lib/blog-data";

interface BlogCardProps {
  post: BlogPost;
  featured?: boolean;
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  return (
    <Link to={`/blog/${post.slug}`} className="group block">
      <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${featured ? "md:flex" : ""}`}>
        <div className={`relative overflow-hidden ${featured ? "md:w-1/2" : "aspect-[16/9]"}`}>
          <img
            src={post.coverImage}
            alt={post.coverImageAlt}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${featured ? "aspect-[16/9] md:aspect-auto md:h-full" : ""}`}
            loading="lazy"
          />
          {post.isPillar ? (
            <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground">
              Complete Guide
            </Badge>
          ) : null}
        </div>
        <div className={`p-5 ${featured ? "md:w-1/2 md:p-8 md:flex md:flex-col md:justify-center" : ""}`}>
          <div className="flex items-center gap-3 mb-3">
            <Badge variant="secondary" className="text-xs">
              {post.category}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {post.readingTime} min read
            </span>
          </div>
          <h3 className={`font-serif font-bold mb-2 group-hover:text-primary transition-colors ${featured ? "text-xl md:text-2xl" : "text-lg"}`}>
            {post.title}
          </h3>
          <p className={`text-muted-foreground mb-4 ${featured ? "text-sm md:text-base" : "text-sm line-clamp-2"}`}>
            {post.description}
          </p>
          <div className="flex items-center gap-1 text-sm font-medium text-primary">
            Read Article
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
