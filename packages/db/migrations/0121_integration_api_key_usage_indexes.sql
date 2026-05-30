create index if not exists pulse_requests_api_key_requested_at_idx
  on public.pulse_requests ((requested_by->>'apiKeyId'), requested_at desc)
  where requested_by ? 'apiKeyId';

create index if not exists pulse_requests_account_requested_at_idx
  on public.pulse_requests ((requested_by->>'accountId'), requested_at desc)
  where requested_by ? 'accountId';
