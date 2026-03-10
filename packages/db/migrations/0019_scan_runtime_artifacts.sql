create table if not exists public.scan_runtime_artifacts (
  scan_id uuid primary key references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  third_party_request_domains text[] not null default '{}',
  third_party_request_count integer not null default 0,
  initial_cookie_names text[] not null default '{}',
  initial_cookie_domains text[] not null default '{}',
  initial_cookie_count integer not null default 0,
  script_src_domains text[] not null default '{}',
  script_tag_count integer not null default 0,
  response_headers jsonb not null default '{}'::jsonb,
  dom_structure_hash text,
  dom_node_count integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_runtime_artifacts_domain_id_idx
  on public.scan_runtime_artifacts (domain_id, created_at desc);

create index if not exists scan_runtime_artifacts_headers_gin_idx
  on public.scan_runtime_artifacts
  using gin (response_headers);

alter table public.scan_runtime_artifacts enable row level security;

drop policy if exists scan_runtime_artifacts_select_member on public.scan_runtime_artifacts;
create policy scan_runtime_artifacts_select_member
on public.scan_runtime_artifacts
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_runtime_artifacts.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

alter table public.scan_tracker_vendors
  alter column before_consent drop not null,
  alter column before_consent drop default;
