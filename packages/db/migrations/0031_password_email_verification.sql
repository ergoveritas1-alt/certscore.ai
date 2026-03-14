alter table public.password_auth_users
  add column if not exists email_verified_at timestamptz;

create table if not exists public.password_auth_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.password_auth_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists password_auth_verification_tokens_user_id_idx
  on public.password_auth_verification_tokens (user_id);

create index if not exists password_auth_verification_tokens_expires_at_idx
  on public.password_auth_verification_tokens (expires_at);
