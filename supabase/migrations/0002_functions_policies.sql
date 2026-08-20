create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin' and status = 'active');
$$;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;
revoke execute on function public.is_active_user() from public;
revoke execute on function public.is_active_user() from anon;
grant execute on function public.is_active_user() to authenticated;

-- Stable-identity fingerprint — creator_id + name_th + org-with-fallback.
-- NO date component (validated against real data: dates blank in 78% of
-- rows and did not resolve the one real collision found).
create or replace function public.compute_plan_stable_key(
  p_creator_id text, p_name_th text, p_section_name text, p_division_name text, p_dept_name text
)
returns text
language sql immutable
as $$
  select
    lower(trim(coalesce(p_creator_id,''))) || '|' ||
    regexp_replace(lower(trim(coalesce(p_name_th,''))), '\s+', ' ', 'g') || '|' ||
    lower(trim(coalesce(
      nullif(trim(coalesce(p_section_name,'')),''),
      nullif(trim(coalesce(p_division_name,'')),''),
      nullif(trim(coalesce(p_dept_name,'')),''),
      ''
    )));
$$;
revoke execute on function public.compute_plan_stable_key(text,text,text,text,text) from public;
revoke execute on function public.compute_plan_stable_key(text,text,text,text,text) from anon;
grant execute on function public.compute_plan_stable_key(text,text,text,text,text) to authenticated;

-- submit_decision: the only way decisions get written. Model A — one shared
-- row per plan_id, upserted; old/new snapshot always audit-logged.
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

create or replace function public.mark_password_changed()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.profiles set must_change_password = false, updated_at = now() where id = v_uid;
  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id)
  select v_uid, employee_id, role, 'Password Changed', 'account', employee_id from public.profiles where id = v_uid;
end;
$$;
revoke execute on function public.mark_password_changed() from public;
revoke execute on function public.mark_password_changed() from anon;
grant execute on function public.mark_password_changed() to authenticated;

