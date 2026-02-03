import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qpsdebikkmcdzddhphlk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_2_EyN29uDqznDNteH_-DMA_hWZ46p-D';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
