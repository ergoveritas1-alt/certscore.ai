alter table public.better_auth_users
  add column if not exists banned boolean not null default false,
  add column if not exists ban_reason text,
  add column if not exists ban_expires timestamptz;

alter table public.better_auth_sessions
  add column if not exists impersonated_by text;
