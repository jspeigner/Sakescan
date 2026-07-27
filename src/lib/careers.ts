export type CareerJob = {
  slug: string;
  title: string;
  department: string;
  location: string;
  type: string;
  /** Shown publicly — no salary figures; applicants state expectation on apply. */
  payNote: string;
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
    payNote:
      "Invoiced in USD, paid in your preferred cryptocurrency or stablecoin. Include your expected monthly rate when you apply.",
    timeZone: "Minimum 4 hours overlap with US Eastern Time",
    summary:
      "Build SakeScan's audience with short-form video and community — content that turns curious diners into app subscribers.",
    aboutCompany:
      "SakeScan (sakescan.com) is a sake discovery and knowledge app that turns curious diners into the person at the table who knows sake. Sake content is a wide-open lane: gorgeous bottles, restaurant moments, \"order this not that\" hooks, and a subject most of the audience knows nothing about yet.",
    aboutRole:
      "You'll be the voice of SakeScan across social media, building an audience of food-and-drink enthusiasts that converts into app subscribers. This is a build-in-public, audience-first role — for a product at this stage, your content IS the marketing engine. You'll create short-form video, posts, and blog content; manage our community; and make sake feel accessible, aspirational, and a little bit fun. You work inside a 3-person pod with a developer and marketing lead.",
    responsibilities: [
      "Own the content calendar across TikTok, Instagram Reels, and YouTube Shorts — 5+ pieces per week",
      "Produce short-form video natively: bottle features, ordering guides, myth-busting, restaurant scenarios, app demos",
      "Write longer-form content: sake education articles and SEO posts from the Marketing Lead's briefs, email content, app store copy",
      "Manage community: comments, DMs, food and sake subreddits and groups; surface feedback to the pod weekly",
      "Partner with restaurants, sommeliers, sake brands, and food creators on collaborations",
      "Report weekly: follower growth, engagement, link clicks, content-attributed downloads",
    ],
    requirements: [
      "2+ years creating content for a brand or as a creator, with an account you grew yourself — show us the numbers",
      "Genuine short-form video skill: idea to published video in a day, solo",
      "Native-level English writing, from punchy captions to 1,500-word articles",
      "A real interest in food and drink — sake knowledge is a plus, sake curiosity is a must",
      "Community instincts: belonging, not broadcasting",
    ],
    howToApply:
      "Send links to accounts or content you've grown, plus one TikTok concept (hook + beats, 3 sentences max) that would make someone download a sake app.",
  },
  {
    slug: "marketing-lead",
    title: "Marketing Lead",
    department: "Growth & Revenue Owner",
    location: "Remote (LATAM or Central/Eastern Europe)",
    type: "Full-time independent contractor (3-month initial engagement, converting to long-term)",
    payNote:
      "Invoiced in USD, paid in your preferred cryptocurrency or stablecoin. Include your expected monthly rate when you apply.",
    timeZone: "Minimum 4 hours overlap with US Eastern Time",
    summary:
      "Own SakeScan growth — downloads, free-to-paid conversion, and subscription revenue — in a small product pod.",
    aboutCompany:
      "SakeScan (sakescan.com) is a sake discovery and knowledge app. The product's real promise is identity transformation: you become the person at the table who knows sake. The business runs on subscriptions with a premium tier above.",
    aboutRole:
      "You'll own SakeScan's growth number — downloads, free-to-paid conversion, and subscription revenue. This is early-stage growth work: finding the channels where food-and-drink enthusiasts, sake-curious diners, and Japan travelers actually live, and building a funnel that converts curiosity into subscription. You work in a 3-person pod with the product's developer and content creator, so your experiments ship the same week.",
    responsibilities: [
      "Own north-star metrics: downloads, activation (first successful scan), free→paid conversion, MRR",
      "Find and prove acquisition channels: paid social, App Store optimization, food/travel content partnerships, restaurant and izakaya tie-ins",
      "Own the offer and funnel: paywall tests, pricing ladder experiments, onboarding flows, lifecycle email",
      "Own SEO and AI-search visibility: sake education keywords, \"what sake should I order\" intent queries, briefs for the content creator",
      "Build partnerships: sake breweries, importers, Japanese restaurants, food influencers, travel-to-Japan communities",
      "Report weekly: spend, CAC, downloads, conversion, MRR",
    ],
    requirements: [
      "4+ years in growth/performance marketing with direct ownership of a growth or revenue number — show us the before/after",
      "Consumer subscription app experience strongly preferred: you understand paywalls, trials, and conversion mechanics",
      "Hands-on paid social and ASO experience",
      "Working fluency with AI tools for copy, creative testing, and analysis",
      "Excellent written and spoken English (C1+)",
    ],
    niceToHave: [
      "Food & beverage, travel, or lifestyle vertical experience",
      "Experience marketing identity/status-driven products",
    ],
    howToApply:
      'Send a short note, one growth result with numbers, and a 2–3 sentence answer to: "What\'s the first acquisition channel you\'d test for SakeScan, and why that one?"',
  },
  {
    slug: "product-developer",
    title: "Product Developer",
    department: "Full-Stack / Mobile · AI-Augmented",
    location: "Remote (LATAM or Central/Eastern Europe)",
    type: "Full-time independent contractor (3-month initial engagement, converting to long-term)",
    payNote:
      "Invoiced in USD, paid in your preferred cryptocurrency or stablecoin. Mid-level and senior rates welcome — include your expected monthly rate when you apply.",
    timeZone: "Minimum 4 hours overlap with US Eastern Time",
    summary:
      "Sole engineer on a 3-person pod — own scanning, knowledge base, and the mobile experience end to end.",
    aboutCompany:
      "SakeScan (sakescan.com) is a sake discovery and knowledge app: scan a bottle or menu, instantly understand what you're looking at, and become the person at the table who knows sake. The flagship experience is Impress Mode — real-time guidance in restaurant moments.",
    aboutRole:
      "You'll be the sole engineer on a 3-person product pod owning SakeScan end to end. The core technical challenges are delightful: label/menu scanning and recognition, a rich sake knowledge base, and a mobile experience fast enough to use mid-conversation at a restaurant table. You'll ship weekly and work daily with a marketing lead and content creator. We build AI-first: Claude, Lovable, and Cursor are force multipliers, and we expect genuine fluency in AI-assisted development — including using LLMs and vision models inside the product itself.",
    responsibilities: [
      "Own the full stack: React/Next.js, Supabase (Postgres, RLS, edge functions), Stripe subscriptions",
      "Build and refine the scanning experience: image capture, recognition pipeline (vision APIs/LLMs), and fast results UX",
      "Own the subscription funnel mechanics: free-tier limits, paywall placement, and plan experiments",
      "Ship production features weekly using AI coding tools",
      "Build conversion experiments and analytics instrumentation with the Marketing Lead",
      "Maintain quality on AI-generated code: review, refactor, test",
    ],
    requirements: [
      "3+ years shipping production web or mobile applications, with at least one product you owned largely solo",
      "Strong React/Next.js and Postgres; Supabase and Stripe subscription experience preferred",
      "Experience integrating vision APIs or LLMs into product features",
      "A demonstrated AI-assisted development workflow — show us real work",
      "Excellent written and spoken English (C1+)",
    ],
    niceToHave: [
      "Mobile (React Native or native) and App Store release experience",
      "OCR / image recognition pipeline experience",
      "Interest in food, drink, or Japanese culture",
    ],
    howToApply:
      'Send a short note, links to products you\'ve shipped, and a 2–3 sentence answer to: "You have one week to make bottle scanning feel twice as fast — what do you try first?"',
  },
];

export function getCareerJob(slug: string): CareerJob | undefined {
  return CAREER_JOBS.find((job) => job.slug === slug);
}
