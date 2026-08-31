-- Simplifies "Approved Data" to sheet 1 ("หลักสูตร") only. The other 3
-- sheets (target-by-name, target-by-unit, budget-by-level) turned out to
-- be unnecessary: once departments' duplicate course requests get merged
-- by the executive, the merged target-group names already live in the
-- หลักสูตร sheet's own free-text ชื่อกลุ่มเป้าหมาย column. Drops the 3 child
-- tables from migration 0013 and replaces the 5-arg import RPC with a
-- simpler 2-arg one. final_courses itself, its RLS policy, and
-- get_last_final_import_info() are untouched.

drop function if exists public.admin_import_final_data(jsonb, jsonb, jsonb, jsonb, text);

drop table if exists public.final_course_targets_by_name;
drop table if exists public.final_course_targets_by_unit;
drop table if exists public.final_course_budget;

-- 2 columns confirmed present in the หลักสูตร sheet (not in the original
-- sample file) — genuinely sheet-1 columns, so captured here.
alter table public.final_courses add column if not exists target_section text default '';
alter table public.final_courses add column if not exists target_division text default '';

create or replace function public.admin_import_final_data(
  p_courses jsonb, p_file_name text default null
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
        target_section = v_row->>'target_section', target_division = v_row->>'target_division',
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
        budget_total, budget_outsource, remark, creator_name, creator_unit, target_group_names_raw,
        target_section, target_division
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
        v_row->>'remark', v_row->>'creator_name', v_row->>'creator_unit', v_row->>'target_group_names_raw',
        v_row->>'target_section', v_row->>'target_division'
      );
      v_new_count := v_new_count + 1;
    end if;
  end loop;

  update public.final_courses set is_active = false, deactivated_at = now(), deactivated_by_batch = v_batch
  where is_active = true and not (id = any(v_ids));
  get diagnostics v_deactivated_count = row_count;

  insert into public.audit_logs (user_id, employee_id, role, actor_full_name, actor_position, action, target_type, target_id, new_value, note)
  values (v_uid, v_employee_id, v_role, v_full_name, v_position, 'Import Final Dataset', 'final_dataset', v_batch::text,
          jsonb_build_object('file_name', p_file_name, 'new_count', v_new_count, 'matched_count', v_matched_count,
                              'reactivated_count', v_reactivated_count, 'deactivated_count', v_deactivated_count,
                              'total_courses_in_file', jsonb_array_length(p_courses)),
          p_file_name);

  return query select v_new_count, v_matched_count, v_reactivated_count, v_deactivated_count;
end;
$$;
revoke execute on function public.admin_import_final_data(jsonb, text) from public;
revoke execute on function public.admin_import_final_data(jsonb, text) from anon;
grant execute on function public.admin_import_final_data(jsonb, text) to authenticated;
