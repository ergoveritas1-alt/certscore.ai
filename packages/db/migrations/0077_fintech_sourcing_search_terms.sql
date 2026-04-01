alter table public.organization_settings
  add column if not exists fintech_sourcing_search_terms jsonb not null default '[]'::jsonb;
