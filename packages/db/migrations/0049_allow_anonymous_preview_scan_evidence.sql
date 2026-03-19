alter table public.scan_signals
  alter column organization_id drop not null;

alter table public.scan_runtime_artifacts
  alter column organization_id drop not null;

alter table public.scan_tracker_vendors
  alter column organization_id drop not null;

alter table public.scan_accessibility_rule_counts
  alter column organization_id drop not null;

alter table public.scan_accessibility_rule_examples
  alter column organization_id drop not null;

alter table public.scan_preconsent_violations
  alter column organization_id drop not null;

alter table public.scan_pages
  alter column organization_id drop not null;
