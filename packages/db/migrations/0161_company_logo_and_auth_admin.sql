alter table public.organizations
  add column if not exists logo_storage_key text;

alter table public.better_auth_users
  add column if not exists role text not null default 'user';

create index if not exists organization_members_role_idx
  on public.organization_members (organization_id, role);
