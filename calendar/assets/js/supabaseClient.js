/**
 * Supabase client for the PEA BPK Team Calendar.
 * Same project as the rest of this repo. Row Level Security is enabled on
 * every calendar_* table with open (public) policies — anyone with the page
 * link can read and write data; the login screen restricts the UI, not the
 * database. This key is safe to commit (RLS is the real boundary).
 * Uses the legacy JWT anon key rather than the newer sb_publishable_...
 * key — the vendored supabase-js build here predates that key format and
 * gets a 401 from PostgREST when given it.
 */
const CAL_SUPABASE_URL = 'https://tmehsrxvninpatqxhcgs.supabase.co';
const CAL_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZWhzcnh2bmlucGF0cXhoY2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDUyOTMsImV4cCI6MjEwMjc4MTI5M30.bYRqOvNF96_bNWOxvRCyZnEoutrEA3EgfVom8EtbDzU';

const CAL_SB = window.supabase.createClient(CAL_SUPABASE_URL, CAL_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
