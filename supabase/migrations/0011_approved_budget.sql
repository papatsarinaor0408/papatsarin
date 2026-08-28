-- อฟก.-approved budget override: lets the reviewer record a budget amount
-- that differs from the plan's originally proposed budgetTotal (e.g. after
-- cutting some attendees), without touching the imported plans data itself.
alter table public.decisions add column if not exists approved_budget numeric;

-- Adding a parameter changes the function's signature, so the old 3-arg
-- overload needs dropping explicitly rather than just "create or replace".
drop function if exists public.submit_decision(text, text, text);

create or replace function public.submit_decision(
  p_plan_id text, p_decision text, p_remark text default null, p_approved_budget numeric default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employee_id text; v_role text; v_position text; v_old jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select employee_id, role, position into v_employee_id, v_role, v_position
  from public.profiles where id = v_uid and status = 'active';
  if v_employee_id is null then raise exception 'Account inactive or not found'; end if;

  if p_decision not in ('pending','approved','revise','rejected') then
    raise exception 'Invalid decision value: %', p_decision;
  end if;
  if p_decision in ('revise','rejected') and (p_remark is null or btrim(p_remark) = '') then
    raise exception 'Remark is required for revise/rejected decisions';
  end if;
  if p_approved_budget is not null and p_approved_budget < 0 then
    raise exception 'Approved budget cannot be negative';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'Plan % not found', p_plan_id;
  end if;

  select to_jsonb(d) into v_old from public.decisions d where plan_id = p_plan_id;

  if p_decision = 'pending' then
    delete from public.decisions where plan_id = p_plan_id;
  else
    insert into public.decisions (plan_id, reviewer_id, reviewer_employee_id, reviewer_position, decision, remark, approved_budget, reviewed_at)
    values (p_plan_id, v_uid, v_employee_id, v_position, p_decision, coalesce(p_remark, ''), p_approved_budget, now())
    on conflict (plan_id) do update
      set reviewer_id = excluded.reviewer_id, reviewer_employee_id = excluded.reviewer_employee_id,
          reviewer_position = excluded.reviewer_position, decision = excluded.decision,
          remark = excluded.remark, approved_budget = excluded.approved_budget, reviewed_at = excluded.reviewed_at;
  end if;

  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, old_value, new_value, note)
  values (v_uid, v_employee_id, v_role,
    case p_decision when 'approved' then 'Approved' when 'revise' then 'Revise Requested'
                     when 'rejected' then 'Rejected' else 'Reverted to Pending' end,
    'plan', p_plan_id, v_old, jsonb_build_object('decision', p_decision, 'remark', p_remark, 'approved_budget', p_approved_budget), p_remark);
end;
$$;
revoke execute on function public.submit_decision(text, text, text, numeric) from public;
revoke execute on function public.submit_decision(text, text, text, numeric) from anon;
grant execute on function public.submit_decision(text, text, text, numeric) to authenticated;
