export type CareerJob = {
  slug: string;
  title: string;
  department: string;
  location: string;
  type: string;
  compensation: string;
  timeZone: string;
  summary: string;
  aboutCompany: string;
  aboutRole: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave?: string[];
  howToApply: string;
};

export const CAREER_JOBS: CareerJob[] = [
  {
    slug: "content-creator",
    title: "Content Creator & Community Manager",
    department: "Social, Video & Community",
    location: "Remote (LATAM or Central/Eastern Europe)",
    type: "Full-time independent contractor (3-month initial engagement, converting to long-term)",
    compensation:
      "$1,500–$1,800/month USD — invoiced in USD, paid in your preferred cryptocurrency or stablecoin",
    timeZone: "Minimum 4 hours overlap with US Eastern Time",
    summary:
      "Be the voice of SakeScan across social — short-form video, community, and content that turns curious drinkers into users.",
    aboutCompany:
      "SakeScan (sakescan.com) is a sake discovery and label-scanning platform that helps people identify bottles, explore breweries, and find their next favorite sake. The content opportunity is huge: bottle reveals, tasting moments, brewery stories, and scan-to-discover journeys.",
    aboutRole:
      "You'll be the voice of SakeScan across social media, building an audience of sake curious drinkers and enthusiasts that converts into users. You'll create short-form video, posts, and blog content; manage our communities; and be in the replies daily. You work inside a small pod with a developer and marketing lead, so your content ties directly to growth goals — followers matter, but followers-who-become-users matter more.",
    responsibilities: [
      "Own the content calendar across TikTok, Instagram Reels, YouTube Shorts, and X — plan, create, and publish 5+ pieces per week",
      "Produce short-form video natively: editing (CapCut/Premiere/AI-assisted tools), hooks, trend adaptation for the sake / drinks niche",
      "Write longer-form content: blog posts and SEO articles from the Marketing Lead's briefs, email content, app store copy",
      "Manage community: comments, DMs, sake forums and groups; surface user feedback to the pod weekly",
      "Partner with real users and sake educators on UGC, testimonials, and creator collaborations",
      "Report weekly: follower growth, engagement rate, link clicks, content-attributed signups",
    ],
    requirements: [
      "2+ years creating content for a brand or as a creator, with an account you grew yourself — show us the numbers",
      "Genuine short-form video skill: idea to published TikTok in a day, solo",
      "Native-level English writing across registers, from meme-speed captions to 1,500-word blog posts",
      "Community instincts: you know the difference between broadcasting and belonging",
      "Big plus: you love sake, Japanese food culture, or the drinks / hospitality world",
    ],
    howToApply:
      "Send links to accounts or content you've grown, plus one TikTok concept (hook + beats, 3 sentences max) you'd make for SakeScan this week. Attach your resume.",
  },
  {
    slug: "marketing-lead",
    title: "Marketing Lead",
    department: "Growth & Revenue",
    location: "Remote (LATAM or Central/Eastern Europe)",
    type: "Full-time independent contractor (3-month initial engagement, converting to long-term)",
    compensation:
      "$2,200–$2,500/month USD — invoiced in USD, paid in your preferred cryptocurrency or stablecoin",
    timeZone: "Minimum 4 hours overlap with US Eastern Time",
    summary:
      "Own SakeScan growth end to end — paid, organic, SEO, partnerships, and lifecycle — and hit signup and activation targets.",
    aboutCompany:
      "SakeScan (sakescan.com) helps people scan sake labels, explore a deep catalog, and discover bottles and breweries. Two audiences: curious drinkers discovering sake, and enthusiasts who want richer product knowledge.",
    aboutRole:
      "You'll own the growth number for SakeScan — not “support marketing,” own it. You'll set and hit targets for signups, activation (first meaningful scan / save), and revenue, running paid, organic, SEO, partnerships, and lifecycle marketing yourself. You work in a small pod with the product's developer and content creator, so your experiments ship: when you find a message-market mismatch between ads and the landing page, the fix goes live that week.",
    responsibilities: [
      "Own north-star metrics: monthly active users, activation rate, paid conversion, and revenue against founder-set targets",
      "Run paid acquisition (Meta, Google, TikTok) end to end: creative briefs, audiences, budget, weekly optimization",
      "Own SEO and AI-search visibility: keyword targeting, content briefs for the content creator, technical SEO with the developer",
      "Build the funnel: landing pages, onboarding, email/lifecycle campaigns, offer and pricing tests",
      "Develop partnerships — retailers, sake bars, educators, importers, and community groups",
      "Report weekly on a simple scorecard: spend, CAC, signups, activation, revenue",
    ],
    requirements: [
      "4+ years in growth/performance marketing with direct ownership of a revenue or user-growth number — show us the before/after",
      "Hands-on paid social and Google Ads (you run the accounts, not an agency)",
      "Strong analytics: GA4/PostHog-style tools, cohort thinking, unit economics",
      "Working fluency with AI tools for copy iteration, creative testing, and analysis",
      "Excellent written and spoken English (C1+)",
      "Scrappy operator mindset: 10 cheap experiments over one big campaign",
    ],
    niceToHave: [
      "Marketplace, consumer app, or drinks/hospitality marketing experience",
      "Experience marketing to food & beverage or local-venue audiences",
    ],
    howToApply:
      'Send a short note, one growth result you\'re proud of (with numbers), and a 2–3 sentence answer to: "Open sakescan.com — who is the ad you\'d run first aimed at, and what does it say?" Attach your resume.',
  },
  {
    slug: "product-developer",
    title: "Product Developer",
    department: "Full-Stack · AI-Augmented",
    location: "Remote (LATAM or Central/Eastern Europe)",
    type: "Full-time independent contractor (3-month initial engagement, converting to long-term)",
    compensation:
      "$3,000–$3,500/month USD (senior) · $1,800–$2,500 (mid-level) — invoiced in USD, paid in your preferred cryptocurrency or stablecoin",
    timeZone: "Minimum 4 hours overlap with US Eastern Time",
    summary:
      "Sole engineer on a small product pod — ship SakeScan features weekly with AI-assisted full-stack ownership.",
    aboutCompany:
      "SakeScan (sakescan.com) is a sake discovery product with label scanning, a large catalog, brewery pages, and a growing content footprint. We're a small, founder-led company shipping fast.",
    aboutRole:
      "You'll be the sole engineer on a small product pod — you, a marketing lead, and a content creator — owning a live consumer product end to end. This is not a big-company role where you own one microservice. You'll ship features, fix production issues, manage the database, and turn user feedback and growth experiments into shipped code, weekly. We build AI-first: Claude and Cursor are force multipliers here, and we expect genuine fluency in AI-assisted development.",
    responsibilities: [
      "Own the full stack: React (Vite) frontend, Supabase (Postgres, RLS, storage), and Vercel serverless APIs",
      "Ship production features weekly, from spec to deploy, using AI coding tools to move at 2–3x traditional pace",
      "Own catalog & image pipelines, auth-adjacent flows, and data integrity across sake/brewery content",
      "Maintain quality on AI-generated code: review, refactor, test, keep the codebase comprehensible",
      "Build conversion experiments, landing pages, and analytics instrumentation with the Marketing Lead",
      "Support the Content Creator with product assets, demo environments, and feature launches",
      "Manage technical debt deliberately and communicate tradeoffs clearly in writing",
    ],
    requirements: [
      "3+ years shipping production web applications, with at least one product you owned largely solo",
      "Strong React and Postgres; Supabase experience strongly preferred",
      "A demonstrated AI-assisted development workflow — show us how you use Claude, Cursor, Copilot, or similar in real work",
      "Excellent written and spoken English (C1+)",
      "Comfort with ownership: no PM writing tickets, no QA team catching bugs",
    ],
    niceToHave: [
      "Image pipelines, OCR/vision, or search ranking experience",
      "Mobile API / React Native collaboration experience",
      "You drink sake, visit Japanese restaurants, or care about food & beverage products",
    ],
    howToApply:
      'Send a short note, links to products you\'ve shipped, and a 2–3 sentence answer to: "Open sakescan.com — what are the first three things you\'d change and why?" Attach your resume.',
  },
];

export function getCareerJob(slug: string): CareerJob | undefined {
  return CAREER_JOBS.find((job) => job.slug === slug);
}
