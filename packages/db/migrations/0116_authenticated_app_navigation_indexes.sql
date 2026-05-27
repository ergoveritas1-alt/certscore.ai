create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

create index if not exists scan_runtime_artifacts_scan_id_idx
  on public.scan_runtime_artifacts (scan_id);

create index if not exists scan_snapshots_scan_id_idx
  on public.scan_snapshots (scan_id);

create index if not exists validation_runs_scan_id_created_at_idx
  on public.validation_runs (scan_id, created_at desc);

create index if not exists validation_verdicts_finding_created_at_idx
  on public.validation_verdicts (validation_run_finding_id, created_at desc);

create index if not exists scan_events_scan_id_created_at_desc_idx
  on public.scan_events (scan_id, created_at desc);

create index if not exists compliance_change_events_org_scan_current_idx
  on public.compliance_change_events (organization_id, scan_id_current);
