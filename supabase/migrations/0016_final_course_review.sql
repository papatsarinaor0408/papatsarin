-- Adds a second, separate, locally-editable review decision for Approved
-- Data courses — distinct from final_courses.source_status (the อศค.
-- system's own import status, read-only). An Admin records their own
-- consideration here as one of 3 states via 3 small buttons in the table
-- row, plus a reset. Absence of a row means "no decision yet" (pending),
-- mirroring how the plans/decisions table already works.

create table public.final_course_reviews (
  course_id             text primary key references public.final_courses(id) on delete cascade,
  reviewer_id           uuid references public.profiles(id) on delete set null,
  reviewer_employee_id  text,
  reviewer_position     text,
  decision              text not null check (decision in ('approved','rejected','revise')),
  reviewed_at           timestamptz not null default now()
);

alter table public.final_course_reviews enable row level security;
create policy final_course_reviews_select on public.final_course_reviews
  for select to authenticated using (public.is_active_user());

create or replace function public.submit_final_course_review(
  p_course_id text, p_decision text
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

  insert into public.final_course_reviews (course_id, reviewer_id, reviewer_employee_id, reviewer_position, decision, reviewed_at)
  values (p_course_id, v_uid, v_employee_id, v_position, p_decision, now())
  on conflict (course_id) do update
    set reviewer_id = excluded.reviewer_id, reviewer_employee_id = excluded.reviewer_employee_id,
        reviewer_position = excluded.reviewer_position, decision = excluded.decision, reviewed_at = excluded.reviewed_at;

  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, new_value)
  values (v_uid, v_employee_id, v_role,
    case p_decision when 'approved' then 'Final Course Approved' when 'rejected' then 'Final Course Rejected' else 'Final Course Revise Requested' end,
    'final_course', p_course_id, jsonb_build_object('decision', p_decision));
end;
$$;
revoke execute on function public.submit_final_course_review(text, text) from public;
revoke execute on function public.submit_final_course_review(text, text) from anon;
grant execute on function public.submit_final_course_review(text, text) to authenticated;
