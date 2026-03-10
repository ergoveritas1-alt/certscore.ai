create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  title text not null,
  summary_json jsonb not null default '{}'::jsonb,
  report_payload_json jsonb not null default '{}'::jsonb,
  pdf_path text,
  pdf_status text not null default 'not_generated',
  is_latest boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists reports_scan_id_idx
  on public.reports (scan_id);

create index if not exists reports_organization_id_idx
  on public.reports (organization_id);

create index if not exists reports_domain_id_idx
  on public.reports (domain_id);

create index if not exists reports_is_latest_idx
  on public.reports (is_latest);

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
before update on public.reports
for each row
execute function public.set_updated_at();
