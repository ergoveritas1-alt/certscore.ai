alter table public.organizations
  add column if not exists report_header_theme text not null default 'white'
  check (report_header_theme in ('white', 'black'));
