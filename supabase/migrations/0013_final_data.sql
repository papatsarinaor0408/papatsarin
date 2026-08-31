-- "ข้อมูลไฟนอล" — a brand-new, independent dataset: the multi-sheet
-- workbook exported from the central อศค. tracking system after a course
-- has been manually re-keyed there (real stable IDs like TN-0313, not the
-- computed stable_key this app uses for `plans`). Four tables mirror the
-- workbook's four sheets 1:1. This is purely additive — no existing
-- table, function, or policy is modified.

-- final_courses: one row per course from the "หลักสูตร" sheet. `id` is the
-- workbook's own real ID, so — unlike `plans` — no stable-key hashing is
-- needed to detect "is this the same course as before".
create table public.final_courses (
  id                     text primary key,
  is_active              boolean not null default true,
  first_seen_batch_id    uuid not null,
  last_seen_batch_id     uuid not null,
  deactivated_at         timestamptz,
  deactivated_by_batch   uuid,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),

  deputy_line            text default '',
  assistant_governor     text default '',
  dept_name              text default '',
  working_group          text default '',
  name_th                text not null default '',
  name_en                text default '',
  source_status          text default '',
  responds_to            text default '',
  course_type            text default '',
  input_factor           text default '',
  strategy               text default '',
  project_plan           text default '',
  master_plan            text default '',
  tech_competency_23     text default '',
  tech_competency_66     text default '',
  legal_quality_safety   text default '',
  org_necessity          text default '',
  rationale              text default '',
  objective              text default '',
  skills_gained          text default '',
  outcome                text default '',
  kpi                    text default '',
  delivery_type          text default '',
  learning_format        text default '',
  internal_instructor    text default '',
  external_instructor    text default '',
  overseas_location      text default '',
  days                   numeric,
  participants           numeric,
  start_date             text default '',
  end_date               text default '',
  coordinator            text default '',
  budget_total           numeric,
  budget_outsource       numeric,
  remark                 text default '',
  creator_name           text default '',
  creator_unit           text default '',
  target_group_names_raw text default ''
);
create index idx_final_courses_active on public.final_courses (is_active);

-- final_course_targets_by_name: "กลุ่มเป้าหมายตามรายชื่อ" — one row per
-- named participant per course (structured, unlike the free-text
-- target_group_names column elsewhere in this app).
create table public.final_course_targets_by_name (
  id           bigint generated always as identity primary key,
  course_id    text not null references public.final_courses(id) on delete cascade,
  employee_id  text default '',
  full_name    text default '',
  position     text default '',
  unit         text default ''
);
create index idx_fctn_course on public.final_course_targets_by_name (course_id);

-- final_course_targets_by_unit: "กลุ่มเป้าหมายตามหน่วยงาน" — one row per
-- target org-unit per course.
create table public.final_course_targets_by_unit (
  id            bigint generated always as identity primary key,
  course_id     text not null references public.final_courses(id) on delete cascade,
  line_deputy   text default '',
  assistant     text default '',
  dept_name     text default '',
  division_name text default '',
  remark        text default ''
);
create index idx_fctu_course on public.final_course_targets_by_unit (course_id);

-- final_course_budget: "งบประมาณ" — per-employee-level budget breakdown.
create table public.final_course_budget (
  id                bigint generated always as identity primary key,
  course_id         text not null references public.final_courses(id) on delete cascade,
  level             text default '',
  days              numeric,
  per_diem          numeric,
  participants      numeric,
  accommodation     numeric,
  transport         numeric,
  airfare           numeric,
  passport_fee      numeric,
  visa_fee          numeric,
  travel_insurance  numeric,
  comms_cost        numeric,
  registration_fee  numeric,
  per_head_summary  numeric,
  total             numeric
);
create index idx_fcb_course on public.final_course_budget (course_id);

alter table public.final_courses enable row level security;
alter table public.final_course_targets_by_name enable row level security;
alter table public.final_course_targets_by_unit enable row level security;
alter table public.final_course_budget enable row level security;

create policy final_courses_select on public.final_courses
  for select to authenticated
  using (public.is_active_user() and (is_active = true or public.is_admin()));

create policy final_course_targets_by_name_select on public.final_course_targets_by_name
  for select to authenticated using (public.is_active_user());

create policy final_course_targets_by_unit_select on public.final_course_targets_by_unit
  for select to authenticated using (public.is_active_user());

create policy final_course_budget_select on public.final_course_budget
  for select to authenticated using (public.is_active_user());

