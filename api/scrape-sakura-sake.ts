import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeSakuraListing } from './cron/lib/scrapeSakuraCore.js';

interface ScrapeResult {
  sakes: Awaited<ReturnType<typeof scrapeSakuraListing>>['sakes'];
  totalFound: number;
  page: number;
  hasMore: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { page = 1, category, prefecture } = req.body;

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

  if (!firecrawlApiKey) {
    return res.status(500).json({ error: 'Firecrawl API key not configured' });
  }

  try {
    const { sakes } = await scrapeSakuraListing(firecrawlApiKey, { category, prefecture });

    const result: ScrapeResult = {
      sakes,
      totalFound: sakes.length,
      page: page,
      hasMore: false,
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error('Scrape error:', error);
    return res.status(500).json({ error: 'Scrape failed', details: String(error) });
  }
}
