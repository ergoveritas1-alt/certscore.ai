create table if not exists public.monitor_site_requests (
  id uuid primary key default gen_random_uuid(),
  website text not null,
  normalized_hostname text not null,
  work_email text not null,
  full_name text,
  company text,
  monitoring_goal text not null default 'changes',
  notes text,
  source_page_url text,
  source_report_url text,
  status text not null default 'pending',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint monitor_site_requests_work_email_normalized check (work_email = lower(btrim(work_email))),
  constraint monitor_site_requests_status_check check (status in ('pending', 'contacted', 'converted', 'closed')),
  constraint monitor_site_requests_monitoring_goal_check check (
    monitoring_goal in ('changes', 'pre-consent-tracking', 'cookies', 'accessibility', 'vendor-review')
  )
);

create index if not exists monitor_site_requests_status_created_at_idx
  on public.monitor_site_requests (status, created_at desc);

create index if not exists monitor_site_requests_normalized_hostname_idx
  on public.monitor_site_requests (normalized_hostname);

create index if not exists monitor_site_requests_work_email_idx
  on public.monitor_site_requests (work_email);

drop trigger if exists set_monitor_site_requests_updated_at on public.monitor_site_requests;
create trigger set_monitor_site_requests_updated_at
before update on public.monitor_site_requests
for each row execute function public.set_updated_at();
