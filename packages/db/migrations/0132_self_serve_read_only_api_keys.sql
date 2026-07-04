create table if not exists public.integration_api_key_issuance_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  event_type text not null check (
    event_type in (
      'self_serve_read_only_issued',
      'self_serve_read_only_denied_unverified_email',
      'self_serve_read_only_denied_disposable_email',
      'self_serve_read_only_denied_email_cap',
      'self_serve_read_only_denied_ip_cap'
    )
  ),
  email_hash text,
  email_domain text,
  requester_ip_hash text,
  organization_id uuid,
  owner_user_id text,
  api_key_public_id text references public.integration_api_keys (public_id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists integration_api_key_issuance_events_email_created_idx
  on public.integration_api_key_issuance_events (email_hash, created_at desc)
  where email_hash is not null;

create index if not exists integration_api_key_issuance_events_ip_created_idx
  on public.integration_api_key_issuance_events (requester_ip_hash, created_at desc)
  where requester_ip_hash is not null;

create index if not exists integration_api_key_issuance_events_org_created_idx
  on public.integration_api_key_issuance_events (organization_id, created_at desc)
  where organization_id is not null;
