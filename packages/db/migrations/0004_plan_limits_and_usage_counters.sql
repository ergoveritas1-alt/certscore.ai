create table if not exists public.plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  max_domains integer not null,
  max_pages_per_scan integer not null,
  scan_frequency text not null,
  manual_rescan_limit_per_month integer,
  report_history_days integer,
  white_label_enabled boolean not null default false,
  ai_explanations_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_key text not null,
  period_start date not null,
  period_end date not null,
  value integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists usage_counters_org_metric_period_key
  on public.usage_counters (organization_id, metric_key, period_start, period_end);

create index if not exists usage_counters_organization_idx
  on public.usage_counters (organization_id, metric_key);

create unique index if not exists domains_org_normalized_url_unique
  on public.domains (organization_id, normalized_url)
  where organization_id is not null;

create index if not exists domains_organization_created_at_idx
  on public.domains (organization_id, created_at desc);

create index if not exists scans_org_created_at_idx
  on public.scans (organization_id, created_at desc);

create index if not exists scans_domain_created_at_idx
  on public.scans (domain_id, created_at desc);

create index if not exists scan_events_scan_created_at_idx
  on public.scan_events (scan_id, created_at asc);

create trigger usage_counters_set_updated_at
before update on public.usage_counters
for each row execute procedure public.set_updated_at();

insert into public.plan_limits (
  plan_code,
  max_domains,
  max_pages_per_scan,
  scan_frequency,
  manual_rescan_limit_per_month,
  report_history_days,
  white_label_enabled,
  ai_explanations_enabled
)
values
  ('free', 1, 3, 'manual', 3, 7, false, false),
  ('starter', 1, 10, 'monthly', 20, 90, false, true),
  ('pro', 10, 25, 'weekly', 100, 365, false, true)
on conflict (plan_code) do update
set
  max_domains = excluded.max_domains,
  max_pages_per_scan = excluded.max_pages_per_scan,
  scan_frequency = excluded.scan_frequency,
  manual_rescan_limit_per_month = excluded.manual_rescan_limit_per_month,
  report_history_days = excluded.report_history_days,
  white_label_enabled = excluded.white_label_enabled,
  ai_explanations_enabled = excluded.ai_explanations_enabled;
