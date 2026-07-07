alter table public.integration_api_key_issuance_events
  drop constraint if exists integration_api_key_issuance_events_event_type_check;

alter table public.integration_api_key_issuance_events
  add constraint integration_api_key_issuance_events_event_type_check
  check (
    event_type in (
      'self_serve_read_only_issued',
      'self_serve_read_only_denied_unverified_email',
      'self_serve_read_only_denied_disposable_email',
      'self_serve_read_only_denied_email_cap',
      'self_serve_read_only_denied_ip_cap',
      'self_serve_scan_create_issued',
      'self_serve_scan_create_denied_unverified_email',
      'self_serve_scan_create_denied_disposable_email',
      'self_serve_scan_create_denied_email_cap',
      'self_serve_scan_create_denied_ip_cap'
    )
  );
