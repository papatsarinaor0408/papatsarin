/**
 * Supabase client — Project URL + publishable key are intentionally public
 * (safe to commit; Row Level Security is the real access-control boundary,
 * not secrecy of this key). Never put the service_role/secret key here.
 *
 * Named SB (not `supabase`) so it doesn't shadow the vendored library's own
 * global `window.supabase` export.
 */
const SUPABASE_URL = 'https://tmehsrxvninpatqxhcgs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UZBKs4aJ8EhHBKzkYaQBfg_qbvccCIT';

const SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
