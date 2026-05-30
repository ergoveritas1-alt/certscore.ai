create table if not exists public.browser_scan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  source_type text not null default 'browser_extension',
  source_id text not null default 'BX01',
  scan_mode text not null default 'pre_consent_browser_observed',
  capture_mode text not null default 'controlled_reload',
  target_url text not null,
  target_hostname text not null,
  status text not null default 'started',
  upload_token_hash text not null,
  token_expires_at timestamptz not null,
  scan_started_at timestamptz,
  scan_completed_at timestamptz,
  duration_ms integer,
  event_count integer not null default 0,
  artifact_count integer not null default 0,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.browser_scan_events (
  id uuid primary key default gen_random_uuid(),
  browser_scan_id uuid not null references public.browser_scan_sessions (id) on delete cascade,
  event_type text not null,
  observed_at_ms integer not null,
  event_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.browser_scan_artifacts (
  id uuid primary key default gen_random_uuid(),
  browser_scan_id uuid not null references public.browser_scan_sessions (id) on delete cascade,
  artifact_type text not null,
  content_type text not null,
  artifact_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists browser_scan_sessions_user_created_at_idx
  on public.browser_scan_sessions (user_id, created_at desc);

create index if not exists browser_scan_sessions_hostname_created_at_idx
  on public.browser_scan_sessions (target_hostname, created_at desc);

create index if not exists browser_scan_sessions_status_created_at_idx
  on public.browser_scan_sessions (status, created_at desc);

create index if not exists browser_scan_events_scan_observed_idx
  on public.browser_scan_events (browser_scan_id, observed_at_ms asc);

create index if not exists browser_scan_events_type_idx
  on public.browser_scan_events (event_type, created_at desc);

create index if not exists browser_scan_artifacts_scan_idx
  on public.browser_scan_artifacts (browser_scan_id, created_at desc);

drop trigger if exists set_browser_scan_sessions_updated_at on public.browser_scan_sessions;
create trigger set_browser_scan_sessions_updated_at
before update on public.browser_scan_sessions
for each row
execute function public.set_updated_at();
