create table if not exists public.wc01_v2_internal_artifact_runs (
  id uuid primary key default gen_random_uuid(),
  source_label text not null,
  cohort text,
  site_domain text,
  artifact_kind text not null,
  artifact_version text not null,
  artifact_path text not null,
  artifact_root text,
  artifact_json jsonb not null default '{}'::jsonb,
  summary_markdown text,
  queue_item_count integer not null default 0,
  guardrail_status text not null default 'not_evaluated',
  created_by text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wc01_v2_internal_artifact_runs_guardrail_status_check check (
    guardrail_status in ('passed', 'failed', 'not_evaluated')
  ),
  constraint wc01_v2_internal_artifact_runs_kind_check check (
    artifact_kind in (
      'evidence_preview_packet',
      'manual_reviewer_packet',
      'concern_policy_comparison',
      'implementation_proposal',
      'approval_metadata',
      'product_surface_proposal'
    )
  )
);

create table if not exists public.wc01_v2_internal_preview_items (
  id uuid primary key default gen_random_uuid(),
  artifact_run_id uuid not null references public.wc01_v2_internal_artifact_runs (id) on delete cascade,
  queue_item_id text not null,
  site_domain text,
  family text not null,
  queue_lane text not null,
  suggested_reviewer_action text,
  sensitive_context_categories text[] not null default '{}',
  confidence_band text,
  directness text,
  unresolved_ref_count integer not null default 0,
  warning_count integer not null default 0,
  item_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint wc01_v2_internal_preview_items_action_check check (
    suggested_reviewer_action is null or suggested_reviewer_action in (
      'evidence_shape_confirmed',
      'needs_more_evidence',
      'internal_only',
      'policy_copy_review_required',
      'sensitive_context_escalated',
      'rejected_overbroad'
    )
  ),
  constraint wc01_v2_internal_preview_items_unique_queue_item unique (artifact_run_id, queue_item_id)
);

create table if not exists public.wc01_v2_internal_reviewer_decisions (
  id uuid primary key default gen_random_uuid(),
  preview_item_id uuid not null references public.wc01_v2_internal_preview_items (id) on delete cascade,
  reviewer_id text not null,
  reviewer_action text not null,
  decision_notes text,
  markdown_sufficient boolean,
  json_opened boolean,
  upstream_inspection_needed boolean,
  unresolved_refs_blocked_review boolean,
  confidence_directness_clear boolean,
  escalation_needed boolean,
  escalation_reason text,
  decision_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wc01_v2_internal_reviewer_decisions_action_check check (
    reviewer_action in (
      'evidence_shape_confirmed',
      'needs_more_evidence',
      'internal_only',
      'policy_copy_review_required',
      'sensitive_context_escalated',
      'rejected_overbroad'
    )
  )
);

create index if not exists wc01_v2_internal_artifact_runs_created_idx
  on public.wc01_v2_internal_artifact_runs (created_at desc);

create index if not exists wc01_v2_internal_artifact_runs_site_created_idx
  on public.wc01_v2_internal_artifact_runs (site_domain, created_at desc);

create index if not exists wc01_v2_internal_artifact_runs_kind_created_idx
  on public.wc01_v2_internal_artifact_runs (artifact_kind, created_at desc);

create index if not exists wc01_v2_internal_preview_items_run_idx
  on public.wc01_v2_internal_preview_items (artifact_run_id, created_at asc);

create index if not exists wc01_v2_internal_preview_items_family_lane_idx
  on public.wc01_v2_internal_preview_items (family, queue_lane);

create index if not exists wc01_v2_internal_reviewer_decisions_item_created_idx
  on public.wc01_v2_internal_reviewer_decisions (preview_item_id, created_at desc);

create index if not exists wc01_v2_internal_reviewer_decisions_reviewer_created_idx
  on public.wc01_v2_internal_reviewer_decisions (reviewer_id, created_at desc);

drop trigger if exists set_wc01_v2_internal_artifact_runs_updated_at
  on public.wc01_v2_internal_artifact_runs;
create trigger set_wc01_v2_internal_artifact_runs_updated_at
before update on public.wc01_v2_internal_artifact_runs
for each row
execute function public.set_updated_at();

drop trigger if exists set_wc01_v2_internal_reviewer_decisions_updated_at
  on public.wc01_v2_internal_reviewer_decisions;
create trigger set_wc01_v2_internal_reviewer_decisions_updated_at
before update on public.wc01_v2_internal_reviewer_decisions
for each row
execute function public.set_updated_at();
