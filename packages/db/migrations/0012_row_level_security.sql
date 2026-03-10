-- CertScore RLS hardening.
-- Server-side writes currently use the Supabase service role, which bypasses RLS.
-- These policies protect direct authenticated access and keep organization-scoped data isolated.

create or replace function public.is_current_user_member_of_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$$;

grant execute on function public.is_current_user_member_of_organization(uuid) to authenticated;

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.domains enable row level security;
alter table public.scans enable row level security;
alter table public.scan_events enable row level security;
alter table public.scan_pages enable row level security;
alter table public.findings enable row level security;
alter table public.risk_scores enable row level security;
alter table public.score_breakdowns enable row level security;
alter table public.reports enable row level security;
alter table public.scan_regressions enable row level security;
alter table public.clients enable row level security;
alter table public.organization_settings enable row level security;
alter table public.usage_counters enable row level security;
alter table public.plan_limits enable row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self
on public.users
for select
to authenticated
using (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
on public.organizations
for select
to authenticated
using (public.is_current_user_member_of_organization(id));

drop policy if exists organization_members_select_member on public.organization_members;
create policy organization_members_select_member
on public.organization_members
for select
to authenticated
using (public.is_current_user_member_of_organization(organization_id));

drop policy if exists domains_select_member on public.domains;
create policy domains_select_member
on public.domains
for select
to authenticated
using (
  organization_id is not null
  and public.is_current_user_member_of_organization(organization_id)
);

drop policy if exists scans_select_member on public.scans;
create policy scans_select_member
on public.scans
for select
to authenticated
using (
  organization_id is not null
  and public.is_current_user_member_of_organization(organization_id)
);

drop policy if exists scan_events_select_member on public.scan_events;
create policy scan_events_select_member
on public.scan_events
for select
to authenticated
using (
  organization_id is not null
  and public.is_current_user_member_of_organization(organization_id)
);

drop policy if exists scan_pages_select_member on public.scan_pages;
create policy scan_pages_select_member
on public.scan_pages
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_pages.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists findings_select_member on public.findings;
create policy findings_select_member
on public.findings
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = findings.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists risk_scores_select_member on public.risk_scores;
create policy risk_scores_select_member
on public.risk_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = risk_scores.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists score_breakdowns_select_member on public.score_breakdowns;
create policy score_breakdowns_select_member
on public.score_breakdowns
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = score_breakdowns.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists reports_select_member on public.reports;
create policy reports_select_member
on public.reports
for select
to authenticated
using (public.is_current_user_member_of_organization(organization_id));

drop policy if exists scan_regressions_select_member on public.scan_regressions;
create policy scan_regressions_select_member
on public.scan_regressions
for select
to authenticated
using (public.is_current_user_member_of_organization(organization_id));

drop policy if exists clients_select_member on public.clients;
create policy clients_select_member
on public.clients
for select
to authenticated
using (public.is_current_user_member_of_organization(organization_id));

drop policy if exists organization_settings_select_member on public.organization_settings;
create policy organization_settings_select_member
on public.organization_settings
for select
to authenticated
using (public.is_current_user_member_of_organization(organization_id));

drop policy if exists usage_counters_select_member on public.usage_counters;
create policy usage_counters_select_member
on public.usage_counters
for select
to authenticated
using (public.is_current_user_member_of_organization(organization_id));

drop policy if exists plan_limits_select_authenticated on public.plan_limits;
create policy plan_limits_select_authenticated
on public.plan_limits
for select
to authenticated
using (true);
