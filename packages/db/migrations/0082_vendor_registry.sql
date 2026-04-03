create table if not exists public.vendor_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  vendor_category text not null default 'unknown',
  vendor_subcategory text,
  owner_organization text,
  website_url text,
  description text,
  aliases text[] not null default '{}',
  cookie_names text[] not null default '{}',
  confidence double precision not null default 0,
  source text not null default 'manual',
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.vendor_domain_patterns (
  id uuid primary key default gen_random_uuid(),
  vendor_registry_id uuid not null references public.vendor_registry (id) on delete cascade,
  domain text not null unique,
  match_type text not null default 'suffix',
  confidence double precision not null default 0,
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists vendor_registry_category_idx
  on public.vendor_registry (vendor_category, canonical_name);

create index if not exists vendor_domain_patterns_vendor_idx
  on public.vendor_domain_patterns (vendor_registry_id, domain);
