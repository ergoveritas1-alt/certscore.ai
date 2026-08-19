alter table public.product_analytics_events
  drop constraint if exists product_analytics_events_consent_state_check;

alter table public.product_analytics_events
  add constraint product_analytics_events_consent_state_check
  check (consent_state in ('operational', 'measurement', 'granted', 'opted_out'));

comment on column public.product_analytics_events.consent_state is
  'Operational marks necessary authenticated first-party activity. Measurement/granted/opted_out describe supplemental browser analytics consent handling.';
