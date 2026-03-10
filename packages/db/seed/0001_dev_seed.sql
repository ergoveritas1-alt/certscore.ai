-- Minimal local seed for CertScore MVP development.
-- Run after at least one user has authenticated locally so public.users contains a row.

with first_user as (
  select id
  from public.users
  order by created_at asc
  limit 1
),
seed_organization as (
  insert into public.organizations (name, slug, plan, plan_status)
  select 'CertScore Dev Workspace', 'certscore-dev', 'free', 'active'
  from first_user
  on conflict (slug) do update
    set name = excluded.name
  returning id
),
organization_ref as (
  select id from seed_organization
  union all
  select id from public.organizations where slug = 'certscore-dev'
  limit 1
),
seed_membership as (
  insert into public.organization_members (organization_id, user_id, role)
  select organization_ref.id, first_user.id, 'admin'
  from organization_ref
  cross join first_user
  on conflict (organization_id, user_id) do nothing
  returning organization_id
),
seed_domain as (
  insert into public.domains (organization_id, hostname, normalized_url, status, scan_frequency)
  select organization_ref.id, 'demo.certscore.local', 'https://demo.certscore.local', 'active', 'manual'
  from organization_ref
  on conflict do nothing
  returning id, organization_id
),
domain_ref as (
  select id, organization_id from seed_domain
  union all
  select id, organization_id from public.domains where normalized_url = 'https://demo.certscore.local'
  limit 1
)
insert into public.scans (
  organization_id,
  domain_id,
  scan_type,
  status,
  submitted_by_user_id,
  pages_requested,
  pages_scanned,
  started_at,
  completed_at,
  duration_ms,
  scan_config_json
)
select
  domain_ref.organization_id,
  domain_ref.id,
  'full',
  'completed',
  first_user.id,
  5,
  3,
  timezone('utc', now()) - interval '5 minutes',
  timezone('utc', now()),
  300000,
  '{"seeded": true}'::jsonb
from domain_ref
cross join first_user
where not exists (
  select 1
  from public.scans
  where domain_id = domain_ref.id
    and scan_config_json ->> 'seeded' = 'true'
);
