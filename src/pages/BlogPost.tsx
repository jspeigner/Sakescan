import { useParams, Link } from "react-router-dom";
import { Suspense, useMemo } from "react";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/SEO";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { TableOfContents, type TocItem } from "@/components/blog/TableOfContents";
import { BlogCTA } from "@/components/blog/BlogCTA";
import { RelatedArticles } from "@/components/blog/RelatedArticles";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, User, ArrowLeft, Loader2 } from "lucide-react";
import { getPostBySlug, getRelatedPosts, isPublished } from "@/lib/blog-data";
import { blogContent } from "@/content/blog";
import NotFound from "./NotFound";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;
  const Content = slug ? blogContent[slug] : undefined;
  const related = post ? getRelatedPosts(post) : [];

  const tocItems = useMemo<TocItem[]>(() => {
    if (!slug) return [];
    const el = document.getElementById("blog-content");
    if (!el) return [];
    const headings = el.querySelectorAll("h2, h3");
    return Array.from(headings).map((h) => ({
      id: h.id,
      text: h.textContent ?? "",
      level: h.tagName === "H2" ? 2 : 3,
    }));
  }, [slug]);

  if (!post || !Content || !isPublished(post)) return <NotFound />;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    image: post.coverImage,
    author: { "@type": "Organization", name: "SakeScan" },
    publisher: {
      "@type": "Organization",
      name: "SakeScan",
      logo: { "@type": "ImageObject", url: "https://www.sakescan.com/favicon.svg" },
    },
    datePublished: post.publishDate,
    dateModified: post.modifiedDate ?? post.publishDate,
    mainEntityOfPage: `https://www.sakescan.com/blog/${post.slug}`,
  };

  const breadcrumbItems = [
    { label: "Blog", href: "/blog" },
    ...(post.pillarSlug
      ? [{ label: getPostBySlug(post.pillarSlug)?.title ?? "", href: `/blog/${post.pillarSlug}` }]
      : []),
    { label: post.title },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={post.title}
        description={post.description}
        path={`/blog/${post.slug}`}
        image={post.coverImage}
        type="article"
        publishedTime={post.publishDate}
        modifiedTime={post.modifiedDate}
        author="SakeScan Team"
        schema={articleSchema}
      />
      <Header />
      <main className="pt-24 pb-16">
        <article className="max-w-6xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbItems} />

          <div className="mt-6 mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Badge variant="secondary">{post.category}</Badge>
              {post.isPillar ? (
                <Badge className="bg-primary text-primary-foreground">Complete Guide</Badge>
              ) : null}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold mb-4 max-w-3xl">
              {post.title}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mb-6">
              {post.description}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {post.author}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(post.publishDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {post.readingTime} min read
              </span>
            </div>
          </div>

          <div className="relative aspect-[2/1] rounded-xl overflow-hidden mb-10 max-w-4xl">
            <img
              src={post.coverImage}
              alt={post.coverImageAlt}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex gap-10">
            <div
              id="blog-content"
              className="flex-1 min-w-0 prose prose-gray dark:prose-invert max-w-3xl prose-headings:font-serif prose-headings:scroll-mt-24 prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
            >
              <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <Content />
              </Suspense>
              <BlogCTA variant="banner" />
            </div>

            <aside className="hidden lg:block w-64 flex-shrink-0">
              <div className="sticky top-28 space-y-8">
                <TableOfContents items={tocItems} />
                <RelatedArticles posts={related} />
              </div>
            </aside>
          </div>

          <div className="mt-12 pt-8 border-t">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
