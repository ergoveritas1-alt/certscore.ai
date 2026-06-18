alter table public.organization_settings
  add column if not exists default_scan_from text;

alter table public.organization_settings
  drop constraint if exists organization_settings_default_scan_from_check;

alter table public.organization_settings
  add constraint organization_settings_default_scan_from_check
  check (default_scan_from is null or default_scan_from in ('eu_de', 'eu_ie', 'california'));
