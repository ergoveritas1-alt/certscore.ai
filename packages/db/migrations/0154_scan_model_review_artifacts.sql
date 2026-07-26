create table if not exists public.scan_model_review_artifacts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  review_kind text not null check (
    review_kind in ('policy_semantic', 'finding_validation', 'vendor_attribution')
  ),
  review_mode text not null default 'shadow' check (
    review_mode in ('shadow', 'enforced')
  ),
  cache_key text not null check (cache_key ~ '^[a-f0-9]{64}$'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  contract_version text not null,
  prompt_version text not null,
  model_role text not null check (
    model_role in ('extraction', 'review', 'escalation')
  ),
  requested_model text not null,
  resolved_model text not null,
  review_status text not null check (
    review_status in ('completed', 'failed', 'skipped')
  ),
  source_document_ids uuid[] not null default '{}',
  review_json jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (scan_id, review_kind, cache_key)
);

create index if not exists scan_model_review_artifacts_scan_idx
  on public.scan_model_review_artifacts (scan_id, review_kind, updated_at desc);

create index if not exists scan_model_review_artifacts_cache_idx
  on public.scan_model_review_artifacts (review_kind, cache_key, updated_at desc)
  where review_status = 'completed';

alter table public.scan_model_review_artifacts enable row level security;

drop policy if exists scan_model_review_artifacts_select_member
  on public.scan_model_review_artifacts;
create policy scan_model_review_artifacts_select_member
on public.scan_model_review_artifacts
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_model_review_artifacts.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

comment on table public.scan_model_review_artifacts is
  'Internal model-review artifacts. Shadow rows must not directly create production findings or scores.';