-- admin_import_dataset — two explicit passes (validate-all-then-apply), hard
-- rejection on duplicate/missing identity fields, reactivation of historical
-- (previously inactive) matched plans, never deletes plans/decisions/audit_logs.
create or replace function public.admin_import_dataset(p_rows jsonb, p_file_name text default null)
returns table(
  new_count integer, matched_count integer, reactivated_count integer,
  deactivated_count integer, import_batch_id uuid
)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employee_id text; v_role text;
  v_batch uuid := gen_random_uuid();
  v_row jsonb;
  v_idx integer := 0;
  v_key text;
  v_keys text[] := '{}';
  v_blank_report jsonb := '[]'::jsonb;
  v_dup_report jsonb;
  v_existing_id text;
  v_existing_active boolean;
  v_new_count integer := 0;
  v_matched_count integer := 0;
  v_reactivated_count integer := 0;
  v_deactivated_count integer := 0;
  v_creator_id text; v_name_th text; v_section text; v_division text; v_dept text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may import/replace the dataset'; end if;
  select employee_id, role into v_employee_id, v_role from public.profiles where id = v_uid;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'Cannot import an empty dataset'; end if;

  -- ===== PASS 1: VALIDATE ONLY — no writes to plans/decisions/audit_logs here =====
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_creator_id := v_row->>'creator_id';
    v_name_th    := v_row->>'name_th';
    v_section    := v_row->>'section_name';
    v_division   := v_row->>'division_name';
    v_dept       := v_row->>'dept_name';

    if coalesce(trim(v_creator_id),'') = '' or coalesce(trim(v_name_th),'') = '' then
      v_blank_report := v_blank_report || jsonb_build_object(
        'row_index', v_idx, 'name_th', v_name_th, 'creator_id', v_creator_id,
        'reason', 'creator_id or name_th is blank'
      );
    elsif coalesce(nullif(trim(v_section),''), nullif(trim(v_division),''), nullif(trim(v_dept),'')) is null then
      v_blank_report := v_blank_report || jsonb_build_object(
        'row_index', v_idx, 'name_th', v_name_th, 'creator_id', v_creator_id,
        'reason', 'section_name, division_name, and dept_name are all blank'
      );
    end if;

    v_key := public.compute_plan_stable_key(v_creator_id, v_name_th, v_section, v_division, v_dept);
    v_keys := array_append(v_keys, v_key);
  end loop;

  if jsonb_array_length(v_blank_report) > 0 then
    raise exception 'IMPORT_VALIDATION_FAILED: % row(s) missing required identity fields', jsonb_array_length(v_blank_report)
      using detail = v_blank_report::text, errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object('stable_key', k, 'row_indexes', idxs))
  into v_dup_report
  from (
    select k, array_agg(rn) as idxs
    from unnest(v_keys) with ordinality as u(k, rn)
    group by k
    having count(*) > 1
  ) dup;

  if v_dup_report is not null and jsonb_array_length(v_dup_report) > 0 then
    raise exception 'IMPORT_VALIDATION_FAILED: % duplicate plan identity group(s) within this file', jsonb_array_length(v_dup_report)
      using detail = v_dup_report::text, errcode = 'P0001';
  end if;

  -- ===== PASS 2: APPLY — only reached if Pass 1 raised nothing =====
  v_idx := 0;
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_key := v_keys[v_idx];

    select id, is_active into v_existing_id, v_existing_active from public.plans where stable_key = v_key;

    if v_existing_id is not null then
      update public.plans set
        name_th = v_row->>'name_th', name_en = v_row->>'name_en', source_status = v_row->>'source_status',
        responds_to = v_row->>'responds_to', course_type = v_row->>'course_type', input_factor = v_row->>'input_factor',
        strategy = v_row->>'strategy', project_plan = v_row->>'project_plan', master_plan = v_row->>'master_plan',
        org_necessity = v_row->>'org_necessity', rationale = v_row->>'rationale', objective = v_row->>'objective',
        skills_gained = v_row->>'skills_gained', outcome = v_row->>'outcome', kpi = v_row->>'kpi',
        delivery_type = v_row->>'delivery_type', learning_format = v_row->>'learning_format',
        internal_instructor = v_row->>'internal_instructor', external_instructor = v_row->>'external_instructor',
        overseas_location = v_row->>'overseas_location',
        days = nullif(v_row->>'days','')::numeric, participants = nullif(v_row->>'participants','')::numeric,
        start_date = v_row->>'start_date', end_date = v_row->>'end_date', coordinator = v_row->>'coordinator',
        budget_total = nullif(v_row->>'budget_total','')::numeric, budget_outsource = nullif(v_row->>'budget_outsource','')::numeric,
        remark = v_row->>'remark', creator_name = v_row->>'creator_name', creator_id = v_row->>'creator_id',
        creator_position = v_row->>'creator_position', section_name = v_row->>'section_name',
        division_name = v_row->>'division_name', dept_name = v_row->>'dept_name',
        target_group_names = v_row->>'target_group_names', target_positions = v_row->>'target_positions',
        target_section = v_row->>'target_section', target_division = v_row->>'target_division', target_dept = v_row->>'target_dept',
        is_active = true, last_seen_batch_id = v_batch, deactivated_at = null, deactivated_by_batch = null
      where id = v_existing_id;

      if v_existing_active then
        v_matched_count := v_matched_count + 1;
      else
        v_reactivated_count := v_reactivated_count + 1;
      end if;
    else
      insert into public.plans (
        id, stable_key, is_active, first_seen_batch_id, last_seen_batch_id, created_by,
        name_th, name_en, source_status, responds_to, course_type, input_factor,
        strategy, project_plan, master_plan, org_necessity, rationale, objective,
        skills_gained, outcome, kpi, delivery_type, learning_format,
        internal_instructor, external_instructor, overseas_location,
        days, participants, start_date, end_date, coordinator,
        budget_total, budget_outsource, remark,
        creator_name, creator_id, creator_position,
        section_name, division_name, dept_name,
        target_group_names, target_positions, target_section, target_division, target_dept
      ) values (
        'PLAN-' || lpad(nextval('public.plans_id_seq')::text, 5, '0'),
        v_key, true, v_batch, v_batch, v_uid,
        v_row->>'name_th', v_row->>'name_en', v_row->>'source_status', v_row->>'responds_to', v_row->>'course_type', v_row->>'input_factor',
        v_row->>'strategy', v_row->>'project_plan', v_row->>'master_plan', v_row->>'org_necessity', v_row->>'rationale', v_row->>'objective',
        v_row->>'skills_gained', v_row->>'outcome', v_row->>'kpi', v_row->>'delivery_type', v_row->>'learning_format',
        v_row->>'internal_instructor', v_row->>'external_instructor', v_row->>'overseas_location',
        nullif(v_row->>'days','')::numeric, nullif(v_row->>'participants','')::numeric, v_row->>'start_date', v_row->>'end_date', v_row->>'coordinator',
        nullif(v_row->>'budget_total','')::numeric, nullif(v_row->>'budget_outsource','')::numeric, v_row->>'remark',
        v_row->>'creator_name', v_row->>'creator_id', v_row->>'creator_position',
        v_row->>'section_name', v_row->>'division_name', v_row->>'dept_name',
        v_row->>'target_group_names', v_row->>'target_positions', v_row->>'target_section', v_row->>'target_division', v_row->>'target_dept'
      );
      v_new_count := v_new_count + 1;
    end if;
  end loop;

  update public.plans set is_active = false, deactivated_at = now(), deactivated_by_batch = v_batch
  where is_active = true and not (stable_key = any(v_keys));
  get diagnostics v_deactivated_count = row_count;

  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, new_value, note)
  values (v_uid, v_employee_id, v_role, 'Import Dataset', 'dataset', v_batch::text,
          jsonb_build_object('file_name', p_file_name, 'new_count', v_new_count, 'matched_count', v_matched_count,
                              'reactivated_count', v_reactivated_count, 'deactivated_count', v_deactivated_count,
                              'total_rows_in_file', jsonb_array_length(p_rows)),
          p_file_name);

  return query select v_new_count, v_matched_count, v_reactivated_count, v_deactivated_count, v_batch;
