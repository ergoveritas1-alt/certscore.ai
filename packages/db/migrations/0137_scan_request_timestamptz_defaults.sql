alter table public.scan_requests
  alter column requested_at set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();
