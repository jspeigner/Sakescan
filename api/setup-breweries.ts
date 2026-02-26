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
`.trim();

const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_breweries_name ON breweries(name);
CREATE INDEX IF NOT EXISTS idx_breweries_prefecture ON breweries(prefecture);
CREATE INDEX IF NOT EXISTS idx_breweries_region ON breweries(region);
`.trim();

const ENABLE_RLS_SQL = `
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
`.trim();

const CREATE_POLICIES_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'breweries' AND policyname = 'Allow public read access on breweries') THEN
    CREATE POLICY "Allow public read access on breweries" ON breweries FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'breweries' AND policyname = 'Allow service role full access on breweries') THEN
    CREATE POLICY "Allow service role full access on breweries" ON breweries FOR ALL USING (true);
  END IF;
END $$;
`.trim();

async function executeSQL(supabaseUrl: string, serviceKey: string, sql: string): Promise<{ success: boolean; error?: string }> {
  // Use Supabase's PostgREST RPC to execute SQL via a database function
  // First try the pg_net approach, then fall back to direct REST
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

  // Supabase exposes a SQL execution endpoint for service role
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=minimal',
    },
  });

  // The RPC endpoint without a function name won't work, but we can use
  // the database's query endpoint available through the pooler
  // Try using Supabase's internal SQL execution
  const sqlResponse = await fetch(`https://${projectRef}.supabase.co/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (sqlResponse.ok) {
    return { success: true };
  }

  // Fallback: try the v1 query endpoint
  const v1Response = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ sql_query: sql }),
  });

  if (v1Response.ok) {
    return { success: true };
  }

  return { success: false, error: `SQL execution not available (${sqlResponse.status})` };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body || {};
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check if table already exists
  const { data, error: checkError } = await supabase
    .from('breweries')
    .select('id')
    .limit(1);

  const tableExists = !checkError || !checkError.message.includes('does not exist');

  if (action === 'create' && !tableExists) {
    // Attempt to create the table
    const statements = [CREATE_TABLE_SQL, CREATE_INDEXES_SQL, ENABLE_RLS_SQL, CREATE_POLICIES_SQL];
    const results: Array<{ sql: string; success: boolean; error?: string }> = [];

    for (const sql of statements) {
      const result = await executeSQL(supabaseUrl, supabaseServiceKey, sql);
      results.push({ sql: sql.substring(0, 50) + '...', ...result });
    }

    // Re-check if table exists now
    const { error: recheck } = await supabase.from('breweries').select('id').limit(1);
    const nowExists = !recheck || !recheck.message.includes('does not exist');

    if (nowExists) {
      return res.status(200).json({ exists: true, message: 'Table created successfully.', rowCount: 0 });
    }

    // If auto-creation failed, return SQL for manual execution
    const fullSql = [CREATE_TABLE_SQL, CREATE_INDEXES_SQL, ENABLE_RLS_SQL, CREATE_POLICIES_SQL].join('\n\n');
    return res.status(200).json({
      exists: false,
      message: 'Could not auto-create table. Please run the SQL below in your Supabase SQL Editor.',
      sql: fullSql,
      results,
    });
  }

  if (tableExists) {
    const { count } = await supabase.from('breweries').select('*', { count: 'exact', head: true });
    return res.status(200).json({ exists: true, message: `Breweries table exists with ${count || 0} rows.`, rowCount: count || 0 });
  }

  // Table doesn't exist and no create action
  const fullSql = [CREATE_TABLE_SQL, CREATE_INDEXES_SQL, ENABLE_RLS_SQL, CREATE_POLICIES_SQL].join('\n\n');
  return res.status(200).json({
    exists: false,
    message: 'Table does not exist. Click "Create Table" to set it up, or run the SQL manually.',
    sql: fullSql,
  });
}
