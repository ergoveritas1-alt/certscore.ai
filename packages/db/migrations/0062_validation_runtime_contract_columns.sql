alter table public.validation_runs
  add column if not exists domain_id uuid references public.domains (id) on delete set null,
  add column if not exists triggered_by_user_id uuid references public.users (id) on delete set null;

alter table public.validation_targets
  add column if not exists consecutive_failures integer not null default 0;

update public.validation_targets
set consecutive_failures = coalesce(failure_count, 0)
where consecutive_failures = 0 and coalesce(failure_count, 0) <> 0;

alter table public.validation_audit_events
  add column if not exists metadata_json jsonb;
