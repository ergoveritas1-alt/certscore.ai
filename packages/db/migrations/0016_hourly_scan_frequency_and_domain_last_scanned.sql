alter table public.domains
  add column if not exists last_scanned_at timestamptz;

update public.domains as domains
set last_scanned_at = scans.latest_completed_at
from (
  select
    domain_id,
    max(completed_at) as latest_completed_at
  from public.scans
  where domain_id is not null
    and status = 'completed'
    and completed_at is not null
  group by domain_id
) as scans
where domains.id = scans.domain_id
  and (domains.last_scanned_at is null or domains.last_scanned_at < scans.latest_completed_at);

create index if not exists domains_last_scanned_at_idx
  on public.domains (organization_id, last_scanned_at desc);

update public.plan_limits
set scan_frequency = 'hourly'
where plan_code in ('pro', 'team');
