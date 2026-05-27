create index concurrently if not exists users_created_at_desc_idx
  on public.users (created_at desc);

create index concurrently if not exists pulse_requests_requested_at_desc_idx
  on public.pulse_requests (requested_at desc);
