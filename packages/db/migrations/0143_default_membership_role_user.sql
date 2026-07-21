alter table public.organization_members
  alter column role set default 'user';

alter table public.organization_members
  drop constraint if exists organization_members_assignable_role_check;

alter table public.organization_members
  add constraint organization_members_assignable_role_check
  check (role in ('advanced', 'user')) not valid;
