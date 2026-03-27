alter table if exists public.scan_runtime_artifacts
  add column if not exists passive_public_verification_attempted boolean,
  add column if not exists passive_public_verification_mode text,
  add column if not exists passive_public_verification_verified_surfaces jsonb,
  add column if not exists passive_public_verification_attempted_urls jsonb,
  add column if not exists passive_public_verification_blocked_urls jsonb,
  add column if not exists passive_public_verification_failed_urls jsonb;
