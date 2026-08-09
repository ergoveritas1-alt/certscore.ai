alter table public.scan_model_review_artifacts
  drop constraint if exists scan_model_review_artifacts_review_kind_check;

alter table public.scan_model_review_artifacts
  add constraint scan_model_review_artifacts_review_kind_check check (
    review_kind in (
      'policy_semantic',
      'policy_semantic_static',
      'policy_semantic_parallel_shadow',
      'policy_semantic_nano_shadow',
      'finding_validation',
      'vendor_attribution'
    )
  );

comment on constraint scan_model_review_artifacts_review_kind_check
  on public.scan_model_review_artifacts is
  'Static, parallel-shadow, and Nano policy artifacts are internal and non-projectable; only an approved-model canonical policy_semantic artifact may enter normalized concerns.';
