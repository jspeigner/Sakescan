import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { provenanceForAdmin, sakeImageUpdatePayload } from './cron/lib/imageProvenance.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jspeigner@gmail.com';

type SakePayload = {
  name: string;
  name_japanese: string | null;
  brewery: string;
  type: string | null;
  subtype: string | null;
  region: string | null;
  prefecture: string | null;
  description: string | null;
  rice_variety: string | null;
  polishing_ratio: number | null;
  alcohol_percentage: number | null;
  smv: number | null;
  acidity: number | null;
  image_url: string | null;
  updated_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user?.email) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  if (userData.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const body = req.body as {
    id?: string;
    payload?: SakePayload;
    action?: 'delete' | 'upsert';
  };

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  // Client-side deletes hit RLS (permission denied on `sake`); admin must use service role.
  if (body?.action === 'delete') {
    if (!body.id) {
      return res.status(400).json({ error: 'id is required for delete' });
    }

    // Capture hosted image path before the row disappears so storage is not orphaned.
    const { data: existing, error: existingError } = await admin
      .from('sake')
      .select('id, image_url')
      .eq('id', body.id)
      .maybeSingle();
    if (existingError) {
      console.error('[admin-upsert-sake/delete] lookup', existingError);
      return res.status(500).json({ error: existingError.message });
    }
    if (!existing?.id) {
      return res.status(404).json({ error: 'Sake not found' });
    }

    const { data, error } = await admin
      .from('sake')
      .delete()
      .eq('id', body.id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[admin-upsert-sake/delete]', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.id) {
      return res.status(404).json({ error: 'Sake not found' });
    }

    const imageUrl = typeof existing.image_url === 'string' ? existing.image_url : null;
    if (imageUrl) {
      try {
        const projectHost = new URL(supabaseUrl).hostname;
        const image = new URL(imageUrl);
        const marker = '/object/public/sake-images/';
        const markerIdx = image.pathname.indexOf(marker);
        if (image.hostname === projectHost && markerIdx !== -1) {
          const objectPath = decodeURIComponent(image.pathname.slice(markerIdx + marker.length));
          // Catalog objects use varied folders (mirror/, sake-images/, …).
          // Never touch user scan-uploads from a sake-row delete.
          const safeCatalogPath =
            !!objectPath &&
            !objectPath.includes('..') &&
            !objectPath.startsWith('scan-uploads/') &&
            /^[a-zA-Z0-9._/-]+$/.test(objectPath);
          if (safeCatalogPath) {
            const { error: removeError } = await admin.storage
              .from('sake-images')
              .remove([objectPath]);
            if (removeError) {
              console.error('[admin-upsert-sake/delete] storage cleanup', removeError);
            }
          }
        }
      } catch (cleanupErr) {
        console.error('[admin-upsert-sake/delete] storage cleanup', cleanupErr);
      }
    }

    return res.status(200).json({ success: true, id: data.id, mode: 'delete' });
  }

  const payload = body?.payload;
  if (!payload?.name || !payload?.brewery) {
    return res.status(400).json({ error: 'name and brewery are required' });
  }

  const row: Record<string, unknown> = { ...payload };
  if (payload.image_url) {
    Object.assign(row, sakeImageUpdatePayload(payload.image_url, provenanceForAdmin()));
  }

  if (body?.id) {
    const { data, error } = await admin
      .from('sake')
      .update(row)
      .eq('id', body.id)
      .select('id')
      .single();

    if (error) {
      console.error('[admin-upsert-sake/update]', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.id) {
      return res.status(404).json({ error: 'Sake not found' });
    }
    return res.status(200).json({ success: true, id: data.id, mode: 'update' });
  }

  const { data, error } = await admin
    .from('sake')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    console.error('[admin-upsert-sake/insert]', error);
    return res.status(500).json({ error: error.message });
  }
  if (!data?.id) {
    return res.status(500).json({ error: 'Insert did not return id' });
  }

  return res.status(200).json({ success: true, id: data.id, mode: 'insert' });
}
