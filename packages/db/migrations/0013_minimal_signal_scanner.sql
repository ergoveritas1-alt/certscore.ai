update public.organizations
set plan = 'pro'
where plan = 'starter';

drop table if exists public.reports cascade;
drop table if exists public.score_breakdowns cascade;
drop table if exists public.risk_scores cascade;
drop table if exists public.scan_regressions cascade;
drop table if exists public.findings cascade;
drop table if exists public.scan_pages cascade;
drop table if exists public.clients cascade;

alter table public.domains
  drop constraint if exists domains_client_id_fkey;

alter table public.domains
  drop column if exists client_id;

alter table public.organization_settings
  drop column if exists brand_name,
  drop column if exists brand_logo_path,
  drop column if exists brand_primary_color;

alter table public.plan_limits
  drop column if exists report_history_days,
  drop column if exists white_label_enabled,
  drop column if exists ai_explanations_enabled,
  add column if not exists scan_history_enabled boolean not null default false,
  add column if not exists api_access boolean not null default false;

delete from public.plan_limits;

insert into public.plan_limits (
  plan_code,
  max_domains,
  max_pages_per_scan,
  scan_frequency,
  manual_rescan_limit_per_month,
  scan_history_enabled,
  api_access
)
values
  ('free', 1, 1, 'manual', 1, false, false),
  ('pro', 3, 50, 'daily', 90, false, false),
  ('team', 20, 50, 'daily', 600, true, true);

create table if not exists public.scan_snapshots (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete cascade,
  pages_requested integer not null,
  pages_scanned integer not null,
  total_signals integer not null default 0,
  accessibility_signal_count integer not null default 0,
  privacy_signal_count integer not null default 0,
  disclosure_signal_count integer not null default 0,
  high_severity_count integer not null default 0,
  medium_severity_count integer not null default 0,
  low_severity_count integer not null default 0,
  tracker_vendor_count integer not null default 0,
  cookie_banner_present boolean not null default false,
  privacy_policy_present boolean not null default false,
  terms_present boolean not null default false,
  cookie_policy_present boolean not null default false,
  refund_policy_present boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_snapshots_organization_id_idx
  on public.scan_snapshots (organization_id, created_at desc);

create index if not exists scan_snapshots_domain_id_idx
  on public.scan_snapshots (domain_id, created_at desc);

create table if not exists public.scan_signals (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete cascade,
  category text not null,
  signal_key text not null,
  signal_label text not null,
  value_type text not null,
  signal_value_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (scan_id, signal_key)
);

create index if not exists scan_signals_scan_id_idx
  on public.scan_signals (scan_id, category);

create index if not exists scan_signals_domain_id_idx
  on public.scan_signals (domain_id, created_at desc);
