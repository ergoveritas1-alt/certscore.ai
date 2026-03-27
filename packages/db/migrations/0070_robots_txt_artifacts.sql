create table if not exists public.robots_txt_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  domain_id uuid not null references public.domains (id) on delete cascade,
  domain text not null,
  robots_txt_url text not null,
  robots_txt_hash text not null,
  robots_txt_body text not null,
  robots_fetch_http_status integer,
  robots_txt_fetched_at timestamptz,
  last_seen_scan_id uuid references public.scans (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists robots_txt_artifacts_domain_hash_idx
  on public.robots_txt_artifacts (domain_id, robots_txt_hash);

create index if not exists robots_txt_artifacts_domain_updated_idx
  on public.robots_txt_artifacts (domain_id, updated_at desc);
