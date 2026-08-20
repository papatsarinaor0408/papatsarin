-- The project has "Automatically expose new tables" OFF (a deliberate
-- security choice) — RLS policies alone are not enough for PostgREST to
-- serve a table to the `authenticated` role; an explicit GRANT is also
-- required (same class of issue fixed earlier for profiles/plans/decisions/
-- audit_logs during account seeding). login_events was added in migration
-- 0007 without this grant — this is the fix. RLS (admin-only SELECT) still
-- fully controls which *rows* come back; this only lets the query run at all.
grant select on public.login_events to authenticated;

-- Defensive re-grant — audit_logs should already have this from the earlier
-- fix, but restating it here is harmless (GRANT is idempotent) and rules
-- out the same failure on the "ประวัติการเปลี่ยนแปลง" tab.
grant select on public.audit_logs to authenticated;
