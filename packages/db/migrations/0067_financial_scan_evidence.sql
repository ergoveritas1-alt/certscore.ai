alter table public.scan_snapshots
  add column if not exists performance_claim_present boolean not null default false,
  add column if not exists performance_claim_count integer not null default 0,
  add column if not exists return_or_yield_percentage_present boolean not null default false,
  add column if not exists investment_outperformance_language_present boolean not null default false,
  add column if not exists guaranteed_return_language_present boolean not null default false,
  add column if not exists low_risk_high_return_language_present boolean not null default false,
  add column if not exists hypothetical_or_backtest_language_present boolean not null default false,
  add column if not exists testimonial_or_review_block_near_financial_claim_present boolean not null default false,
  add column if not exists risk_disclosure_text_present boolean not null default false,
  add column if not exists claim_cta_block_present boolean not null default false,
  add column if not exists financial_claim_with_cta_count integer not null default 0,
  add column if not exists about_page_present boolean not null default false,
  add column if not exists team_or_leadership_page_present boolean not null default false,
  add column if not exists jurisdiction_or_operating_entity_text_present boolean not null default false,
  add column if not exists registration_claim_present boolean not null default false,
  add column if not exists registration_identifier_present boolean not null default false,
  add column if not exists multiple_entity_names_detected boolean not null default false,
  add column if not exists entity_transparency_surface_score integer,
  add column if not exists pricing_page_present boolean not null default false,
  add column if not exists fee_related_text_present boolean not null default false,
  add column if not exists fee_schedule_present boolean not null default false,
  add column if not exists withdrawal_terms_present boolean not null default false,
  add column if not exists cancellation_terms_present boolean not null default false,
  add column if not exists account_closure_terms_present boolean not null default false,
  add column if not exists promo_price_or_free_claim_present boolean not null default false,
  add column if not exists variable_fee_language_without_explanation boolean not null default false,
  add column if not exists material_fee_terms_min_link_depth integer,
  add column if not exists leverage_language_present boolean not null default false,
  add column if not exists margin_trading_language_present boolean not null default false,
  add column if not exists options_or_futures_language_present boolean not null default false,
  add column if not exists perpetuals_or_derivatives_language_present boolean not null default false,
  add column if not exists staking_apy_language_present boolean not null default false,
  add column if not exists copy_trading_language_present boolean not null default false,
  add column if not exists ai_trading_language_present boolean not null default false,
  add column if not exists loss_risk_disclosure_text_present boolean not null default false,
  add column if not exists high_risk_product_explainer_page_present boolean not null default false,
  add column if not exists high_risk_product_signal_count integer not null default 0;

create table if not exists public.scan_page_evidence (
  scan_id uuid not null references public.scans (id) on delete cascade,
  evidence_id text not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  domain_id uuid references public.domains (id) on delete cascade,
  page_url text not null,
  page_type text not null,
  page_role text not null,
  crawl_depth integer,
  source_kind text not null,
  matched_text text,
  selector text,
  dom_path text,
  container_selector text,
  container_dom_path text,
  sibling_index integer,
  token_start integer,
  token_end integer,
  screenshot_ref text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (scan_id, evidence_id)
);

create index if not exists scan_page_evidence_scan_id_idx
  on public.scan_page_evidence (scan_id, page_url);

create index if not exists scan_page_evidence_domain_id_idx
  on public.scan_page_evidence (domain_id, created_at desc);

create table if not exists public.scan_signal_hits (
  scan_id uuid not null references public.scans (id) on delete cascade,
  id text not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  domain_id uuid references public.domains (id) on delete cascade,
  signal_key text not null,
  detector_name text not null,
  detector_type text not null,
  detector_version text not null,
  page_url text not null,
  page_type text not null,
  page_role text not null,
  evidence_refs text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (scan_id, id)
);

create index if not exists scan_signal_hits_scan_id_idx
  on public.scan_signal_hits (scan_id, signal_key);

create index if not exists scan_signal_hits_domain_id_idx
  on public.scan_signal_hits (domain_id, created_at desc);
