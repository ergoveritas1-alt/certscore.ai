alter table public.validation_settings
  add column if not exists last_worker_started_at timestamptz,
  add column if not exists last_worker_heartbeat_at timestamptz,
  add column if not exists last_worker_host text;
