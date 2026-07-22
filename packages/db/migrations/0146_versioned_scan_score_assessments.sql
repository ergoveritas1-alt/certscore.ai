create table if not exists public.scan_score_assessments (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  score_kind text not null check (char_length(score_kind) between 1 and 80),
  score_version text not null check (char_length(score_version) between 1 and 120),
  score_source text not null check (char_length(score_source) between 1 and 160),
  score_status text not null check (score_status in ('scored', 'withheld')),
  score_value integer check (score_value between 0 and 100),
  coverage_ratio numeric(6, 5) not null check (coverage_ratio between 0 and 1),
  coverage_confidence text not null check (
    coverage_confidence in ('high', 'medium', 'low', 'insufficient')
  ),
  withholding_reason text check (
    withholding_reason is null or char_length(withholding_reason) between 1 and 500
  ),
  input_finding_ids text[] not null default '{}'::text[],
  input_projection_fingerprint text check (
    input_projection_fingerprint is null or char_length(input_projection_fingerprint) between 1 and 160
  ),
  scored_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint scan_score_assessments_status_value_check check (
    (score_status = 'scored' and score_value is not null and withholding_reason is null)
    or
    (score_status = 'withheld' and score_value is null and withholding_reason is not null)
  ),
  constraint scan_score_assessments_version_history_unique unique (
    scan_id,
    score_kind,
    score_version
  )
);

create index if not exists scan_score_assessments_scan_scored_at_idx
  on public.scan_score_assessments (scan_id, scored_at desc);

create index if not exists scan_score_assessments_kind_version_idx
  on public.scan_score_assessments (score_kind, score_version, scored_at desc);

comment on table public.scan_score_assessments is
  'Immutable, version-addressed score projections. New scoring meaning requires a new score_version.';
