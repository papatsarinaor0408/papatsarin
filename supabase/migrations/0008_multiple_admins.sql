-- Expand Admin from a single account (596203) to three named accounts, per
-- explicit request from the system owner. This keeps the same defense-in-
-- depth approach as the original single-admin hardening (0004): an explicit
-- employee_id allowlist checked INSIDE is_admin() itself, never trusting the
-- profiles.role column alone (a role value can only ever come from this
-- allowlist-driven promotion below or from seed-accounts, which itself only
-- ever assigns 'Admin' to an ID in this same list).

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and employee_id in ('596203', '596421', '593952')
      and role = 'Admin'
      and status = 'active'
  );
$$;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- Promote the two new accounts. role is otherwise never set from imported
-- Excel data — this is a one-time, explicit admin-designation action.
update public.profiles set role = 'Admin', updated_at = now()
where employee_id in ('596421', '593952') and role <> 'Admin';

-- admin_set_account_status: widen the "cannot deactivate the Admin account"
-- guard to cover all three Admin accounts (so no Admin can lock every Admin
-- out by deactivating another one). Full body restated — CREATE OR REPLACE
-- needs it, only the one line changed vs. the version in 0007.
create or replace function public.admin_set_account_status(p_employee_id text, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_admin_employee_id text; v_admin_role text; v_admin_position text; v_admin_full_name text;
  v_target_id uuid; v_old jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may change account status'; end if;
  if p_employee_id in ('596203', '596421', '593952') then raise exception 'Cannot deactivate an Admin account'; end if;
  select employee_id, role, position, full_name into v_admin_employee_id, v_admin_role, v_admin_position, v_admin_full_name
  from public.profiles where id = v_uid;
  select id, to_jsonb(p) into v_target_id, v_old from public.profiles p where employee_id = p_employee_id;
  if v_target_id is null then raise exception 'No account with employee_id %', p_employee_id; end if;
  update public.profiles set status = case when p_active then 'active' else 'inactive' end, updated_at = now()
  where id = v_target_id;
  insert into public.audit_logs (user_id, employee_id, role, actor_full_name, actor_position, action, target_type, target_id, old_value, new_value)
  values (v_uid, v_admin_employee_id, v_admin_role, v_admin_full_name, v_admin_position, 'Set Account Status', 'account', p_employee_id, v_old,
          jsonb_build_object('status', case when p_active then 'active' else 'inactive' end));
end;
$$;
revoke execute on function public.admin_set_account_status(text, boolean) from public;
revoke execute on function public.admin_set_account_status(text, boolean) from anon;
grant execute on function public.admin_set_account_status(text, boolean) to authenticated;
