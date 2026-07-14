create unique index if not exists scans_client_request_id_idx
  on public.scans ((scan_config_json->>'clientRequestId'))
  where scan_config_json ? 'clientRequestId';
