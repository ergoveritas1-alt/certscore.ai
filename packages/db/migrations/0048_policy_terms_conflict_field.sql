alter table public.scan_snapshots
  add column if not exists policy_terms_conflict_detected boolean;
