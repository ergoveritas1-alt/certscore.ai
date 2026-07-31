alter table if exists public.scan_snapshots
  add column if not exists report_projection_version text,
  add column if not exists report_projection_status text not null default 'pending',
  add column if not exists report_projection_computed_at timestamptz,
  add column if not exists report_projection_source_hash text,
  add column if not exists report_projection_error text,
  add column if not exists score_source text,
  add column if not exists score_version text,
  add column if not exists score_scored_at timestamptz,
  add column if not exists score_coverage_confidence text,
  add column if not exists score_coverage_ratio double precision,
  add column if not exists consent_accept_observed boolean,
  add column if not exists consent_reject_observed boolean,
  add column if not exists consent_options_observed boolean,
  add column if not exists consent_evidence_status text,
  add column if not exists tranco_list_id text,
  add column if not exists tranco_snapshot_date date,
  add column if not exists duration_ms integer;

create index if not exists scan_snapshots_report_projection_status_idx
  on public.scan_snapshots (report_projection_status, report_projection_computed_at nulls first);

create index if not exists scan_snapshots_report_projection_version_idx
  on public.scan_snapshots (report_projection_version, scan_timestamp desc);
