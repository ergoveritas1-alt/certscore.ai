grant select on public.worker_heartbeats to anon;
grant select on public.worker_heartbeats to authenticated;
grant select, insert, update, delete on public.worker_heartbeats to service_role;

alter table public.worker_heartbeats enable row level security;

drop policy if exists worker_heartbeats_select_anon_none on public.worker_heartbeats;
create policy worker_heartbeats_select_anon_none
on public.worker_heartbeats
for select
to anon
using (false);

drop policy if exists worker_heartbeats_select_authenticated_none on public.worker_heartbeats;
create policy worker_heartbeats_select_authenticated_none
on public.worker_heartbeats
for select
to authenticated
using (false);
