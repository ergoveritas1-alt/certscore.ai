alter table public.scan_snapshots
  add column if not exists max_requested_tier text,
  add column if not exists highest_attempted_tier text,
  add column if not exists highest_successful_tier text,
  add column if not exists stop_tier text,
  add column if not exists stop_tier_kind text,
  add column if not exists tier_trace jsonb,
  add column if not exists browser_state_quality text,
  add column if not exists access_posture_class text,
  add column if not exists recoverable_finding_classes jsonb,
  add column if not exists recommended_next_tier text,
  add column if not exists cooldown_recommended boolean,
  add column if not exists cooldown_until timestamptz;

create index if not exists scan_snapshots_access_posture_class_idx
  on public.scan_snapshots (access_posture_class, scan_timestamp desc);

create index if not exists scan_snapshots_highest_successful_tier_idx
  on public.scan_snapshots (highest_successful_tier, scan_timestamp desc);

create index if not exists scan_snapshots_stop_tier_idx
  on public.scan_snapshots (stop_tier, scan_timestamp desc);
