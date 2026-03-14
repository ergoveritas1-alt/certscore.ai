alter table public.users
  drop constraint if exists users_id_fkey;

create table if not exists public.password_auth_users (
  id uuid primary key references public.users (id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz,
  constraint password_auth_users_email_normalized check (email = lower(btrim(email)))
);

create unique index if not exists password_auth_users_email_idx
  on public.password_auth_users (email);

drop trigger if exists set_password_auth_users_updated_at on public.password_auth_users;
create trigger set_password_auth_users_updated_at
before update on public.password_auth_users
for each row
execute function public.set_updated_at();

create table if not exists public.password_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.password_auth_users (id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz,
  ip_address inet,
  user_agent text
);

create index if not exists password_auth_sessions_user_id_idx
  on public.password_auth_sessions (user_id);

create index if not exists password_auth_sessions_expires_at_idx
  on public.password_auth_sessions (expires_at);

drop trigger if exists set_password_auth_sessions_updated_at on public.password_auth_sessions;
create trigger set_password_auth_sessions_updated_at
before update on public.password_auth_sessions
for each row
execute function public.set_updated_at();

create table if not exists public.password_auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  bucket_key text not null,
  attempts integer not null default 0,
  window_started_at timestamptz not null,
  blocked_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (action, bucket_key)
);

create index if not exists password_auth_rate_limits_action_bucket_key_idx
  on public.password_auth_rate_limits (action, bucket_key);

drop trigger if exists set_password_auth_rate_limits_updated_at on public.password_auth_rate_limits;
create trigger set_password_auth_rate_limits_updated_at
before update on public.password_auth_rate_limits
for each row
execute function public.set_updated_at();
