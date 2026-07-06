create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris jsonb not null,
  scope text[] not null default array['scan:read', 'mcp']::text[],
  token_endpoint_auth_method text not null default 'none',
  grant_types text[] not null default array['authorization_code', 'refresh_token']::text[],
  response_types text[] not null default array['code']::text[],
  requester_ip_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz
);

create index if not exists mcp_oauth_clients_requester_created_idx
  on public.mcp_oauth_clients (requester_ip_hash, created_at desc)
  where requester_ip_hash is not null;

create table if not exists public.mcp_oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null check (code_challenge_method = 'S256'),
  scope text[] not null,
  organization_id uuid,
  owner_user_id text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists mcp_oauth_authorization_codes_client_created_idx
  on public.mcp_oauth_authorization_codes (client_id, created_at desc);

create table if not exists public.mcp_oauth_refresh_tokens (
  token_hash text primary key,
  family_id uuid not null default gen_random_uuid(),
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  scope text[] not null,
  organization_id uuid,
  owner_user_id text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz
);

create index if not exists mcp_oauth_refresh_tokens_client_created_idx
  on public.mcp_oauth_refresh_tokens (client_id, created_at desc);

create index if not exists mcp_oauth_refresh_tokens_family_idx
  on public.mcp_oauth_refresh_tokens (family_id);

create table if not exists public.mcp_oauth_scan_create_grants (
  id uuid primary key default gen_random_uuid(),
  grant_kind text not null check (grant_kind in ('client', 'organization', 'user')),
  grantee_id text not null,
  reason text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  revoked_by text
);

create unique index if not exists mcp_oauth_scan_create_grants_active_idx
  on public.mcp_oauth_scan_create_grants (grant_kind, grantee_id)
  where revoked_at is null;

create index if not exists mcp_oauth_scan_create_grants_created_idx
  on public.mcp_oauth_scan_create_grants (created_at desc);
