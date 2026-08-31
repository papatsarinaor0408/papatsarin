-- Same class of bug fixed in 0009 for login_events/audit_logs: this
-- project has "Automatically expose new tables" OFF, so RLS policies
-- alone are not enough for PostgREST to serve a table to the
-- `authenticated` role — an explicit GRANT is also required. The 4 new
-- final_* tables from migration 0013 were missing this, causing
-- "permission denied for table final_courses" in the app. RLS (already
-- defined in 0013) still fully controls which *rows* come back; this only
-- lets the query run at all.
grant select on public.final_courses to authenticated;
grant select on public.final_course_targets_by_name to authenticated;
grant select on public.final_course_targets_by_unit to authenticated;
grant select on public.final_course_budget to authenticated;
