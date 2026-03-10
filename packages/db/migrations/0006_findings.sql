create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  scan_page_id uuid references public.scan_pages (id) on delete set null,
  category text not null,
  subtype text not null,
  rule_key text not null,
  title text not null,
  description text not null,
  severity text not null,
  weight integer not null default 0,
  status text not null default 'open',
  evidence_json jsonb not null default '{}'::jsonb,
  remediation_business text,
  remediation_technical text,
  llm_explanation text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists findings_scan_id_idx
  on public.findings (scan_id);

create index if not exists findings_scan_page_id_idx
  on public.findings (scan_page_id);

create index if not exists findings_category_idx
  on public.findings (category);

create index if not exists findings_rule_key_idx
  on public.findings (rule_key);
