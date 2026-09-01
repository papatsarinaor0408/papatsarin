-- Decouples the remark from the decision on final_course_reviews so the UI
-- can offer them as two independent controls (a text column for the
-- remark, separate from the decision buttons) instead of one prompt tied
-- to clicking a decision button. decision becomes nullable — a row can now
-- exist holding only a remark with no decision set yet.

alter table public.final_course_reviews alter column decision drop not null;
alter table public.final_course_reviews drop constraint if exists final_course_reviews_decision_check;
alter table public.final_course_reviews add constraint final_course_reviews_decision_check
  check (decision is null or decision in ('approved','rejected','revise'));

create or replace function public.submit_final_course_review(
  p_course_id text, p_decision text, p_remark text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employee_id text; v_role text; v_position text;
  v_decision text;
  v_remark text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may set a final course review decision'; end if;
  select employee_id, role, position into v_employee_id, v_role, v_position
  from public.profiles where id = v_uid and status = 'active';
  if v_employee_id is null then raise exception 'Account inactive or not found'; end if;
  if not exists (select 1 from public.final_courses where id = p_course_id) then
    raise exception 'Course % not found', p_course_id;
  end if;

  v_decision := nullif(p_decision, 'pending');
  if v_decision is not null and v_decision not in ('approved','rejected','revise') then
    raise exception 'Invalid decision value: %', p_decision;
  end if;
  v_remark := coalesce(p_remark, '');

  -- ไม่มีทั้งผลพิจารณาและหมายเหตุเหลืออยู่แล้ว — ลบแถวทิ้งไปเลย
  if v_decision is null and v_remark = '' then
    delete from public.final_course_reviews where course_id = p_course_id;
    insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id)
    values (v_uid, v_employee_id, v_role, 'Final Course Review Reset', 'final_course', p_course_id);
    return;
  end if;

  insert into public.final_course_reviews (course_id, reviewer_id, reviewer_employee_id, reviewer_position, decision, remark, reviewed_at)
  values (p_course_id, v_uid, v_employee_id, v_position, v_decision, v_remark, now())
  on conflict (course_id) do update
    set reviewer_id = excluded.reviewer_id, reviewer_employee_id = excluded.reviewer_employee_id,
        reviewer_position = excluded.reviewer_position, decision = excluded.decision,
        remark = excluded.remark, reviewed_at = excluded.reviewed_at;

  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, new_value)
  values (v_uid, v_employee_id, v_role,
    case v_decision when 'approved' then 'Final Course Approved' when 'rejected' then 'Final Course Rejected'
                     when 'revise' then 'Final Course Revise Requested' else 'Final Course Remark Updated' end,
    'final_course', p_course_id, jsonb_build_object('decision', v_decision, 'remark', v_remark));
end;
$$;
-- signature unchanged from 0018 (p_course_id text, p_decision text, p_remark text) — create or replace is enough.
