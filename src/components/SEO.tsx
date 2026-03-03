import { Helmet } from "react-helmet-async";

const SITE_URL = "https://www.sakescan.com";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;
const SITE_NAME = "SakeScan";

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  noindex?: boolean;
  schema?: Record<string, unknown> | Record<string, unknown>[];
}

export function SEO({
  title,
  description = "Discover, learn, and rate sake with SakeScan. Scan any sake label to get instant information, tasting notes, food pairings, and personalized recommendations.",
  path = "",
  image = DEFAULT_IMAGE,
  type = "website",
  publishedTime,
  modifiedTime,
  author,
  noindex = false,
  schema,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - Your Personal Sake Sommelier`;
  const canonicalUrl = `${SITE_URL}${path}`;
  const absoluteImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SakeScan",
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    sameAs: ["https://twitter.com/sakescan"],
    description: "AI-powered sake discovery app. Scan any sake label to get instant ratings, tasting notes, food pairings, and personalized recommendations.",
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SakeScan",
    operatingSystem: "iOS",
    applicationCategory: "LifestyleApplication",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "25000",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: "Your personal AI sake sommelier. Scan any sake label to get instant information, tasting notes, food pairings, and personalized recommendations.",
  };

  const breadcrumbItems = path
    .split("/")
    .filter(Boolean)
    .map((segment, index, arr) => ({
      "@type": "ListItem",
      position: index + 2,
      name: segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      item: `${SITE_URL}/${arr.slice(0, index + 1).join("/")}`,
    }));

  const breadcrumbSchema =
    breadcrumbItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            ...breadcrumbItems,
          ],
        }
      : null;

  const allSchemas: Record<string, unknown>[] = [];
  if (path === "" || path === "/") {
    allSchemas.push(organizationSchema, softwareAppSchema);
  }
  if (breadcrumbSchema) {
    allSchemas.push(breadcrumbSchema);
  }
  if (schema) {
    if (Array.isArray(schema)) {
      allSchemas.push(...schema);
    } else {
      allSchemas.push(schema);
    }
  }

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:site_name" content={SITE_NAME} />
      {publishedTime ? <meta property="article:published_time" content={publishedTime} /> : null}
      {modifiedTime ? <meta property="article:modified_time" content={modifiedTime} /> : null}
      {author ? <meta property="article:author" content={author} /> : null}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@sakescan" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      {allSchemas.map((s, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(s)}
        </script>
      ))}
    </Helmet>
  );
}

export { SITE_URL, SITE_NAME };
