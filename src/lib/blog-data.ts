export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  publishDate: string;
  modifiedDate?: string;
  author: string;
  category: BlogCategory;
  isPillar: boolean;
  pillarSlug?: string;
  clusterSlugs?: string[];
  readingTime: number;
  coverImage: string;
  coverImageAlt: string;
}

export type BlogCategory =
  | "Beginners"
  | "Sake Types"
  | "Apps & Technology"
  | "Food & Pairing"
  | "Culture & History"
  | "Buying Guide";

export const BLOG_CATEGORIES: BlogCategory[] = [
  "Beginners",
  "Sake Types",
  "Apps & Technology",
  "Food & Pairing",
  "Culture & History",
  "Buying Guide",
];

export const blogPosts: BlogPost[] = [
  // --- Cluster 1: Sake for Beginners ---
  {
    slug: "sake-for-beginners",
    title: "The Ultimate Guide to Sake for Beginners",
    description:
      "Everything you need to know about sake, from types and tasting notes to food pairings and etiquette. Start your sake journey with this comprehensive beginner's guide.",
    keywords: ["sake for beginners", "what is sake", "sake guide", "how to drink sake", "sake 101"],
    publishDate: "2026-03-03",
    author: "SakeScan Team",
    category: "Beginners",
    isPillar: true,
    clusterSlugs: ["how-is-sake-made", "history-of-sake", "sake-etiquette"],
    readingTime: 18,
    coverImage: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=1200&q=80",
    coverImageAlt: "Traditional Japanese sake serving set with ceramic cups and a tokkuri flask",
  },
  {
    slug: "how-is-sake-made",
    title: "How Is Sake Made? A Step-by-Step Guide",
    description:
      "Discover the fascinating sake brewing process, from rice polishing to fermentation. Learn about koji mold, multiple parallel fermentation, and what makes each sake unique.",
    keywords: ["how is sake made", "sake brewing process", "sake production", "koji mold", "sake fermentation"],
    publishDate: "2026-03-10",
    author: "SakeScan Team",
    category: "Beginners",
    isPillar: false,
    pillarSlug: "sake-for-beginners",
    readingTime: 10,
    coverImage: "https://images.unsplash.com/photo-1524947745785-2e2b6158469b?w=1200&q=80",
    coverImageAlt: "Sake brewery production facility with traditional wooden barrels",
  },
  {
    slug: "history-of-sake",
    title: "The History of Sake: From Ancient Japan to Today",
    description:
      "Trace sake's journey from 3rd-century rice wine to today's craft brewing renaissance. Explore how Japanese culture, technology, and tradition shaped the world's most unique beverage.",
    keywords: ["history of sake", "sake origins", "Japanese sake history", "sake culture", "sake tradition"],
    publishDate: "2026-03-17",
    author: "SakeScan Team",
    category: "Culture & History",
    isPillar: false,
    pillarSlug: "sake-for-beginners",
    readingTime: 9,
    coverImage: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&q=80",
    coverImageAlt: "Traditional Japanese temple with cherry blossoms representing sake's cultural heritage",
  },
  {
    slug: "sake-etiquette",
    title: "Sake Etiquette: How to Drink Sake Properly",
    description:
      "Master the art of drinking sake like a local. Learn proper pouring customs, temperature etiquette, the right glassware, and social traditions from Japan's sake culture.",
    keywords: ["sake etiquette", "how to drink sake", "sake customs", "Japanese drinking culture", "sake pouring"],
    publishDate: "2026-03-24",
    author: "SakeScan Team",
    category: "Culture & History",
    isPillar: false,
    pillarSlug: "sake-for-beginners",
    readingTime: 8,
    coverImage: "https://images.unsplash.com/photo-1515488764276-beab7607c1e6?w=1200&q=80",
    coverImageAlt: "Person pouring sake into a small ochoko cup following traditional etiquette",
  },

  // --- Cluster 2: Sake Types ---
  {
    slug: "types-of-sake",
    title: "Sake Types Explained: Junmai, Ginjo, Daiginjo and More",
    description:
      "Understand the 6 main types of sake, from everyday Junmai to premium Daiginjo. Learn how rice polishing ratios, brewing methods, and added alcohol create distinct flavor profiles.",
    keywords: ["types of sake", "sake types", "junmai sake", "ginjo sake", "daiginjo sake", "sake classifications"],
    publishDate: "2026-03-31",
    author: "SakeScan Team",
    category: "Sake Types",
    isPillar: true,
    clusterSlugs: ["what-is-junmai-sake", "what-is-daiginjo-sake", "honjozo-vs-junmai"],
    readingTime: 16,
    coverImage: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=1200&q=80",
    coverImageAlt: "Collection of different sake bottles showing various types and grades",
  },
  {
    slug: "what-is-junmai-sake",
    title: "What Is Junmai Sake? Everything You Need to Know",
    description:
      "Junmai is pure rice sake with no added alcohol. Learn what defines Junmai, how it differs from other types, its flavor profile, ideal serving temperatures, and top brands to try.",
    keywords: ["junmai sake", "what is junmai", "pure rice sake", "junmai vs ginjo", "junmai tasting notes"],
    publishDate: "2026-04-07",
    author: "SakeScan Team",
    category: "Sake Types",
    isPillar: false,
    pillarSlug: "types-of-sake",
    readingTime: 8,
    coverImage: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=1200&q=80",
    coverImageAlt: "A glass of junmai sake being poured with rice grains in the background",
  },
  {
    slug: "what-is-daiginjo-sake",
    title: "What Is Daiginjo Sake? The Ultimate Premium Sake",
    description:
      "Daiginjo represents the pinnacle of sake brewing. Discover why this ultra-premium sake requires 50%+ rice polishing, its delicate flavor profile, and the best Daiginjo brands.",
    keywords: ["daiginjo sake", "what is daiginjo", "premium sake", "sake rice polishing", "best daiginjo"],
    publishDate: "2026-04-14",
    author: "SakeScan Team",
    category: "Sake Types",
    isPillar: false,
    pillarSlug: "types-of-sake",
    readingTime: 8,
    coverImage: "https://images.unsplash.com/photo-1524947745785-2e2b6158469b?w=1200&q=80",
    coverImageAlt: "Premium daiginjo sake bottle with elegant packaging",
  },
  {
    slug: "honjozo-vs-junmai",
    title: "Honjozo vs Junmai: What's the Difference?",
    description:
      "Compare Honjozo and Junmai sake side by side. Understand how added brewer's alcohol changes flavor, texture, and aroma, and learn which style suits your palate.",
    keywords: ["honjozo vs junmai", "honjozo sake", "sake comparison", "added alcohol sake", "sake differences"],
    publishDate: "2026-04-21",
    author: "SakeScan Team",
    category: "Sake Types",
    isPillar: false,
    pillarSlug: "types-of-sake",
    readingTime: 7,
    coverImage: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=1200&q=80",
    coverImageAlt: "Two sake glasses side by side comparing honjozo and junmai styles",
  },

  // --- Cluster 3: Best Sake Apps ---
  {
    slug: "best-sake-apps-2026",
    title: "The Best Sake Apps for 2026: A Complete Review",
    description:
      "Compare the top sake apps of 2026, including SakeScan, Sakenomy, and more. Find the best app for scanning labels, tracking tastings, and discovering new favorites.",
    keywords: ["best sake apps", "sake app review", "sake scanner app", "sake rating app", "sake recommendation app"],
    publishDate: "2026-04-28",
    author: "SakeScan Team",
    category: "Apps & Technology",
    isPillar: true,
    clusterSlugs: ["sakescan-vs-vivino", "sake-scanner-app-guide", "sakescan-review"],
    readingTime: 14,
    coverImage: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&q=80",
    coverImageAlt: "Smartphone displaying a sake scanning app next to sake bottles",
  },
  {
    slug: "sakescan-vs-vivino",
    title: "SakeScan vs Vivino: Which Drink Scanner Is Better?",
    description:
      "A detailed comparison of SakeScan and Vivino. While Vivino dominates wine, SakeScan is built specifically for sake — with AI label reading, Japanese database, and sake-specific pairings.",
    keywords: ["sakescan vs vivino", "sake app comparison", "vivino for sake", "drink scanner app", "wine app vs sake app"],
    publishDate: "2026-05-05",
    author: "SakeScan Team",
    category: "Apps & Technology",
    isPillar: false,
    pillarSlug: "best-sake-apps-2026",
    readingTime: 9,
    coverImage: "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&q=80",
    coverImageAlt: "Two smartphones showing different drink scanning apps side by side",
  },
  {
    slug: "sake-scanner-app-guide",
    title: "How a Sake Scanner App Can Transform Your Dining Experience",
    description:
      "Never order blindly from a sake menu again. Learn how sake scanner apps use AI and image recognition to instantly identify any sake and give you ratings, tasting notes, and pairings.",
    keywords: ["sake scanner app", "sake label scanner", "AI sake identification", "scan sake label", "sake menu app"],
    publishDate: "2026-05-12",
    author: "SakeScan Team",
    category: "Apps & Technology",
    isPillar: false,
    pillarSlug: "best-sake-apps-2026",
    readingTime: 7,
    coverImage: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80",
    coverImageAlt: "Person scanning a sake label with their smartphone at a restaurant",
  },
  {
    slug: "sakescan-review",
    title: "SakeScan App Review: Your AI Sake Sommelier",
    description:
      "An in-depth review of SakeScan, the AI-powered sake identification app. With 50,000+ sakes in its database and a 4.9-star rating, here's everything it can do.",
    keywords: ["sakescan review", "sakescan app", "sake app review", "AI sake sommelier", "sakescan features"],
    publishDate: "2026-05-19",
    author: "SakeScan Team",
    category: "Apps & Technology",
    isPillar: false,
    pillarSlug: "best-sake-apps-2026",
    readingTime: 8,
    coverImage: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&q=80",
    coverImageAlt: "SakeScan app interface showing sake identification results",
  },
];

