create index if not exists monitor_site_requests_public_status_token_idx
  on public.monitor_site_requests ((metadata_json->>'publicStatusToken'));
