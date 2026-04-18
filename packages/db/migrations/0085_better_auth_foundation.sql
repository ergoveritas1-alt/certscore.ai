create table if not exists public.better_auth_users (
  id text primary key,
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint better_auth_users_email_normalized check (email = lower(btrim(email)))
);

create unique index if not exists better_auth_users_email_idx
  on public.better_auth_users (email);

drop trigger if exists set_better_auth_users_updated_at on public.better_auth_users;
create trigger set_better_auth_users_updated_at
before update on public.better_auth_users
for each row execute function public.set_updated_at();

create table if not exists public.better_auth_sessions (
  id text primary key,
  user_id text not null references public.better_auth_users (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists better_auth_sessions_user_id_idx
  on public.better_auth_sessions (user_id);

create index if not exists better_auth_sessions_expires_at_idx
  on public.better_auth_sessions (expires_at);

drop trigger if exists set_better_auth_sessions_updated_at on public.better_auth_sessions;
create trigger set_better_auth_sessions_updated_at
before update on public.better_auth_sessions
for each row execute function public.set_updated_at();

create table if not exists public.better_auth_accounts (
  id text primary key,
  user_id text not null references public.better_auth_users (id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  id_token text,
  password text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists better_auth_accounts_provider_account_idx
  on public.better_auth_accounts (provider_id, account_id);

create index if not exists better_auth_accounts_user_id_idx
  on public.better_auth_accounts (user_id);

drop trigger if exists set_better_auth_accounts_updated_at on public.better_auth_accounts;
create trigger set_better_auth_accounts_updated_at
before update on public.better_auth_accounts
for each row execute function public.set_updated_at();

create table if not exists public.better_auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists better_auth_verifications_identifier_idx
  on public.better_auth_verifications (identifier);

create index if not exists better_auth_verifications_expires_at_idx
  on public.better_auth_verifications (expires_at);

drop trigger if exists set_better_auth_verifications_updated_at on public.better_auth_verifications;
create trigger set_better_auth_verifications_updated_at
before update on public.better_auth_verifications
for each row execute function public.set_updated_at();
