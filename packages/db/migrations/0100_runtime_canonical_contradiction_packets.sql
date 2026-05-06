alter table if exists public.scan_runtime_artifacts
  add column if not exists policy_claim_candidates jsonb not null default '[]'::jsonb,
  add column if not exists runtime_behavior_artifacts jsonb not null default '[]'::jsonb,
  add column if not exists policy_runtime_bridge_candidates jsonb not null default '[]'::jsonb;
