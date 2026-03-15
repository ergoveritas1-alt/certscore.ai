alter table public.scan_snapshots
  add column if not exists consent_interaction_model text,
  add column if not exists consent_accept_button_count smallint,
  add column if not exists consent_reject_button_count smallint,
  add column if not exists consent_preferences_button_count smallint;
