alter table public.scan_snapshots
  add column if not exists request_domain_set_changed boolean,
  add column if not exists script_domain_set_changed boolean,
  add column if not exists security_header_posture_changed boolean;
