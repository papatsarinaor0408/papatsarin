-- Exposes only the timestamp/file name of the most recent successful
-- import to ALL authenticated users (Admin and Reviewer), without granting
-- access to the rest of the audit trail — audit_logs itself stays
-- Admin-only per the audit_logs_select policy in
-- 0007_login_history_and_audit_actor.sql. Used to show "last data update"
-- on the dashboard regardless of role.
create or replace function public.get_last_import_info()
returns table(imported_at timestamptz, file_name text)
language sql security definer set search_path = public
as $$
  select created_at, note
  from public.audit_logs
  where action = 'Import Dataset'
  order by created_at desc
  limit 1;
$$;
revoke execute on function public.get_last_import_info() from public;
revoke execute on function public.get_last_import_info() from anon;
grant execute on function public.get_last_import_info() to authenticated;
