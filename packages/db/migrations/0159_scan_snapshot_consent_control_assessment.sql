alter table if exists public.scan_snapshots
  add column if not exists consent_control_assessment jsonb,
  add column if not exists consent_assessment_version text,
  add column if not exists consent_assessment_status text,
  add column if not exists consent_assessment_computed_at timestamptz,
  add column if not exists consent_assessment_source_hash text;

comment on column public.scan_snapshots.consent_control_assessment is
  'Persisted ConsentControlAssessment read-model envelope. Canonical evidence and policy remain authoritative.';

comment on column public.scan_snapshots.consent_assessment_status is
  'Assessment status: complete, limited, or not_applicable. Unknown controls are not coerced to false.';

create index if not exists scan_snapshots_consent_assessment_status_idx
  on public.scan_snapshots (consent_assessment_status, consent_assessment_computed_at nulls first);

create index if not exists scan_snapshots_consent_assessment_source_hash_idx
  on public.scan_snapshots (consent_assessment_source_hash);
