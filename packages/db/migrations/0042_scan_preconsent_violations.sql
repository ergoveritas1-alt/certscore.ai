create table if not exists public.scan_preconsent_violations (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain_id uuid not null references public.domains (id) on delete cascade,
  vendor_name text not null,
  vendor_category text not null,
  detection_source text not null,
  confidence double precision not null default 0,
  first_party_or_third_party text not null default 'unknown',
  collection_endpoint_type text not null default 'unknown',
  script_host text,
  matched_signature_id text,
  evidence_urls text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  unique (scan_id, vendor_name)
);

create index if not exists scan_preconsent_violations_scan_id_idx
  on public.scan_preconsent_violations (scan_id, vendor_category);

create index if not exists scan_preconsent_violations_domain_id_idx
  on public.scan_preconsent_violations (domain_id, created_at desc);

alter table public.scan_preconsent_violations enable row level security;

drop policy if exists scan_preconsent_violations_select_member on public.scan_preconsent_violations;
create policy scan_preconsent_violations_select_member
on public.scan_preconsent_violations
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_preconsent_violations.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);
