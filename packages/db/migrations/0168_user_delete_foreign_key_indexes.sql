-- Keep user deletion from scanning large referencing tables while PostgreSQL
-- enforces ON DELETE CASCADE/SET NULL foreign keys.
create index if not exists scans_submitted_by_user_id_idx
  on public.scans (submitted_by_user_id)
  where submitted_by_user_id is not null;

create index if not exists policy_review_queue_assigned_to_idx
  on public.policy_review_queue (assigned_to)
  where assigned_to is not null;

create index if not exists validation_runs_triggered_by_user_id_idx
  on public.validation_runs (triggered_by_user_id)
  where triggered_by_user_id is not null;

create index if not exists validation_settings_updated_by_user_id_idx
  on public.validation_settings (updated_by_user_id)
  where updated_by_user_id is not null;

create index if not exists validation_audit_events_actor_user_id_idx
  on public.validation_audit_events (actor_user_id)
  where actor_user_id is not null;
