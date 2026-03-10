alter table public.scan_snapshots
  add column if not exists policy_enrichment_id uuid;

create table if not exists public.policy_evidence (
  evidence_hash char(64) primary key,
  snippet text not null check (char_length(snippet) <= 1024),
  snippet_location text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.policy_enrichment (
  id uuid primary key,
  scan_id uuid not null references public.scan_snapshots (scan_id) on delete cascade,
  page_url text not null,
  normalized_policy_hash char(64) not null,
  policy_summary_short text check (policy_summary_short is null or char_length(policy_summary_short) <= 280),
  policy_mentions jsonb not null default '[]'::jsonb,
  policy_data_categories text[] not null default '{}',
  policy_retention_periods jsonb not null default '[]'::jsonb,
  policy_dsar_mechanism text not null default 'unknown' check (policy_dsar_mechanism in ('present','partial','absent','unknown')),
  policy_dsar_confidence real,
  policy_do_not_sell text not null default 'unknown' check (policy_do_not_sell in ('present_link','present_text','absent','unknown')),
  policy_do_not_sell_confidence real,
  policy_subprocessors_listed boolean,
  policy_transfer_mechanisms jsonb not null default '[]'::jsonb,
  policy_children_reference text not null default 'unknown' check (policy_children_reference in ('under_13','under_16','none','unknown')),
  policy_ambiguity_score smallint,
  policy_behavior_conflict_candidate boolean,
  policy_actionable_flags text[] not null default '{}',
  policy_evidence_snippets jsonb not null default '{}'::jsonb,
  policy_semantic_confidence real,
  policy_ai_model text,
  policy_ai_model_version text,
  policy_ai_prompt_version text,
  policy_ai_run_at timestamptz,
  archive_source text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists policy_enrichment_scan_id_idx
  on public.policy_enrichment (scan_id, created_at desc);

create index if not exists policy_enrichment_hash_idx
  on public.policy_enrichment (normalized_policy_hash);

create index if not exists policy_enrichment_mentions_gin_idx
  on public.policy_enrichment using gin (policy_mentions);

create index if not exists policy_enrichment_flags_gin_idx
  on public.policy_enrichment using gin (policy_actionable_flags);

create table if not exists public.policy_review_queue (
  id uuid primary key,
  policy_enrichment_id uuid not null references public.policy_enrichment (id) on delete cascade,
  scan_id uuid not null references public.scans (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  assigned_to uuid references public.users (id) on delete set null,
  review_status text not null default 'pending' check (review_status in ('pending','in_review','resolved','dismissed')),
  reviewer_notes text,
  reviewed_at timestamptz,
  review_verdict text check (review_verdict in ('confirmed','dismissed','needs_followup','needs_legal_review','unknown'))
);

create index if not exists policy_review_queue_scan_id_idx
  on public.policy_review_queue (scan_id, created_at desc);

create index if not exists policy_review_queue_status_idx
  on public.policy_review_queue (review_status, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scan_snapshots_policy_enrichment_id_fkey'
  ) then
    alter table public.scan_snapshots
      add constraint scan_snapshots_policy_enrichment_id_fkey
      foreign key (policy_enrichment_id) references public.policy_enrichment (id) on delete set null;
  end if;
end $$;

alter table public.policy_enrichment enable row level security;
alter table public.policy_evidence enable row level security;
alter table public.policy_review_queue enable row level security;

drop policy if exists policy_enrichment_select_member on public.policy_enrichment;
create policy policy_enrichment_select_member
on public.policy_enrichment
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = policy_enrichment.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists policy_evidence_select_member on public.policy_evidence;
create policy policy_evidence_select_member
on public.policy_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.policy_enrichment
    join public.scans on scans.id = policy_enrichment.scan_id
    where scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
      and (
        policy_enrichment.policy_evidence_snippets::text like ('%' || policy_evidence.evidence_hash || '%')
      )
  )
);

drop policy if exists policy_review_queue_select_member on public.policy_review_queue;
create policy policy_review_queue_select_member
on public.policy_review_queue
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = policy_review_queue.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);
