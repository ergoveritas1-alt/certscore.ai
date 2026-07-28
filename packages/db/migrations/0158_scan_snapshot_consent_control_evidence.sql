alter table if exists public.scan_snapshots
  add column if not exists consent_control_evidence jsonb;

comment on column public.scan_snapshots.consent_control_evidence is
  'Bounded canonical first-layer consent-control evidence used by the persisted report read model; excludes raw DOM and selectors.';
