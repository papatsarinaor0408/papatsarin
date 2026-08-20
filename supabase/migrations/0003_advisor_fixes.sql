-- Fix: compute_plan_stable_key had a mutable search_path.
create or replace function public.compute_plan_stable_key(
  p_creator_id text, p_name_th text, p_section_name text, p_division_name text, p_dept_name text
)
returns text
language sql immutable set search_path = public
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

-- Fix: rls_auto_enable is a project-managed event-trigger function (from the
-- "Enable automatic RLS" project setting) that should only fire via the DDL
-- event trigger, never be callable as a public RPC endpoint.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

-- Fix: wrap auth.uid() in (select ...) so it's evaluated once per query,
-- not once per row (performance advisor).
drop policy profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());

-- Fix: missing covering index on plans.created_by foreign key.
create index idx_plans_created_by on public.plans (created_by);
