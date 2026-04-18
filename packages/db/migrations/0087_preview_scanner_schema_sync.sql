alter table if exists public.scan_runtime_artifacts
  add column if not exists consent_actionable_choice_observed boolean,
  add column if not exists consent_baseline_tracker_operator_relationships text[] not null default '{}'::text[],
  add column if not exists consent_surface_observed boolean;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'scan_runtime_artifacts'
       and column_name = 'consent_baseline_tracker_operator_relationships'
       and udt_name <> '_text'
  ) then
    alter table public.scan_runtime_artifacts
      add column if not exists consent_baseline_tracker_operator_relationships_v2 text[] not null default '{}'::text[];

    update public.scan_runtime_artifacts
       set consent_baseline_tracker_operator_relationships_v2 = coalesce(
         array(
           select jsonb_array_elements_text(consent_baseline_tracker_operator_relationships)
         ),
         '{}'::text[]
       );

    alter table public.scan_runtime_artifacts
      drop column consent_baseline_tracker_operator_relationships;

    alter table public.scan_runtime_artifacts
      rename column consent_baseline_tracker_operator_relationships_v2 to consent_baseline_tracker_operator_relationships;
  end if;
end
$$;

create table if not exists public.scan_macro_enrichments (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans (id) on delete cascade,
  domain_id uuid references public.domains (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  source_stage text not null default 'ws01_pre_scan',
  status text not null check (
    status in (
      'success',
      'repaired_success',
      'low_confidence_success',
      'validation_failure',
      'model_error',
      'skipped'
    )
  ),
  model_name text not null,
  input_json jsonb not null default '{}'::jsonb,
  raw_response_text text,
  raw_response_json jsonb,
  normalized_output_json jsonb,
  confidence numeric,
  low_confidence boolean not null default false,
  retry_count integer not null default 0,
  latency_ms integer,
  validation_error text,
  token_usage_json jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_macro_enrichments_domain_id_idx
  on public.scan_macro_enrichments (domain_id, created_at desc);

create index if not exists scan_macro_enrichments_organization_id_idx
  on public.scan_macro_enrichments (organization_id, created_at desc);

create index if not exists scan_macro_enrichments_status_idx
  on public.scan_macro_enrichments (status, created_at desc);

drop trigger if exists scan_macro_enrichments_set_updated_at on public.scan_macro_enrichments;
create trigger scan_macro_enrichments_set_updated_at
before update on public.scan_macro_enrichments
for each row execute procedure public.set_updated_at();

alter table public.scan_macro_enrichments enable row level security;
