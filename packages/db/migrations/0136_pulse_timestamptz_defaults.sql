alter table public.pulse_requests
  alter column requested_at set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.pulse_domain_throttles
  alter column last_scan_created_at set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.pulse_feedback
  alter column created_at set default now();

alter table public.pulse_artifact_downloads
  alter column created_at set default now();
