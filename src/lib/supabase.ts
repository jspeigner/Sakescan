import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qpsdebikkmcdzddhphlk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_2_EyN29uDqznDNteH_-DMA_hWZ46p-D';

// Password-reset /auth/callback must read the hash before GoTrue consumes it.
// Admin auth is email+password only, so session detection from the URL is unused.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
  },
});
