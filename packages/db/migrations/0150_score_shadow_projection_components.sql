alter table if exists public.scan_score_shadow_comparisons
  add column if not exists coverage_projection_fingerprint text
    check (
      coverage_projection_fingerprint is null
      or coverage_projection_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ),
  add column if not exists coverage_projection_row_count integer
    check (coverage_projection_row_count is null or coverage_projection_row_count between 0 and 256),
  add column if not exists finding_projection_fingerprint text
    check (
      finding_projection_fingerprint is null
      or finding_projection_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ),
  add column if not exists finding_projection_count integer
    check (finding_projection_count is null or finding_projection_count between 0 and 256);

create index if not exists scan_score_shadow_comparisons_projection_components_idx
  on public.scan_score_shadow_comparisons (
    model_version,
    comparison_target_key,
    coverage_projection_fingerprint,
    finding_projection_fingerprint
  )
  where comparison_target_key is not null
    and coverage_projection_fingerprint is not null
    and finding_projection_fingerprint is not null;

comment on column public.scan_score_shadow_comparisons.coverage_projection_fingerprint is
  'SHA-256 fingerprint of bounded canonical coverage-row states; contains no raw evidence or target identity.';

comment on column public.scan_score_shadow_comparisons.finding_projection_fingerprint is
  'SHA-256 fingerprint of bounded score-eligible finding id, family, and severity tuples; contains no raw evidence.';
