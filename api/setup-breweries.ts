import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS breweries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  prefecture text,
  region text,
  address text,
  phone text,
  website text,
  email text,
  founded_year integer,
  representative text,
  brands jsonb DEFAULT '[]'::jsonb,
  description text,
  visiting_info text,
  tour_available boolean DEFAULT false,
  image_url text,
  gallery_images jsonb DEFAULT '[]'::jsonb,
  source_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_breweries_name ON breweries(name);
CREATE INDEX IF NOT EXISTS idx_breweries_prefecture ON breweries(prefecture);
CREATE INDEX IF NOT EXISTS idx_breweries_region ON breweries(region);

ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON breweries FOR SELECT USING (true);
CREATE POLICY "Allow service role full access" ON breweries FOR ALL USING (true);
`.trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase
      .from('breweries')
      .select('id')
      .limit(1);

    if (error && error.message.includes('does not exist')) {
      return res.status(200).json({
        exists: false,
        message: 'Table does not exist yet. Run the SQL below in your Supabase SQL Editor.',
        sql: CREATE_TABLE_SQL,
        dashboardUrl: `${supabaseUrl.replace('.supabase.co', '')}.supabase.com/project/${supabaseUrl.split('//')[1]?.split('.')[0]}/sql/new`,
      });
    }

    if (error) {
      return res.status(200).json({
        exists: false,
        message: `Error checking table: ${error.message}`,
        sql: CREATE_TABLE_SQL,
      });
    }

    // Table exists - count rows
    const { count } = await supabase
      .from('breweries')
      .select('*', { count: 'exact', head: true });

    return res.status(200).json({
      exists: true,
      message: `Breweries table exists with ${count || 0} rows.`,
      rowCount: count || 0,
    });
  } catch (error) {
    console.error('Setup check error:', error);
    return res.status(500).json({ error: 'Check failed', details: String(error) });
  }
}
