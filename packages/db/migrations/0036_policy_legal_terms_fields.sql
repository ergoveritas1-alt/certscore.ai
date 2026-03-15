alter table public.policy_enrichment
  add column if not exists policy_effective_date text,
  add column if not exists policy_governing_law text,
  add column if not exists policy_arbitration_present boolean;

create index if not exists policy_enrichment_effective_date_idx
  on public.policy_enrichment (policy_effective_date);

create index if not exists policy_enrichment_governing_law_idx
  on public.policy_enrichment (policy_governing_law);
