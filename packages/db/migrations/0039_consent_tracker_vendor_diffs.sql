alter table public.scan_runtime_artifacts
  add column if not exists consent_reject_persisted_tracker_vendor_names text[] not null default '{}',
  add column if not exists consent_reject_new_tracker_vendor_names text[] not null default '{}',
  add column if not exists consent_accept_new_tracker_vendor_names text[] not null default '{}';
