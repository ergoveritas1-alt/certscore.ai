-- Inventory crawl lifecycle is independent from homepage assessment/report readiness.
create table if not exists full_site_crawls (
  scan_id uuid primary key references scans(id) on delete cascade,
  authorized_user_id uuid not null references users(id),
  status text not null default 'waiting_homepage' check (status in ('waiting_homepage','running','completed','stopped','cancelled')),
  requested_json jsonb not null,
  policy_json jsonb not null,
  region text not null check (region in ('eu-central-1','eu-west-1','us-west-1')),
  configuration_json jsonb,
  configuration_hash text,
  hosts text[] not null default '{}',
  site_keys text[] not null default '{}',
  robots_json jsonb,
  bucket text,
  artifact_prefix text,
  effective_concurrency integer not null default 1,
  effective_wait_seconds double precision not null default 5,
  started_at timestamptz not null default now(),
  crawl_started_at timestamptz,
  completed_at timestamptz,
  homepage_duration_ms integer,
  stop_reason text,
  discovery_exhausted boolean not null default false,
  discovery_complete boolean not null default false,
  discovery_lease_until timestamptz,
  peak_workers integer not null default 0,
  pause_ms bigint not null default 0,
  backoff_until timestamptz,
  rate_limit_count integer not null default 0,
  blocked_count integer not null default 0
);
create table if not exists full_site_pages (
  id uuid primary key,
  scan_id uuid not null references full_site_crawls(scan_id) on delete cascade,
  target_url text not null,
  final_url text,
  source text not null,
  discovery_count integer not null default 1,
  discovery_sources text[] not null default '{}',
  selection_reason text not null,
  section text not null,
  status text not null check (status in ('queued','dispatching','active','completed','partial','blocked','failed','excluded','cancelled')),
  scheduled boolean not null default false,
  limitation text,
  attempt_count integer not null default 0,
  attempt_id uuid,
  token_hash text,
  dispatch_lease_until timestamptz,
  worker_lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  observation_json jsonb,
  compact_json jsonb,
  links_processed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (scan_id,target_url)
);
create index if not exists full_site_pages_dispatch on full_site_pages(next_attempt_at,created_at) where status in ('queued','dispatching','active');
create index if not exists full_site_pages_scan on full_site_pages(scan_id,status);
create table if not exists full_site_attempts (
  id uuid primary key,
  page_id uuid not null references full_site_pages(id) on delete cascade,
  ordinal integer not null,
  status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  limitation text,
  artifact_json jsonb,
  unique(page_id,ordinal)
);
create table if not exists full_site_safety (
  site_key text primary key,
  last_start_at timestamptz,
  last_dispatch_at timestamptz,
  backoff_until timestamptz
);
