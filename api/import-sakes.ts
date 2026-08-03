import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchAllSelectPages } from './lib/fetchAllSelectPages.js';
import { looksLikeNonSakeUrl } from './lib/nonSakeUrl.js';
import { requireAdmin } from './lib/requireAdmin.js';
import { matchesExisting } from './cron/lib/importSakuraBatch.js';
import { fetchPublicHttpUrl, isPublicHttpImageUrl } from './cron/lib/publicImageUrl.js';

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

async function downloadAndStoreImage(
  supabase: SupabaseClient,
  imageUrl: string,
  sakeName: string
): Promise<string> {
  if (!isPublicHttpImageUrl(imageUrl)) {
    throw new Error('Image URL must be a public http(s) URL');
  }
  const imageResponse = await fetchPublicHttpUrl(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SakeScan/1.0)',
      'Accept': 'image/*',
    },
  });

  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  const imageBuffer = await imageResponse.arrayBuffer();

  let extension = 'jpg';
  if (contentType.includes('png')) extension = 'png';
  else if (contentType.includes('webp')) extension = 'webp';
  else if (contentType.includes('gif')) extension = 'gif';
  else if (contentType.includes('avif')) extension = 'avif';

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const safeName = (sakeName || 'sake')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);

  const filePath = `sake-images/${safeName}-${timestamp}-${randomStr}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('sake-images')
    .upload(filePath, imageBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('sake-images')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req, res);
  if (!auth.ok) return;

  const { action, sakes } = req.body;

  const supabase = createClient(auth.supabaseUrl, auth.supabaseServiceKey);

  try {
    // Action: match - Compare scraped sakes with existing database
    if (action === 'match') {
      const scrapedSakes: SakeToImport[] = sakes;
      
      // Page through the full catalog — a bare `.select()` is capped at ~1000 rows
      // by PostgREST, which falsely marks the rest as new and duplicates on import.
      const existingSakes = await fetchAllSelectPages<{
        id: string;
        name: string;
        name_japanese: string | null;
        brewery: string;
        image_url: string | null;
      }>(async (from, to) => {
        const { data, error } = await supabase
          .from('sake')
          .select('id, name, name_japanese, brewery, image_url')
          .range(from, to);
        return { data, error };
      });

      const results: SakeToImport[] = [];

      for (const scraped of scrapedSakes) {
        // Reuse Sakura matcher: require product-name overlap, and when both sides
        // have a brewery, require brewery compatibility. Name-only matching used to
        // attach images onto a different brewery's row with the same product name.
        const match = existingSakes.find((existing) =>
          matchesExisting(
            {
              name: scraped.name,
              nameJapanese: scraped.nameJapanese,
              brewery: scraped.brewery,
            },
            {
              ...existing,
              description: null,
              type: null,
              prefecture: null,
            }
          )
        );

        if (match) {
          // Check if existing sake is missing at least one image
          const needsImage = !match.image_url;
          
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
          if (looksLikeNonSakeUrl(sake.imageUrl)) {
            console.warn(`Skipping non-sake image URL for ${sake.name}: ${sake.imageUrl}`);
            continue;
          }
          let finalImageUrl = sake.imageUrl;
          try {
            finalImageUrl = await downloadAndStoreImage(supabase, sake.imageUrl, sake.name);
          } catch (downloadError) {
            // Keep external URL as fallback so update is not blocked.
            console.error(`Image storage failed for ${sake.name}:`, downloadError);
          }

          const { error } = await supabase
            .from('sake')
            .update({
              image_url: finalImageUrl,
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
        let finalImageUrl: string | null = null;
        if (sake.imageUrl && !looksLikeNonSakeUrl(sake.imageUrl)) {
          try {
            finalImageUrl = await downloadAndStoreImage(supabase, sake.imageUrl, sake.name);
          } catch (downloadError) {
            console.error(`Image storage failed for ${sake.name}:`, downloadError);
            finalImageUrl = sake.imageUrl;
          }
        } else if (sake.imageUrl) {
          console.warn(`Skipping non-sake image URL for new sake ${sake.name}: ${sake.imageUrl}`);
        }

        const { error } = await supabase
          .from('sake')
          .insert({
            name: sake.name,
            name_japanese: sake.nameJapanese || null,
            brewery: sake.brewery || 'Unknown',
            type: sake.type || null,
            prefecture: sake.prefecture || null,
            image_url: finalImageUrl,
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
