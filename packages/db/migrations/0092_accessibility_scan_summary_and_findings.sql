create table if not exists public.accessibility_scan_summary (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  page_url text not null,
  accessibility_score integer not null,
  risk_band text not null,
  total_violation_count integer not null default 0,
  total_affected_node_count integer not null default 0,
  critical_count integer not null default 0,
  serious_count integer not null default 0,
  moderate_count integer not null default 0,
  minor_count integer not null default 0,
  wcag_criteria_impacted jsonb not null default '[]'::jsonb,
  top_rule_families jsonb not null default '[]'::jsonb,
  benchmark_label text,
  automated_coverage_note text not null default 'Automated accessibility testing can detect many common WCAG failures but does not establish full ADA or WCAG conformance.',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.accessibility_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  page_url text not null,
  finding_id text not null,
  label text not null,
  severity text not null,
  confidence text not null,
  axe_rule_id text not null,
  axe_impact text not null,
  wcag jsonb not null default '[]'::jsonb,
  affected_node_count integer not null default 0,
  evidence_summary text not null,
  remediation text not null,
  benchmark jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists accessibility_scan_summary_scan_id_idx
  on public.accessibility_scan_summary (scan_id);

create index if not exists accessibility_findings_scan_id_idx
  on public.accessibility_findings (scan_id);

create index if not exists accessibility_findings_scan_id_severity_idx
  on public.accessibility_findings (scan_id, severity);
