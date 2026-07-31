alter table if exists public.scan_snapshots
  add column if not exists consent_coverage_status text,
  add column if not exists consent_surface_status text;

comment on column public.scan_snapshots.consent_coverage_status is
  'ConsentControlAssessment coverage status: complete, limited, none, or not_applicable.';

comment on column public.scan_snapshots.consent_surface_status is
  'ConsentControlAssessment surface status: observed_actionable, observed_non_actionable, not_observed, or unknown.';

update public.scan_snapshots
set
  consent_coverage_status = coalesce(
    consent_coverage_status,
    consent_control_assessment #>> '{coverage,status}'
  ),
  consent_surface_status = coalesce(
    consent_surface_status,
    consent_control_assessment #>> '{surface,status}'
  )
where consent_control_assessment is not null
  and (
    consent_coverage_status is null
    or consent_surface_status is null
  );

create index if not exists scan_snapshots_consent_coverage_status_idx
  on public.scan_snapshots (consent_coverage_status);

create index if not exists scan_snapshots_consent_surface_status_idx
  on public.scan_snapshots (consent_surface_status);
