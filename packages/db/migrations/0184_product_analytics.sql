create table if not exists public.product_analytics_events (
  event_id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_name text not null check (event_name in (
    'page_viewed', 'navigation_clicked', 'action_clicked', 'form_started',
    'form_submitted', 'form_succeeded', 'form_failed', 'scan_started', 'scan_completed', 'scan_viewed',
    'report_viewed', 'scroll_depth_reached', 'session_engaged',
    'web_vital_recorded', 'client_error', 'account_created', 'analytics_opted_in', 'analytics_opted_out'
  )),
  category text not null check (category in ('navigation', 'interaction', 'form', 'scan', 'report', 'account', 'engagement', 'performance', 'reliability', 'preference')),
  feature text not null,
  outcome text not null check (outcome in ('observed', 'started', 'submitted', 'success', 'failure', 'opted_in', 'opted_out')),
  normalized_route text not null,
  previous_route text,
  entry_route text,
  element_id text,
  form_id text,
  session_id uuid,
  actor_id uuid,
  user_id uuid references public.users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  scan_id uuid references public.scans (id) on delete set null,
  consent_state text not null check (consent_state in ('measurement', 'granted', 'opted_out')),
  referring_domain text,
  campaign_source text,
  campaign_medium text,
  campaign_name text,
  browser_family text not null,
  os_family text not null,
  device_class text not null check (device_class in ('desktop', 'mobile', 'tablet', 'unknown')),
  viewport_band text check (viewport_band is null or viewport_band in ('xs', 'sm', 'md', 'lg', 'xl')),
  language text,
  country_code text,
  is_authenticated boolean not null default false,
  is_staff boolean not null default false,
  is_bot boolean not null default false,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  numeric_value numeric(12, 3),
  created_at timestamptz not null default now(),
  check (char_length(feature) between 1 and 80),
  check (char_length(normalized_route) between 1 and 300),
  check (previous_route is null or char_length(previous_route) between 1 and 300),
  check (entry_route is null or char_length(entry_route) between 1 and 300),
  check (element_id is null or char_length(element_id) between 1 and 100),
  check (form_id is null or char_length(form_id) between 1 and 100),
  check (referring_domain is null or char_length(referring_domain) between 1 and 253),
  check (campaign_source is null or char_length(campaign_source) between 1 and 80),
  check (campaign_medium is null or char_length(campaign_medium) between 1 and 80),
  check (campaign_name is null or char_length(campaign_name) between 1 and 120),
  check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

create index if not exists product_analytics_events_occurred_at_idx
  on public.product_analytics_events (occurred_at desc);
create index if not exists product_analytics_events_name_occurred_at_idx
  on public.product_analytics_events (event_name, occurred_at desc);
create index if not exists product_analytics_events_session_occurred_at_idx
  on public.product_analytics_events (session_id, occurred_at desc) where session_id is not null;
create index if not exists product_analytics_events_actor_occurred_at_idx
  on public.product_analytics_events (actor_id, occurred_at desc) where actor_id is not null;
create index if not exists product_analytics_events_user_occurred_at_idx
  on public.product_analytics_events (user_id, occurred_at desc) where user_id is not null;
create index if not exists product_analytics_events_scan_occurred_at_idx
  on public.product_analytics_events (scan_id, occurred_at desc) where scan_id is not null;
create index if not exists product_analytics_events_route_occurred_at_idx
  on public.product_analytics_events (normalized_route, occurred_at desc);

comment on table public.product_analytics_events is
  'Bounded first-party product analytics with a 90-day raw-event retention target. No raw IPs, passwords, tokens, keystrokes, form values, arbitrary page text, payment data, or session replay content.';
comment on column public.product_analytics_events.scan_id is
  'Reference to the canonical scan record. Scan evidence remains in the scan evidence system and is not copied into analytics.';
