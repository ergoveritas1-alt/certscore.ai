-- Re-enable RLS for public tables added or recreated after the initial hardening pass.

alter table public.scan_snapshots enable row level security;
alter table public.scan_signals enable row level security;
alter table public.scan_tracker_vendors enable row level security;
alter table public.scan_accessibility_rule_counts enable row level security;
alter table public.scan_accessibility_rule_examples enable row level security;
alter table public.scan_pages enable row level security;
alter table public.compliance_change_events enable row level security;
alter table public.password_auth_users enable row level security;
alter table public.password_auth_sessions enable row level security;
alter table public.password_auth_rate_limits enable row level security;
alter table public.password_auth_verification_tokens enable row level security;
alter table public.password_auth_reset_tokens enable row level security;
alter table public.validation_targets enable row level security;
alter table public.validation_settings enable row level security;
alter table public.validation_runs enable row level security;
alter table public.validation_run_findings enable row level security;
alter table public.validation_verdicts enable row level security;
alter table public.validation_audit_events enable row level security;
alter table public.scan_page_evidence enable row level security;
alter table public.scan_signal_hits enable row level security;
alter table public.industries enable row level security;
alter table public.scanner_egress_risk_state enable row level security;
alter table public.robots_txt_artifacts enable row level security;

drop policy if exists scan_snapshots_select_member on public.scan_snapshots;
create policy scan_snapshots_select_member
on public.scan_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_snapshots.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists scan_signals_select_member on public.scan_signals;
create policy scan_signals_select_member
on public.scan_signals
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_signals.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists scan_tracker_vendors_select_member on public.scan_tracker_vendors;
create policy scan_tracker_vendors_select_member
on public.scan_tracker_vendors
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_tracker_vendors.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists scan_accessibility_rule_counts_select_member on public.scan_accessibility_rule_counts;
create policy scan_accessibility_rule_counts_select_member
on public.scan_accessibility_rule_counts
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_accessibility_rule_counts.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists scan_accessibility_rule_examples_select_member on public.scan_accessibility_rule_examples;
create policy scan_accessibility_rule_examples_select_member
on public.scan_accessibility_rule_examples
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_accessibility_rule_examples.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
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

drop policy if exists compliance_change_events_select_member on public.compliance_change_events;
create policy compliance_change_events_select_member
on public.compliance_change_events
for select
to authenticated
using (
  organization_id is not null
  and public.is_current_user_member_of_organization(organization_id)
);

drop policy if exists scan_page_evidence_select_member on public.scan_page_evidence;
create policy scan_page_evidence_select_member
on public.scan_page_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_page_evidence.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists scan_signal_hits_select_member on public.scan_signal_hits;
create policy scan_signal_hits_select_member
on public.scan_signal_hits
for select
to authenticated
using (
  exists (
    select 1
    from public.scans
    where scans.id = scan_signal_hits.scan_id
      and scans.organization_id is not null
      and public.is_current_user_member_of_organization(scans.organization_id)
  )
);

drop policy if exists robots_txt_artifacts_select_member on public.robots_txt_artifacts;
create policy robots_txt_artifacts_select_member
on public.robots_txt_artifacts
for select
to authenticated
using (
  organization_id is not null
  and public.is_current_user_member_of_organization(organization_id)
);

drop policy if exists industries_select_authenticated on public.industries;
create policy industries_select_authenticated
on public.industries
for select
to authenticated
using (true);
