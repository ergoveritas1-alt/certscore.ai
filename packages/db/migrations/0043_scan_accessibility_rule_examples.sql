create table if not exists public.scan_accessibility_rule_examples (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  page_url text not null,
  rule_code text not null,
  rule_group text not null,
  severity text not null,
  impact text,
  help text not null,
  help_url text not null,
  description text not null,
  node_count integer not null default 0,
  representative_selectors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_accessibility_rule_examples_scan_id_idx
  on public.scan_accessibility_rule_examples (scan_id, rule_group);

create index if not exists scan_accessibility_rule_examples_domain_id_idx
  on public.scan_accessibility_rule_examples (domain_id, created_at desc);
