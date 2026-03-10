create table if not exists public.scan_regressions (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  previous_scan_id uuid references public.scans(id) on delete set null,
  domain_id uuid not null references public.domains(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  new_findings_count integer not null default 0,
  resolved_findings_count integer not null default 0,
  persisted_findings_count integer not null default 0,
  overall_score_delta integer,
  accessibility_score_delta integer,
  privacy_score_delta integer,
  legal_score_delta integer,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists scan_regressions_scan_id_idx
  on public.scan_regressions (scan_id);

create index if not exists scan_regressions_domain_id_idx
  on public.scan_regressions (domain_id);

create index if not exists scan_regressions_previous_scan_id_idx
  on public.scan_regressions (previous_scan_id);
