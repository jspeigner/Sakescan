import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchSakeImageCandidates } from './cron/lib/sakeImageDiscovery.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, nameJapanese, brewery } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

  if (!firecrawlApiKey) {
    return res.status(500).json({ error: 'Firecrawl API key not configured' });
  }

  try {
    const { images, sakeData } = await searchSakeImageCandidates(
      firecrawlApiKey,
      { name, nameJapanese: nameJapanese ?? null, brewery: brewery ?? null },
      'full'
    );

    return res.status(200).json({
      images,
      sakeData: sakeData
        ? {
            name,
            nameJapanese,
            brewery,
            type: sakeData.type,
            prefecture: sakeData.prefecture,
            polishingRatio: sakeData.polishingRatio,
            alcoholPercentage: sakeData.alcoholPercentage,
          }
        : undefined,
    });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed', details: String(error) });
  }
}
