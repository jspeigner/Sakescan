import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SearchResult {
  images: Array<{
    url: string;
    thumbnail?: string;
    source: string;
    title?: string;
  }>;
  sakeData?: {
    name?: string;
    nameJapanese?: string;
    brewery?: string;
    type?: string;
    prefecture?: string;
    description?: string;
    polishingRatio?: number;
    alcoholPercentage?: number;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
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
    const results: SearchResult = {
      images: [],
    };

    // Build search query
    const searchTerms = [name];
    if (nameJapanese) searchTerms.push(nameJapanese);
    if (brewery) searchTerms.push(brewery);
    searchTerms.push('sake bottle');
    
    const searchQuery = searchTerms.join(' ');

    // Search Sakura Sake Shop for high-quality product images
    const sakuraSakeUrl = `https://export.sakurasaketen.com/sake?Keyword=${encodeURIComponent(name)}`;
    
    try {
      const sakuraResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url: sakuraSakeUrl,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
        }),
      });

      if (sakuraResponse.ok) {
        const sakuraData = await sakuraResponse.json();
        
        // Extract image URLs from Sakura Sake results
        const imgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
        const htmlContent = sakuraData.data?.html || '';
        const imageMatches = htmlContent.match(imgRegex) || [];
        
        // Filter for product images (usually from Webflow or CDN)
        const productImages = imageMatches
          .filter((url: string) => 
            !url.includes('logo') && 
            !url.includes('icon') &&
            !url.includes('badge') &&
            !url.includes('arrow') &&
            !url.includes('close') &&
            (url.includes('uploads') || url.includes('cdn') || url.includes('sake'))
          )
          .slice(0, 5);

        productImages.forEach((url: string) => {
          results.images.push({
            url,
            source: 'Sakura Sake Shop',
            title: name,
          });
        });

        // Try to extract product data from markdown
        const markdown = sakuraData.data?.markdown || '';
        
        // Look for sake type patterns
        const typeMatch = markdown.match(/(?:Junmai Daiginjo|Junmai Ginjo|Junmai|Daiginjo|Ginjo|Honjozo|Tokubetsu Junmai|Tokubetsu Honjozo|Nigori|Sparkling|Nama|Futsushu)/i);
        const prefectureMatch = markdown.match(/(?:Miyagi|Yamagata|Niigata|Fukuoka|Saga|Hiroshima|Yamaguchi|Nagasaki|Kochi|Shiga|Mie|Gifu|Saitama|Gunma|Akita|Aomori|Osaka)/i);
        const polishMatch = markdown.match(/(\d+)%?\s*(?:精米|polishing|seimaibuai)/i);
        const abvMatch = markdown.match(/(?:ABV|Alcohol|ALC)[:\s]*(\d+(?:\.\d+)?)\s*%/i);
        
        if (typeMatch || prefectureMatch || polishMatch || abvMatch) {
          results.sakeData = {
            type: typeMatch?.[0],
            prefecture: prefectureMatch?.[0],
            polishingRatio: polishMatch ? parseInt(polishMatch[1]) : undefined,
            alcoholPercentage: abvMatch ? parseFloat(abvMatch[1]) : undefined,
          };
        }
      }
    } catch (sakuraError) {
      console.error('Sakura Sake scrape error:', sakuraError);
    }

    // Search Umami Mart for sake images
    const umamiMartUrl = `https://umamimart.com/search?q=${encodeURIComponent(name + ' sake')}&type=product`;
    
    try {
      const umamiResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url: umamiMartUrl,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
        }),
      });

      if (umamiResponse.ok) {
        const umamiData = await umamiResponse.json();
        
        // Extract image URLs from Umami Mart results (Shopify CDN)
        const imgRegex = /https:\/\/[^"'\s]+cdn\.shopify\.com[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
        const htmlContent = umamiData.data?.html || '';
        const imageMatches = htmlContent.match(imgRegex) || [];
        
        // Filter for product images
        const productImages = imageMatches
          .filter((url: string) => 
            url.includes('products') && 
            !url.includes('logo') && 
            !url.includes('icon') &&
            !url.includes('badge') &&
            !url.includes('collection')
          )
          .map((url: string) => {
            // Get higher resolution version by removing size parameters
            return url.replace(/_\d+x\d*\./, '_800x.');
          })
          .slice(0, 4);

        productImages.forEach((url: string) => {
          results.images.push({
            url,
            source: 'Umami Mart',
            title: name,
          });
        });

        // Try to extract product data from markdown
        const markdown = umamiData.data?.markdown || '';
        
        // Look for sake type patterns if we don't have data yet
        if (!results.sakeData) {
          const typeMatch = markdown.match(/(?:Type|Category|Style)[:\s]*(Junmai|Daiginjo|Ginjo|Honjozo|Nigori|Sparkling|Nama|Futsushu)[^\n]*/i);
          const prefectureMatch = markdown.match(/(?:Prefecture|Region|Origin)[:\s]*([A-Za-z]+)/i);
          const polishMatch = markdown.match(/(?:Polish|Polishing|Rice Polishing|SMV)[:\s]*(\d+)%?/i);
          const abvMatch = markdown.match(/(?:ABV|Alcohol|ALC)[:\s]*(\d+(?:\.\d+)?)\s*%/i);
          
          if (typeMatch || prefectureMatch || polishMatch || abvMatch) {
            results.sakeData = {
              type: typeMatch?.[1],
              prefecture: prefectureMatch?.[1],
              polishingRatio: polishMatch ? parseInt(polishMatch[1]) : undefined,
              alcoholPercentage: abvMatch ? parseFloat(abvMatch[1]) : undefined,
            };
          }
        }
      }
    } catch (umamiError) {
      console.error('Umami Mart scrape error:', umamiError);
    }

    // Search Sake Times (Japanese sake database)
    if (nameJapanese) {
      const sakeTimesUrl = `https://en.sake-times.com/?s=${encodeURIComponent(nameJapanese)}`;
      
      try {
        const sakeTimesResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${firecrawlApiKey}`,
          },
          body: JSON.stringify({
            url: sakeTimesUrl,
            formats: ['html'],
            onlyMainContent: true,
          }),
        });

        if (sakeTimesResponse.ok) {
          const sakeTimesData = await sakeTimesResponse.json();
          const htmlContent = sakeTimesData.data?.html || '';
          
          // Extract image URLs
          const imgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi;
          const imageMatches = htmlContent.match(imgRegex) || [];
          
          const sakeImages = imageMatches
            .filter((url: string) => 
              !url.includes('logo') && 
              !url.includes('icon') &&
              !url.includes('avatar') &&
              url.includes('sake')
            )
            .slice(0, 3);

          sakeImages.forEach((url: string) => {
            results.images.push({
              url,
              source: 'Sake Times',
              title: nameJapanese || name,
            });
          });
        }
      } catch (sakeTimesError) {
        console.error('Sake Times scrape error:', sakeTimesError);
      }
    }

    // Search Google Images as fallback
    const googleImagesUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;
    
    try {
      const googleResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url: googleImagesUrl,
          formats: ['html'],
        }),
      });

      if (googleResponse.ok) {
        const googleData = await googleResponse.json();
        const htmlContent = googleData.data?.html || '';
        
        // Google Images stores image URLs in data attributes and script tags
        // Try to extract from various patterns
        const patterns = [
          /"ou":"(https?:\/\/[^"]+)"/g,  // Original URL pattern
          /\["(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))",[0-9]+,[0-9]+\]/g,  // Array pattern
          /data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi,  // Data-src pattern
        ];

        const foundUrls = new Set<string>();
        
        for (const pattern of patterns) {
          const matches = [...htmlContent.matchAll(pattern)];
          matches.forEach((match: RegExpMatchArray) => {
            const url = match[1];
            if (url && 
                !url.includes('google.com') && 
                !url.includes('gstatic') &&
                url.startsWith('http')) {
              foundUrls.add(url);
            }
          });
        }

        [...foundUrls].slice(0, 5).forEach((url) => {
          results.images.push({
            url,
            source: 'Google Images',
            title: searchQuery,
          });
        });
      }
    } catch (googleError) {
      console.error('Google Images scrape error:', googleError);
    }

    // Remove duplicates by URL
    const uniqueImages = results.images.filter((img, index, self) =>
      index === self.findIndex((t) => t.url === img.url)
    );
    results.images = uniqueImages;

    return res.status(200).json(results);
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed', details: String(error) });
  }
}
