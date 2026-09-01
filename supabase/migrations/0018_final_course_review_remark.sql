-- Adds an optional remark to each Approved Data course's review decision
-- (final_course_reviews, added in 0016) — for cases where the Admin needs
-- to note something alongside เห็นชอบ/ไม่เห็นชอบ/ให้ปรับปรุงข้อมูล.

alter table public.final_course_reviews add column if not exists remark text default '';

-- create or replace can't change a function's parameter list — drop the
-- old 2-arg signature first (same reason 0011 had to drop submit_decision
-- before adding its own 4th param).
drop function if exists public.submit_final_course_review(text, text);

create or replace function public.submit_final_course_review(
  p_course_id text, p_decision text, p_remark text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employee_id text; v_role text; v_position text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may set a final course review decision'; end if;
  select employee_id, role, position into v_employee_id, v_role, v_position
  from public.profiles where id = v_uid and status = 'active';
  if v_employee_id is null then raise exception 'Account inactive or not found'; end if;
  if not exists (select 1 from public.final_courses where id = p_course_id) then
    raise exception 'Course % not found', p_course_id;
  end if;

  if p_decision is null or p_decision = 'pending' then
    delete from public.final_course_reviews where course_id = p_course_id;
    insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id)
    values (v_uid, v_employee_id, v_role, 'Final Course Review Reset', 'final_course', p_course_id);
    return;
  end if;

  if p_decision not in ('approved','rejected','revise') then
    raise exception 'Invalid decision value: %', p_decision;
  end if;

  insert into public.final_course_reviews (course_id, reviewer_id, reviewer_employee_id, reviewer_position, decision, remark, reviewed_at)
  values (p_course_id, v_uid, v_employee_id, v_position, p_decision, coalesce(p_remark, ''), now())
  on conflict (course_id) do update
    set reviewer_id = excluded.reviewer_id, reviewer_employee_id = excluded.reviewer_employee_id,
        reviewer_position = excluded.reviewer_position, decision = excluded.decision,
        remark = excluded.remark, reviewed_at = excluded.reviewed_at;

  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, new_value)
  values (v_uid, v_employee_id, v_role,
    case p_decision when 'approved' then 'Final Course Approved' when 'rejected' then 'Final Course Rejected' else 'Final Course Revise Requested' end,
    'final_course', p_course_id, jsonb_build_object('decision', p_decision, 'remark', p_remark));
end;
$$;
revoke execute on function public.submit_final_course_review(text, text, text) from public;
revoke execute on function public.submit_final_course_review(text, text, text) from anon;
grant execute on function public.submit_final_course_review(text, text, text) to authenticated;
