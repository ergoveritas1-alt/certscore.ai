alter table if exists public.scan_score_shadow_comparisons
  add column if not exists comparison_target_key text
  check (comparison_target_key is null or char_length(comparison_target_key) between 1 and 160);

create index if not exists scan_score_shadow_comparisons_target_region_idx
  on public.scan_score_shadow_comparisons (
    model_version,
    comparison_group_key,
    comparison_target_key,
    scanner_region
  )
  where comparison_group_key is not null
    and comparison_target_key is not null
    and scanner_region is not null;

comment on column public.scan_score_shadow_comparisons.comparison_target_key is
  'SHA-256 fingerprint of the normalized requested scan URL; raw URLs are never persisted in score monitoring.';
