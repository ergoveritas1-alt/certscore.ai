alter table public.policy_enrichment
  add column if not exists page_type text,
  add column if not exists privacy_contact_channel_type text check (privacy_contact_channel_type in ('email','form','portal','none')),
  add column if not exists policy_retention_disclosure text check (policy_retention_disclosure in ('none','vague','specific')),
  add column if not exists policy_claim_no_sale boolean,
  add column if not exists policy_claim_no_tracking boolean,
  add column if not exists policy_claim_privacy_protective boolean;

alter table public.policy_evidence
  add column if not exists source_page_url text;

create index if not exists policy_enrichment_page_type_idx
  on public.policy_enrichment (page_type, created_at desc);
