create index concurrently if not exists scan_requests_effective_scan_requested_at_idx
  on public.scan_requests ((coalesce(fulfilled_by_scan_id, scan_id)), requested_at desc);

create index concurrently if not exists scan_requests_admin_unlinked_requested_at_idx
  on public.scan_requests (requested_at desc)
  where coalesce(fulfilled_by_scan_id, scan_id) is null
     or resolution_mode = 'reused_existing_scan';

create index concurrently if not exists pulse_requests_scan_requested_at_idx
  on public.pulse_requests (scan_id, requested_at desc);

create index concurrently if not exists pulse_artifact_downloads_request_artifact_idx
  on public.pulse_artifact_downloads (pulse_request_id, artifact_type)
  where pulse_request_id is not null;

create index concurrently if not exists better_auth_sessions_user_created_at_idx
  on public.better_auth_sessions (user_id, created_at desc);