-- admin_import_final_data — validate-then-apply, upsert final_courses
-- directly by its real id (no stable_key hashing needed), soft-deactivate
-- courses missing from the new file (never a real DELETE, same convention
-- as admin_import_dataset), then FULLY REPLACE the 3 child detail tables
-- for this batch's course ids (they carry no independent identity/history
-- worth preserving across re-imports, unlike final_courses itself).
create or replace function public.admin_import_final_data(
  p_courses jsonb, p_targets_by_name jsonb, p_targets_by_unit jsonb, p_budget jsonb,
  p_file_name text default null
)
returns table(
  new_count integer, matched_count integer, reactivated_count integer, deactivated_count integer
)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employee_id text; v_role text; v_position text; v_full_name text;
  v_batch uuid := gen_random_uuid();
  v_row jsonb;
  v_id text;
  v_ids text[] := '{}';
  v_dup_ids text[];
  v_existing_active boolean;
  v_new_count integer := 0;
  v_matched_count integer := 0;
  v_reactivated_count integer := 0;
  v_deactivated_count integer := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may import the final dataset'; end if;
  select employee_id, role, position, full_name into v_employee_id, v_role, v_position, v_full_name
  from public.profiles where id = v_uid;

  if p_courses is null or jsonb_typeof(p_courses) <> 'array' or jsonb_array_length(p_courses) = 0 then
    raise exception 'Cannot import an empty final dataset';
  end if;

  -- ===== PASS 1: VALIDATE ONLY =====
  for v_row in select * from jsonb_array_elements(p_courses) loop
    if coalesce(trim(v_row->>'id'), '') = '' or coalesce(trim(v_row->>'name_th'), '') = '' then
      raise exception 'IMPORT_VALIDATION_FAILED: every row in the หลักสูตร sheet needs an ID and course name'
        using errcode = 'P0001';
    end if;
    v_ids := array_append(v_ids, trim(v_row->>'id'));
  end loop;

  select array_agg(dup_id) into v_dup_ids from (
    select dup_id from unnest(v_ids) as dup_id group by dup_id having count(*) > 1
  ) d;
  if v_dup_ids is not null and array_length(v_dup_ids, 1) > 0 then
    raise exception 'IMPORT_VALIDATION_FAILED: duplicate ID(s) in this file: %', array_to_string(v_dup_ids, ', ')
      using errcode = 'P0001';
  end if;

  -- ===== PASS 2: APPLY — only reached if Pass 1 raised nothing =====
  for v_row in select * from jsonb_array_elements(p_courses) loop
    v_id := trim(v_row->>'id');
    select is_active into v_existing_active from public.final_courses where id = v_id;

    if found then
      update public.final_courses set
        deputy_line = v_row->>'deputy_line', assistant_governor = v_row->>'assistant_governor',
        dept_name = v_row->>'dept_name', working_group = v_row->>'working_group',
        name_th = v_row->>'name_th', name_en = v_row->>'name_en', source_status = v_row->>'source_status',
        responds_to = v_row->>'responds_to', course_type = v_row->>'course_type', input_factor = v_row->>'input_factor',
        strategy = v_row->>'strategy', project_plan = v_row->>'project_plan', master_plan = v_row->>'master_plan',
        tech_competency_23 = v_row->>'tech_competency_23', tech_competency_66 = v_row->>'tech_competency_66',
        legal_quality_safety = v_row->>'legal_quality_safety', org_necessity = v_row->>'org_necessity',
        rationale = v_row->>'rationale', objective = v_row->>'objective', skills_gained = v_row->>'skills_gained',
        outcome = v_row->>'outcome', kpi = v_row->>'kpi', delivery_type = v_row->>'delivery_type',
        learning_format = v_row->>'learning_format', internal_instructor = v_row->>'internal_instructor',
        external_instructor = v_row->>'external_instructor', overseas_location = v_row->>'overseas_location',
        days = nullif(v_row->>'days','')::numeric, participants = nullif(v_row->>'participants','')::numeric,
        start_date = v_row->>'start_date', end_date = v_row->>'end_date', coordinator = v_row->>'coordinator',
        budget_total = nullif(v_row->>'budget_total','')::numeric, budget_outsource = nullif(v_row->>'budget_outsource','')::numeric,
        remark = v_row->>'remark', creator_name = v_row->>'creator_name', creator_unit = v_row->>'creator_unit',
        target_group_names_raw = v_row->>'target_group_names_raw',
        is_active = true, last_seen_batch_id = v_batch, deactivated_at = null, deactivated_by_batch = null
      where id = v_id;
      if v_existing_active then v_matched_count := v_matched_count + 1; else v_reactivated_count := v_reactivated_count + 1; end if;
    else
      insert into public.final_courses (
        id, is_active, first_seen_batch_id, last_seen_batch_id, created_by,
        deputy_line, assistant_governor, dept_name, working_group, name_th, name_en, source_status,
        responds_to, course_type, input_factor, strategy, project_plan, master_plan,
        tech_competency_23, tech_competency_66, legal_quality_safety, org_necessity, rationale, objective,
        skills_gained, outcome, kpi, delivery_type, learning_format, internal_instructor, external_instructor,
        overseas_location, days, participants, start_date, end_date, coordinator,
        budget_total, budget_outsource, remark, creator_name, creator_unit, target_group_names_raw
      ) values (
        v_id, true, v_batch, v_batch, v_uid,
        v_row->>'deputy_line', v_row->>'assistant_governor', v_row->>'dept_name', v_row->>'working_group',
        v_row->>'name_th', v_row->>'name_en', v_row->>'source_status', v_row->>'responds_to', v_row->>'course_type',
        v_row->>'input_factor', v_row->>'strategy', v_row->>'project_plan', v_row->>'master_plan',
        v_row->>'tech_competency_23', v_row->>'tech_competency_66', v_row->>'legal_quality_safety',
        v_row->>'org_necessity', v_row->>'rationale', v_row->>'objective', v_row->>'skills_gained',
        v_row->>'outcome', v_row->>'kpi', v_row->>'delivery_type', v_row->>'learning_format',
        v_row->>'internal_instructor', v_row->>'external_instructor', v_row->>'overseas_location',
        nullif(v_row->>'days','')::numeric, nullif(v_row->>'participants','')::numeric,
        v_row->>'start_date', v_row->>'end_date', v_row->>'coordinator',
        nullif(v_row->>'budget_total','')::numeric, nullif(v_row->>'budget_outsource','')::numeric,
        v_row->>'remark', v_row->>'creator_name', v_row->>'creator_unit', v_row->>'target_group_names_raw'
      );
      v_new_count := v_new_count + 1;
    end if;
  end loop;

  update public.final_courses set is_active = false, deactivated_at = now(), deactivated_by_batch = v_batch
  where is_active = true and not (id = any(v_ids));
  get diagnostics v_deactivated_count = row_count;

  -- Child detail tables: full replace, scoped to this batch's course ids.
  delete from public.final_course_targets_by_name where course_id = any(v_ids);
  delete from public.final_course_targets_by_unit where course_id = any(v_ids);
  delete from public.final_course_budget where course_id = any(v_ids);

  insert into public.final_course_targets_by_name (course_id, employee_id, full_name, position, unit)
  select v_row->>'course_id', v_row->>'employee_id', v_row->>'full_name', v_row->>'position', v_row->>'unit'
  from jsonb_array_elements(coalesce(p_targets_by_name, '[]'::jsonb)) v_row
  where coalesce(trim(v_row->>'course_id'), '') <> '';

  insert into public.final_course_targets_by_unit (course_id, line_deputy, assistant, dept_name, division_name, remark)
  select v_row->>'course_id', v_row->>'line_deputy', v_row->>'assistant', v_row->>'dept_name', v_row->>'division_name', v_row->>'remark'
  from jsonb_array_elements(coalesce(p_targets_by_unit, '[]'::jsonb)) v_row
  where coalesce(trim(v_row->>'course_id'), '') <> '';

  insert into public.final_course_budget (
    course_id, level, days, per_diem, participants, accommodation, transport, airfare,
    passport_fee, visa_fee, travel_insurance, comms_cost, registration_fee, per_head_summary, total
  )
  select v_row->>'course_id', v_row->>'level',
    nullif(v_row->>'days','')::numeric, nullif(v_row->>'per_diem','')::numeric, nullif(v_row->>'participants','')::numeric,
    nullif(v_row->>'accommodation','')::numeric, nullif(v_row->>'transport','')::numeric, nullif(v_row->>'airfare','')::numeric,
    nullif(v_row->>'passport_fee','')::numeric, nullif(v_row->>'visa_fee','')::numeric, nullif(v_row->>'travel_insurance','')::numeric,
    nullif(v_row->>'comms_cost','')::numeric, nullif(v_row->>'registration_fee','')::numeric,
    nullif(v_row->>'per_head_summary','')::numeric, nullif(v_row->>'total','')::numeric
  from jsonb_array_elements(coalesce(p_budget, '[]'::jsonb)) v_row
  where coalesce(trim(v_row->>'course_id'), '') <> '';

  insert into public.audit_logs (user_id, employee_id, role, actor_full_name, actor_position, action, target_type, target_id, new_value, note)
  values (v_uid, v_employee_id, v_role, v_full_name, v_position, 'Import Final Dataset', 'final_dataset', v_batch::text,
          jsonb_build_object('file_name', p_file_name, 'new_count', v_new_count, 'matched_count', v_matched_count,
                              'reactivated_count', v_reactivated_count, 'deactivated_count', v_deactivated_count,
                              'total_courses_in_file', jsonb_array_length(p_courses)),
          p_file_name);

  return query select v_new_count, v_matched_count, v_reactivated_count, v_deactivated_count;
end;
$$;
revoke execute on function public.admin_import_final_data(jsonb, jsonb, jsonb, jsonb, text) from public;
revoke execute on function public.admin_import_final_data(jsonb, jsonb, jsonb, jsonb, text) from anon;
grant execute on function public.admin_import_final_data(jsonb, jsonb, jsonb, jsonb, text) to authenticated;

-- get_last_final_import_info — mirrors get_last_import_info(), scoped to
-- the final-dataset import action, exposed to all authenticated users.
create or replace function public.get_last_final_import_info()
returns table(imported_at timestamptz, file_name text)
language sql security definer set search_path = public
as $$
  select created_at, note
  from public.audit_logs
  where action = 'Import Final Dataset'
  order by created_at desc
  limit 1;
$$;
revoke execute on function public.get_last_final_import_info() from public;
revoke execute on function public.get_last_final_import_info() from anon;
grant execute on function public.get_last_final_import_info() to authenticated;
