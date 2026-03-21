create table if not exists public.validation_targets (
  id uuid primary key default gen_random_uuid(),
  hostname text not null,
  normalized_url text not null,
  source text not null default 'tranco',
  tranco_rank integer,
  rank_band text,
  active boolean not null default true,
  denylisted boolean not null default false,
  deny_reason text,
  cooldown_until timestamptz,
  backoff_until timestamptz,
  last_run_at timestamptz,
  last_completed_at timestamptz,
  last_status text,
  last_error text,
  failure_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (hostname)
);

create table if not exists public.validation_settings (
  singleton boolean primary key default true,
  pipeline_enabled boolean not null default true,
  run_mode text not null default 'manual' check (run_mode in ('manual', 'automatic')),
  automatic_interval_minutes integer not null default 20 check (automatic_interval_minutes between 5 and 240),
  operator_note text,
  last_tranco_sync_at timestamptz,
  last_scheduled_at timestamptz,
  next_due_at timestamptz,
  updated_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (singleton)
);

create table if not exists public.validation_runs (
  id uuid primary key default gen_random_uuid(),
  validation_target_id uuid references public.validation_targets (id) on delete set null,
  scan_id uuid references public.scans (id) on delete set null,
  hostname text not null,
  normalized_url text not null,
  tranco_rank integer,
  rank_band text,
  trigger_mode text not null check (trigger_mode in ('manual', 'automatic')),
  status text not null check (status in ('queued', 'collecting', 'ranking', 'validating', 'completed', 'failed')),
  finding_count integer not null default 0,
  reviewed_finding_count integer not null default 0,
  average_agreement_score numeric(6,2),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.validation_run_findings (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null references public.validation_runs (id) on delete cascade,
  category text not null,
  subtype text,
  rule_key text not null,
  title text not null,
  description text not null,
  severity text not null,
  page_url text,
  finding_rank integer not null,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.validation_verdicts (
  id uuid primary key default gen_random_uuid(),
  validation_run_finding_id uuid not null unique references public.validation_run_findings (id) on delete cascade,
  verdict text not null check (verdict in ('supported', 'inconclusive', 'not_supported')),
  confidence real not null default 0,
  rationale text not null,
  agreement_score integer not null check (agreement_score in (0, 50, 100)),
  model text not null,
  prompt_version text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.validation_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id) on delete set null,
  event_type text not null,
  reason text,
  previous_value_json jsonb,
  next_value_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.validation_run_findings
  add column if not exists finding_family text,
  add column if not exists finding_source text,
  add column if not exists finding_scope text,
  add column if not exists finding_subject text;

update public.validation_run_findings
set
  finding_family = case
    when rule_key like 'scan_report_review.%' or subtype = 'policy_review_queue' then 'policy_review_queue'
    when rule_key like 'section_review.%' then 'policy_section_review'
    when rule_key like 'accessibility_review.%' then 'accessibility_review'
    else coalesce(finding_family, category)
  end,
  finding_source = case
    when rule_key like 'scan_report_review.%' or subtype = 'policy_review_queue' then 'policy_review_queue'
    when rule_key like 'section_review.%' then 'policy_enrichment'
    when rule_key like 'accessibility_review.%' then 'snapshot_accessibility'
    else coalesce(finding_source, 'unknown')
  end,
  finding_scope = case
    when rule_key like 'accessibility_review.%' then 'site'
    when rule_key like 'scan_report_review.%' or rule_key like 'section_review.%' then 'page'
    else coalesce(finding_scope, 'unknown')
  end,
  finding_subject = case
    when rule_key like 'scan_report_review.%' then 'disclosure'
    when rule_key like 'section_review.%' then 'privacy'
    when rule_key like 'accessibility_review.%' then 'accessibility'
    else coalesce(finding_subject, 'unknown')
  end
where
  finding_family is null
  or finding_source is null
  or finding_scope is null
  or finding_subject is null;

alter table public.validation_verdicts
  add column if not exists system_confidence_score real,
  add column if not exists system_confidence_band text,
  add column if not exists system_confidence_explanation text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'validation_verdicts_system_confidence_band_check'
  ) then
    alter table public.validation_verdicts
      add constraint validation_verdicts_system_confidence_band_check
      check (system_confidence_band in ('very_high', 'high', 'moderate', 'low', 'very_low'));
  end if;
end $$;

alter table public.validation_settings
  add column if not exists last_worker_started_at timestamptz,
  add column if not exists last_worker_heartbeat_at timestamptz,
  add column if not exists last_worker_host text;

create index if not exists validation_targets_active_rank_idx
  on public.validation_targets (active, denylisted, tranco_rank asc);

create index if not exists validation_targets_due_idx
  on public.validation_targets (cooldown_until, backoff_until, last_run_at desc);

create index if not exists validation_runs_created_at_idx
  on public.validation_runs (created_at desc);

create index if not exists validation_runs_status_idx
  on public.validation_runs (status, created_at desc);

create index if not exists validation_runs_target_idx
  on public.validation_runs (validation_target_id, created_at desc);

create index if not exists validation_run_findings_run_rank_idx
  on public.validation_run_findings (validation_run_id, finding_rank asc);

create index if not exists validation_run_findings_rule_key_idx
  on public.validation_run_findings (rule_key, created_at desc);

create index if not exists validation_run_findings_family_idx
  on public.validation_run_findings (finding_family, created_at desc);

create index if not exists validation_audit_events_created_at_idx
  on public.validation_audit_events (created_at desc);

drop trigger if exists set_validation_targets_updated_at on public.validation_targets;
create trigger set_validation_targets_updated_at
before update on public.validation_targets
for each row
execute function public.set_updated_at();

drop trigger if exists set_validation_settings_updated_at on public.validation_settings;
create trigger set_validation_settings_updated_at
before update on public.validation_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_validation_runs_updated_at on public.validation_runs;
create trigger set_validation_runs_updated_at
before update on public.validation_runs
for each row
execute function public.set_updated_at();

insert into public.validation_settings (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.organizations (name, slug, plan, plan_status)
values ('Validation Ops Internal', 'validation-ops-internal', 'team', 'active')
on conflict (slug) do nothing;

alter table public.policy_enrichment
  add column if not exists policy_cookie_disclosures jsonb not null default '[]'::jsonb,
  add column if not exists policy_notice_contact_present boolean,
  add column if not exists policy_termination_or_suspension_present boolean,
  add column if not exists policy_cancellation_or_refund_present boolean,
  add column if not exists policy_field_coverage jsonb not null default '{}'::jsonb,
  add column if not exists policy_coverage_ratio double precision,
  add column if not exists policy_snippet_count integer,
  add column if not exists policy_structurally_weak boolean;