export function isPublished(post: BlogPost): boolean {
  return new Date(post.publishDate) <= new Date();
}

export function getPublishedPosts(): BlogPost[] {
  return blogPosts.filter(isPublished);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getRelatedPosts(post: BlogPost): BlogPost[] {
  const related: BlogPost[] = [];

  if (post.pillarSlug) {
    const pillar = getPostBySlug(post.pillarSlug);
    if (pillar) related.push(pillar);
  }

  if (post.clusterSlugs) {
    for (const slug of post.clusterSlugs) {
      const cluster = getPostBySlug(slug);
      if (cluster) related.push(cluster);
    }
  }

  if (post.pillarSlug) {
    const pillar = getPostBySlug(post.pillarSlug);
    if (pillar?.clusterSlugs) {
      for (const slug of pillar.clusterSlugs) {
        if (slug !== post.slug) {
          const sibling = getPostBySlug(slug);
          if (sibling && !related.find((r) => r.slug === sibling.slug)) {
            related.push(sibling);
          }
        }
      }
    }
  }

  return related.slice(0, 4);
}

export function getPostsByCategory(category: BlogCategory): BlogPost[] {
  return getPublishedPosts().filter((p) => p.category === category);
}

export function getPillarPosts(): BlogPost[] {
  return getPublishedPosts().filter((p) => p.isPillar);
}
