alter table if exists public.scan_snapshots
  alter column privacy_policy_present drop not null;