end;
$$;
revoke execute on function public.admin_import_dataset(jsonb, text) from public;
revoke execute on function public.admin_import_dataset(jsonb, text) from anon;
grant execute on function public.admin_import_dataset(jsonb, text) to authenticated;

create or replace function public.admin_reset_all_decisions()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_employee_id text; v_role text; v_count integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may reset all decisions'; end if;
  select employee_id, role into v_employee_id, v_role from public.profiles where id = v_uid;
  delete from public.decisions;
  get diagnostics v_count = row_count;
  insert into public.audit_logs (user_id, employee_id, role, action, target_type, note)
  values (v_uid, v_employee_id, v_role, 'Reset All Decisions', 'dataset', format('%s decisions cleared', v_count));
  return v_count;
end;
$$;
revoke execute on function public.admin_reset_all_decisions() from public;
revoke execute on function public.admin_reset_all_decisions() from anon;
grant execute on function public.admin_reset_all_decisions() to authenticated;

create or replace function public.admin_set_account_status(p_employee_id text, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_admin_employee_id text; v_admin_role text; v_target_id uuid; v_old jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only Admin may change account status'; end if;
  if p_employee_id = '596203' then raise exception 'Cannot deactivate the Admin account'; end if;
  select employee_id, role into v_admin_employee_id, v_admin_role from public.profiles where id = v_uid;
  select id, to_jsonb(p) into v_target_id, v_old from public.profiles p where employee_id = p_employee_id;
  if v_target_id is null then raise exception 'No account with employee_id %', p_employee_id; end if;
  update public.profiles set status = case when p_active then 'active' else 'inactive' end, updated_at = now()
  where id = v_target_id;
  insert into public.audit_logs (user_id, employee_id, role, action, target_type, target_id, old_value, new_value)
  values (v_uid, v_admin_employee_id, v_admin_role, 'Set Account Status', 'account', p_employee_id, v_old,
          jsonb_build_object('status', case when p_active then 'active' else 'inactive' end));
end;
$$;
revoke execute on function public.admin_set_account_status(text, boolean) from public;
revoke execute on function public.admin_set_account_status(text, boolean) from anon;
grant execute on function public.admin_set_account_status(text, boolean) to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

create policy plans_select on public.plans
  for select to authenticated
  using (public.is_active_user() and (is_active = true or public.is_admin()));

create policy decisions_select on public.decisions
  for select to authenticated
  using (
    public.is_active_user() and (
      public.is_admin()
      or exists (select 1 from public.plans p where p.id = decisions.plan_id and p.is_active = true)
    )
  );

create policy audit_logs_select_admin_only on public.audit_logs
  for select to authenticated using (public.is_admin());
