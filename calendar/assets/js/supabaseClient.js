/**
 * Supabase client for the PEA BPK Team Calendar.
 * Same project as the rest of this repo. Row Level Security is enabled on
 * calendar_tasks, but the policies are currently open (no auth wired into
 * this mini-app yet) — anyone with the page link can read AND write data.
 * The publishable key below is safe to commit (RLS is the real boundary).
 */
const CAL_SUPABASE_URL = 'https://tmehsrxvninpatqxhcgs.supabase.co';
const CAL_SUPABASE_KEY = 'sb_publishable_UZBKs4aJ8EhHBKzkYaQBfg_qbvccCIT';

const CAL_SB = window.supabase.createClient(CAL_SUPABASE_URL, CAL_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
