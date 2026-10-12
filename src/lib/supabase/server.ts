import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side Supabase client using service role key.
 * ONLY use in API routes / server components — never expose to the browser.
 */
export function createServerSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Server Supabase credentials missing.');
  }
  return createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseServiceKey || 'placeholder-key',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
