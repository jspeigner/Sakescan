import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ScrapedSake {
  name: string;
  nameJapanese?: string;
  brewery?: string;
  type?: string;
  prefecture?: string;
  imageUrl?: string;
  taste?: string;
  foodPairing?: string[];
}

interface ScrapeResult {
  sakes: ScrapedSake[];
  totalFound: number;
  page: number;
  hasMore: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { page = 1, category, prefecture } = req.body;

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  
  if (!firecrawlApiKey) {
    return res.status(500).json({ error: 'Firecrawl API key not configured' });
  }

  try {
    // Build URL with optional filters
    let url = 'https://export.sakurasaketen.com/sake';
    const params = new URLSearchParams();
    
    if (category) {
      params.append('Select by Sake Category', category);
    }
    if (prefecture) {
      params.append('Select by Prefecture', prefecture);
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    console.log('Scraping URL:', url);

    // Scrape the sake listing page
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000, // Wait for dynamic content to load
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl error:', errorText);
      return res.status(500).json({ error: 'Failed to scrape page', details: errorText });
    }

    const data = await response.json();
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';

    // Parse sake items from the HTML
    const sakes: ScrapedSake[] = [];

    // The site structure shows sake cards with Japanese name, English name, brewery, and prefecture
    // Pattern: Japanese name followed by English name, brewery, and prefecture
    
    // Try to extract from markdown which is cleaner
    // Format seems to be: JapaneseName\nEnglishName\nBrewery\-Prefecture
    const sakeBlocks = markdown.split(/(?=Modern-|Classic-)/g);
    
    for (const block of sakeBlocks) {
      // Skip if too short
      if (block.length < 20) continue;
      
      // Extract sake type/category
      const matrixMatch = block.match(/(Modern|Classic)-(Light|Medium|Full|Rich)/i);
      
      // Look for sake names - English names are typically in ALL CAPS or Title Case
      const lines = block.split('\n').filter((line: string) => line.trim());
      
      let englishName = '';
      let japaneseName = '';
      let brewery = '';
      let prefecture = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip matrix labels
        if (/^(Modern|Classic)-(Light|Medium|Full|Rich)/i.test(trimmed)) continue;
        
        // Skip common UI elements
        if (trimmed.includes('arrow') || trimmed.includes('icon') || trimmed.includes('close')) continue;
        
        // Check for brewery-prefecture pattern (e.g., "Yonetsuru Shuzo\-Yamagata")
        const breweryMatch = trimmed.match(/^([A-Za-z\s]+(?:Shuzo|Brewery|Sake|Brewing|酒造)?)\s*\\?-\s*([A-Za-z]+)$/i);
        if (breweryMatch) {
          brewery = breweryMatch[1].trim();
          prefecture = breweryMatch[2].trim();
          continue;
        }
        
        // Check for Japanese characters (likely Japanese name)
        if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(trimmed) && !japaneseName) {
          japaneseName = trimmed;
          continue;
        }
        
        // Check for English name (ALL CAPS or starts with capital, reasonable length)
        if (/^[A-Z][A-Za-z\s"'()-]+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 100 && !englishName) {
          // Skip if it's a category name
          if (!/^(Junmai|Ginjo|Daiginjo|Honjozo|Fruity|Light|Bold|Fresh|Sweet|Rich|Meaty|White|Seafood|Spicy)/i.test(trimmed)) {
            englishName = trimmed;
          }
        }
      }
      
      // Only add if we found a name
      if (englishName || japaneseName) {
        const sake: ScrapedSake = {
          name: englishName || japaneseName,
          nameJapanese: japaneseName || undefined,
          brewery: brewery || undefined,
          prefecture: prefecture || undefined,
          type: matrixMatch ? undefined : undefined, // We'll extract type separately
        };
        
        // Try to determine sake type from the block
        const typeMatch = block.match(/(Junmai Daiginjo|Junmai Ginjo|Tokubetsu Junmai|Junmai|Daiginjo|Ginjo|Tokubetsu Honjozo|Honjozo)/i);
        if (typeMatch) {
          sake.type = typeMatch[1];
        }
        
        // Extract taste profile
        const tasteMatch = block.match(/(Fruity & Aromatic|Light & Dry|Bold & Aged|Fresh & Vivid|Sweet|Rich & Savory)/i);
        if (tasteMatch) {
          sake.taste = tasteMatch[1];
        }
        
        // Extract food pairing
        const foodMatches = block.match(/(Meaty Food|White Meats and Salty Food|Seafood|Spicy Food|Sweet Food)/gi);
        if (foodMatches) {
          sake.foodPairing = [...new Set(foodMatches)];
        }
        
        sakes.push(sake);
      }
    }

    // Extract images separately from HTML
    const imgRegex = /https:\/\/[^"'\s]+(?:uploads|cdn)[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
    const imageMatches = html.match(imgRegex) || [];
    const productImages = imageMatches.filter((url: string) => 
      !url.includes('logo') && 
      !url.includes('icon') &&
      !url.includes('arrow') &&
      !url.includes('close')
    );

    // Try to match images to sakes (rough matching by order)
    // In reality, images would need to be matched more carefully
    sakes.forEach((sake, index) => {
      if (productImages[index]) {
        sake.imageUrl = productImages[index];
      }
    });

    // Deduplicate sakes by name
    const uniqueSakes = sakes.filter((sake, index, self) =>
      index === self.findIndex((s) => s.name === sake.name)
    );

    const result: ScrapeResult = {
      sakes: uniqueSakes,
      totalFound: uniqueSakes.length,
      page: page,
      hasMore: false, // Single page for now
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error('Scrape error:', error);
    return res.status(500).json({ error: 'Scrape failed', details: String(error) });
  }
}
