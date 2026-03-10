create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  client_id uuid,
  hostname text not null,
  normalized_url text not null,
  status text not null default 'active',
  latest_scan_id uuid,
  scan_frequency text,
  max_pages_override integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  domain_id uuid references public.domains (id) on delete set null,
  scan_type text not null,
  status text not null,
  submitted_by_user_id uuid references public.users (id) on delete set null,
  pages_requested integer not null default 1,
  pages_scanned integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  scan_config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.domains
  drop constraint if exists domains_latest_scan_id_fkey;

alter table public.domains
  add constraint domains_latest_scan_id_fkey
  foreign key (latest_scan_id)
  references public.scans (id)
  on delete set null;

create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.scans (id) on delete cascade,
  domain_id uuid references public.domains (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  event_type text not null,
  message text not null,
  metadata_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists domains_organization_id_idx
  on public.domains (organization_id);

create index if not exists domains_normalized_url_idx
  on public.domains (normalized_url);

create index if not exists domains_hostname_idx
  on public.domains (hostname);

create index if not exists scans_domain_id_created_at_idx
  on public.scans (domain_id, created_at desc);

create index if not exists scans_status_scan_type_created_at_idx
  on public.scans (status, scan_type, created_at desc);

create index if not exists scans_organization_id_created_at_idx
  on public.scans (organization_id, created_at desc);

create index if not exists scan_events_scan_id_created_at_idx
  on public.scan_events (scan_id, created_at asc);

create index if not exists scan_events_domain_id_created_at_idx
  on public.scan_events (domain_id, created_at asc);

drop trigger if exists set_domains_updated_at on public.domains;
create trigger set_domains_updated_at
before update on public.domains
for each row
execute function public.set_updated_at();

drop trigger if exists set_scans_updated_at on public.scans;
create trigger set_scans_updated_at
before update on public.scans
for each row
execute function public.set_updated_at();
