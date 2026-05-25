alter table public.organizations
  add column if not exists manual_rescan_limit_override integer;

alter table public.organizations
  drop constraint if exists organizations_manual_rescan_limit_override_nonnegative;

alter table public.organizations
  add constraint organizations_manual_rescan_limit_override_nonnegative
  check (manual_rescan_limit_override is null or manual_rescan_limit_override >= 0);
