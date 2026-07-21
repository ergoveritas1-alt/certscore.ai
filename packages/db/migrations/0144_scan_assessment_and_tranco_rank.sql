alter table if exists public.scan_snapshots
  add column if not exists tranco_rank integer,
  add column if not exists scan_no_go_assessment jsonb,
  add column if not exists visual_access_review jsonb,
  add column if not exists visual_evidence_artifacts jsonb;

create index if not exists scan_snapshots_tranco_rank_idx
  on public.scan_snapshots (tranco_rank asc nulls last, scan_timestamp desc);
