import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { isPublished, type BlogPost } from "@/lib/blog-data";
import { Badge } from "@/components/ui/badge";

interface RelatedArticlesProps {
  posts: BlogPost[];
  title?: string;
}

export function RelatedArticles({ posts, title = "Related Articles" }: RelatedArticlesProps) {
  const visible = posts.filter(isPublished);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BookOpen className="w-4 h-4" />
        {title}
      </div>
      {visible.map((post) => (
        <Link
          key={post.slug}
          to={`/blog/${post.slug}`}
          className="group block p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
        >
          <div className="flex items-center gap-2 mb-1">
            {post.isPillar ? (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Guide</Badge>
            ) : null}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{post.category}</span>
          </div>
          <h4 className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
            {post.title}
          </h4>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            Read <ArrowRight className="w-3 h-3" />
          </div>
        </Link>
      ))}
    </div>
  );
}
