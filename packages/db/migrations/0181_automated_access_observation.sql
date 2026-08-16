alter table if exists public.scan_snapshots
  add column if not exists automated_access_observation jsonb;

comment on column public.scan_snapshots.automated_access_observation is
  'Bounded internal-only crawler authentication and target edge-provider telemetry retained from the canonical evidence bundle; never projected as a finding or score.';

create index if not exists scan_snapshots_cloudflare_automated_access_idx
  on public.scan_snapshots (scan_timestamp desc)
  where automated_access_observation #>> '{targetInfrastructure,cloudflareObserved}' = 'true';
