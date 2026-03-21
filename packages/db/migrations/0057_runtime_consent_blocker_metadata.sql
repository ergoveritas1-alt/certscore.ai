alter table public.scan_runtime_artifacts
  add column if not exists consent_blocker_type text,
  add column if not exists consent_blocker_url text,
  add column if not exists consent_blocker_page_title text,
  add column if not exists consent_blocker_text_snippet text,
  add column if not exists consent_evidence_pass_count integer;
