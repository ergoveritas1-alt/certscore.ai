create table if not exists public.scan_score_shadow_comparisons (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  schema_version text not null check (char_length(schema_version) between 1 and 80),
  model_version text not null check (char_length(model_version) between 1 and 120),
  legacy_score_version text not null check (char_length(legacy_score_version) between 1 and 120),
  candidate_status text not null check (candidate_status in ('scored', 'withheld')),
  candidate_score integer check (candidate_score between 0 and 100),
  legacy_score integer check (legacy_score between 0 and 100),
  score_delta integer check (score_delta between -100 and 100),
  candidate_coverage_ratio numeric(6, 5) not null check (candidate_coverage_ratio between 0 and 1),
  legacy_coverage_ratio numeric(6, 5) not null check (legacy_coverage_ratio between 0 and 1),
  report_usable_evidence_ratio numeric(6, 5) not null check (report_usable_evidence_ratio between 0 and 1),
  contradiction_types text[] not null default '{}'::text[] check (cardinality(contradiction_types) <= 32),
  withholding_reasons text[] not null default '{}'::text[] check (cardinality(withholding_reasons) <= 32),
  scanner_region text check (scanner_region is null or char_length(scanner_region) between 1 and 80),
  comparison_group_key text check (comparison_group_key is null or char_length(comparison_group_key) between 1 and 160),
  scan_source text check (scan_source is null or char_length(scan_source) between 1 and 80),
  generated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint scan_score_shadow_comparisons_status_value_check check (
    (candidate_status = 'scored' and candidate_score is not null and cardinality(withholding_reasons) = 0)
    or
    (candidate_status = 'withheld' and candidate_score is null and cardinality(withholding_reasons) > 0)
  ),
  constraint scan_score_shadow_comparisons_version_unique unique (scan_id, model_version)
);

create index if not exists scan_score_shadow_comparisons_model_generated_idx
  on public.scan_score_shadow_comparisons (model_version, generated_at desc);

create index if not exists scan_score_shadow_comparisons_group_region_idx
  on public.scan_score_shadow_comparisons (model_version, comparison_group_key, scanner_region)
  where comparison_group_key is not null and scanner_region is not null;

comment on table public.scan_score_shadow_comparisons is
  'Immutable bounded monitoring metrics for candidate score drift, withholding, contradictions, and region variance; contains no raw evidence or domain names.';
