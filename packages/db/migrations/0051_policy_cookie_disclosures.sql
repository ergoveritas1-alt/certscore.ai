alter table public.policy_enrichment
  add column if not exists policy_cookie_disclosures jsonb not null default '[]'::jsonb;
