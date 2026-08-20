-- profiles: one row per EGAT employee/authenticated user, 1:1 with auth.users.
-- Does NOT store dob or password — dob is only ever used transiently during
-- one-time account seeding (Edge Function), never persisted.
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  employee_id           text not null unique,
  full_name             text not null,
  position              text not null,
  department            text,
  role                  text not null check (role in ('Admin','Reviewer')),
  status                text not null default 'active' check (status in ('active','inactive')),
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.profiles is
  'Authenticated EGAT users. UI displays position (not full_name) per spec; full_name kept for audit only.';

create sequence public.plans_id_seq;

-- plans: mirrors schema.js FIELDS 1:1 in meaning. Adds stable-identity /
-- versioning columns so re-imports upsert instead of destroying history.
create table public.plans (
  id                    text primary key,
  stable_key            text not null,
  is_active             boolean not null default true,
  first_seen_batch_id   uuid not null,
  last_seen_batch_id    uuid not null,
  deactivated_at        timestamptz,
  deactivated_by_batch  uuid,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),

  name_th               text not null default '',
  name_en               text default '',
  source_status         text default '',
  responds_to           text default '',
  course_type           text default '',
  input_factor          text default '',
  strategy              text default '',
  project_plan          text default '',
  master_plan           text default '',
  org_necessity         text default '',
  rationale             text default '',
  objective             text default '',
  skills_gained         text default '',
  outcome               text default '',
  kpi                   text default '',
  delivery_type         text default '',
  learning_format       text default '',
  internal_instructor   text default '',
  external_instructor   text default '',
  overseas_location     text default '',
  days                  numeric,
  participants          numeric,
  start_date            text default '',
  end_date              text default '',
  coordinator           text default '',
  budget_total          numeric,
  budget_outsource      numeric,
  remark                text default '',
  creator_name          text default '',
  creator_id            text default '',
  creator_position      text default '',
  section_name          text default '',
  division_name         text default '',
  dept_name             text default '',
  target_group_names    text default '',
  target_positions      text default '',
  target_section        text default '',
  target_division       text default '',
  target_dept           text default ''
);
create unique index idx_plans_stable_key on public.plans (stable_key);
create index idx_plans_active   on public.plans (is_active);
create index idx_plans_dept     on public.plans (dept_name);
create index idx_plans_division on public.plans (division_name);
create index idx_plans_section  on public.plans (section_name);

-- decisions: ONE ROW PER PLAN — Model A, confirmed by user (one shared,
-- organization-wide current decision; full history lives in audit_logs).
create table public.decisions (
  plan_id               text primary key references public.plans(id) on delete cascade,
  reviewer_id           uuid references public.profiles(id) on delete set null,
  reviewer_employee_id  text,
  reviewer_position     text,
  decision              text not null default 'pending'
                         check (decision in ('pending','approved','revise','rejected')),
  remark                text default '',
  reviewed_at           timestamptz
);
create index idx_decisions_reviewer on public.decisions (reviewer_id);

-- audit_logs: never trusts browser time; never contains raw passwords;
-- rows for a plan are NEVER deleted even after that plan is deactivated.
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid references public.profiles(id) on delete set null,
  employee_id  text,
  role         text,
  action       text not null,
  target_type  text,
  target_id    text,
  old_value    jsonb,
  new_value    jsonb,
  note         text,
  created_at   timestamptz not null default now()
);
create index idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index idx_audit_logs_user       on public.audit_logs (user_id);

alter table public.profiles   enable row level security;
alter table public.plans      enable row level security;
alter table public.decisions  enable row level security;
alter table public.audit_logs enable row level security;
