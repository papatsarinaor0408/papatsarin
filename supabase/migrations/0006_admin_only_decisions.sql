-- submit_decision is now Admin-only. The user explicitly confirmed Reviewers
-- should be view-only (overriding the original spec, which had Reviewers
-- submitting decisions) — only employee_id 596203 may approve/revise/reject/
-- revert a plan's decision. Same is_admin() guard pattern already used in
-- admin_import_dataset/admin_reset_all_decisions/admin_set_account_status.
-- Rest of the function body is unchanged from 0002_functions_policies.sql.
create or replace function public.submit_decision(
  p_plan_id text, p_decision text, p_remark text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employee_id text; v_role text; v_position text; v_old jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may submit review decisions'; end if;

  select employee_id, role, position into v_employee_id, v_role, v_position
  from public.profiles where id = v_uid and status = 'active';
  if v_employee_id is null then raise exception 'Account inactive or not found'; end if;

  if p_decision not in ('pending','approved','revise','rejected') then
    raise exception 'Invalid decision value: %', p_decision;
  end if;
  if p_decision in ('revise','rejected') and (p_remark is null or btrim(p_remark) = '') then
    raise exception 'Remark is required for revise/rejected decisions';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'Plan % not found', p_plan_id;
  end if;

  select to_jsonb(d) into v_old from public.decisions d where plan_id = p_plan_id;

  if p_decision = 'pending' then
    delete from public.decisions where plan_id = p_plan_id;
  else
    insert into public.decisions (plan_id, reviewer_id, reviewer_employee_id, reviewer_position, decision, remark, reviewed_at)
    values (p_plan_id, v_uid, v_employee_id, v_position, p_decision, coalesce(p_remark, ''), now())
    on conflict (plan_id) do update
      set reviewer_id = excluded.reviewer_id, reviewer_employee_id = excluded.reviewer_employee_id,
          reviewer_position = excluded.reviewer_position, decision = excluded.decision,
          remark = excluded.remark, reviewed_at = excluded.reviewed_at;
  end if;

  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, old_value, new_value, note)
  values (v_uid, v_employee_id, v_role,
    case p_decision when 'approved' then 'Approved' when 'revise' then 'Revise Requested'
                     when 'rejected' then 'Rejected' else 'Reverted to Pending' end,
    'plan', p_plan_id, v_old, jsonb_build_object('decision', p_decision, 'remark', p_remark), p_remark);
end;
$$;
revoke execute on function public.submit_decision(text, text, text) from public;
revoke execute on function public.submit_decision(text, text, text) from anon;
grant execute on function public.submit_decision(text, text, text) to authenticated;
