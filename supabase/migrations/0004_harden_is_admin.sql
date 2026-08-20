-- Harden is_admin(): Admin authorization now requires ALL of auth.uid()
-- matching the profile, employee_id = '596203' specifically, role = 'Admin',
-- and status = 'active'. This closes the gap where any profile row with
-- role='Admin' (e.g. a mistaken insert, or a disposable test account) would
-- previously have been treated as a real Admin. The employee_id check is
-- now enforced INSIDE is_admin() itself, not just in admin_set_account_status,
-- so every RPC that calls is_admin() automatically inherits this guarantee.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and employee_id = '596203'
      and role = 'Admin'
      and status = 'active'
  );
$$;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
