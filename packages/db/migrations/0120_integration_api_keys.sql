create table if not exists public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  scopes text[] not null default array[]::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  organization_id uuid,
  owner_user_id text,
  created_by text,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists integration_api_keys_status_expires_at_idx
  on public.integration_api_keys (status, expires_at);

create index if not exists integration_api_keys_organization_id_idx
  on public.integration_api_keys (organization_id);

drop trigger if exists set_integration_api_keys_updated_at on public.integration_api_keys;
create trigger set_integration_api_keys_updated_at
before update on public.integration_api_keys
for each row
execute function public.set_updated_at();
