alter table if exists public.scan_score_shadow_comparisons
  add column if not exists input_projection_fingerprint text
  check (
    input_projection_fingerprint is null
    or input_projection_fingerprint ~ '^(sha256:)?[a-f0-9]{64}$'
  );

update public.scan_score_shadow_comparisons comparison
   set input_projection_fingerprint = case
     when assessment.input_projection_fingerprint like 'sha256:%'
       then lower(assessment.input_projection_fingerprint)
     else 'sha256:' || lower(assessment.input_projection_fingerprint)
   end
  from public.scan_score_assessments assessment
 where comparison.input_projection_fingerprint is null
   and assessment.scan_id = comparison.scan_id
   and assessment.score_kind = 'gdpr_eprivacy_risk_shadow'
   and assessment.score_version = comparison.model_version
   and assessment.input_projection_fingerprint ~ '^(sha256:)?[a-f0-9]{64}$';

create index if not exists scan_score_shadow_comparisons_input_source_idx
  on public.scan_score_shadow_comparisons (
    model_version,
    comparison_group_key,
    comparison_target_key,
    input_projection_fingerprint,
    scan_source
  )
  where comparison_group_key is not null
    and comparison_target_key is not null
    and input_projection_fingerprint is not null
    and scan_source is not null;

comment on column public.scan_score_shadow_comparisons.input_projection_fingerprint is
  'SHA-256 fingerprint of the bounded canonical score input; enables identical-input source comparison without raw evidence or inferred geography.';
