import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface SakeToImport {
  name: string;
  nameJapanese?: string;
  brewery?: string;
  type?: string;
  prefecture?: string;
  imageUrl?: string;
  isNew: boolean;
  existingId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, sakes } = req.body;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Action: match - Compare scraped sakes with existing database
    if (action === 'match') {
      const scrapedSakes: SakeToImport[] = sakes;
      
      // Fetch all existing sakes
      const { data: existingSakes, error: fetchError } = await supabase
        .from('sake')
        .select('id, name, name_japanese, brewery, label_image_url, bottle_image_url');

      if (fetchError) throw fetchError;

      const results: SakeToImport[] = [];

      for (const scraped of scrapedSakes) {
        // Try to find a match in existing database
        const match = existingSakes?.find(existing => {
          // Match by name (case insensitive, partial match)
          const nameMatch = existing.name?.toLowerCase().includes(scraped.name?.toLowerCase()) ||
            scraped.name?.toLowerCase().includes(existing.name?.toLowerCase());
          
          // Match by Japanese name if available
          const japaneseMatch = scraped.nameJapanese && existing.name_japanese &&
            (existing.name_japanese.includes(scraped.nameJapanese) ||
             scraped.nameJapanese.includes(existing.name_japanese));
          
          // Match by brewery + partial name
          const breweryMatch = scraped.brewery && existing.brewery &&
            existing.brewery.toLowerCase().includes(scraped.brewery.toLowerCase());

          return nameMatch || japaneseMatch || (breweryMatch && nameMatch);
        });

        if (match) {
          // Check if existing sake is missing an image
          const needsImage = !match.label_image_url && !match.bottle_image_url;
          
          results.push({
            ...scraped,
            isNew: false,
            existingId: match.id,
            // Only include if needs image update or we have new data
            imageUrl: needsImage ? scraped.imageUrl : undefined,
          });
        } else {
          // New sake
          results.push({
            ...scraped,
            isNew: true,
          });
        }
      }

      // Separate into updates and new entries
      const updates = results.filter(r => !r.isNew && r.imageUrl);
      const newSakes = results.filter(r => r.isNew);

      return res.status(200).json({
        updates,
        newSakes,
        totalMatched: results.filter(r => !r.isNew).length,
        totalNew: newSakes.length,
        totalUpdates: updates.length,
      });
    }

    // Action: import - Actually perform the import
    if (action === 'import') {
      const { updates, newSakes }: { updates: SakeToImport[]; newSakes: SakeToImport[] } = req.body;
      
      let updatedCount = 0;
      let insertedCount = 0;
      const errors: string[] = [];

      // Process updates (add images to existing sakes)
      for (const sake of updates || []) {
        if (sake.existingId && sake.imageUrl) {
          const { error } = await supabase
            .from('sake')
            .update({
              label_image_url: sake.imageUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sake.existingId);

          if (error) {
            errors.push(`Failed to update ${sake.name}: ${error.message}`);
          } else {
            updatedCount++;
          }
        }
      }

      // Process new sakes
      for (const sake of newSakes || []) {
        const { error } = await supabase
          .from('sake')
          .insert({
            name: sake.name,
            name_japanese: sake.nameJapanese || null,
            brewery: sake.brewery || 'Unknown',
            type: sake.type || null,
            prefecture: sake.prefecture || null,
            label_image_url: sake.imageUrl || null,
            total_ratings: 0,
          });

        if (error) {
          errors.push(`Failed to insert ${sake.name}: ${error.message}`);
        } else {
          insertedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        updatedCount,
        insertedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "match" or "import"' });
  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({ error: 'Import failed', details: String(error) });
  }
}
