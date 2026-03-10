update public.organization_members
set role = case
  when role = 'owner' then 'admin'
  when role = 'member' then 'user'
  else role
end
where role in ('owner', 'member');

alter table public.organization_members
  alter column role set default 'admin';
