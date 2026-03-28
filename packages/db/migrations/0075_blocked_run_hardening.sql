alter table public.scan_snapshots
  add column if not exists egress_id text,
  add column if not exists egress_type text,
  add column if not exists public_ip_hash text,
  add column if not exists asn integer,
  add column if not exists region text,
  add column if not exists user_agent_family text,
  add column if not exists browser_engine text,
  add column if not exists headless_mode text,
  add column if not exists playwright_version text,
  add column if not exists chromium_version text,
  add column if not exists initial_request_mode text,
  add column if not exists homepage_attempt_count integer not null default 0,
  add column if not exists passive_verification_attempt_count integer not null default 0,
  add column if not exists static_fetch_concurrency integer not null default 0,
  add column if not exists domain_risk_profile text,
  add column if not exists server_header text,
  add column if not exists cf_ray_present boolean not null default false,
  add column if not exists akamai_marker_present boolean not null default false,
  add column if not exists captcha_marker_present boolean not null default false,
  add column if not exists interstitial_marker_present boolean not null default false,
  add column if not exists normalized_body_title text,
  add column if not exists normalized_body_hash text,
  add column if not exists set_cookie_names text[] not null default '{}'::text[],
  add column if not exists block_vendor_guess text,
  add column if not exists block_page_classification text,
  add column if not exists challenge_suspected boolean not null default false,
  add column if not exists auth_wall_suspected boolean not null default false,
  add column if not exists rate_limit_suspected boolean not null default false,
  add column if not exists geo_block_suspected boolean not null default false,
  add column if not exists fingerprint_block_suspected boolean not null default false,
  add column if not exists retry_recommended boolean,
  add column if not exists cooldown_hours integer,
  add column if not exists passive_verification_attempted boolean not null default false,
  add column if not exists verified_public_surfaces_count integer not null default 0,
  add column if not exists coverage_level text;

create table if not exists public.scanner_egress_risk_state (
  egress_id text primary key,
  egress_type text,
  asn integer,
  region text,
  blocked_homepage_403_distinct_domains_60m integer not null default 0,
  high_block_risk_mode boolean not null default false,
  forced_concurrency integer not null default 4,
  launch_jitter_min_ms integer not null default 1000,
  launch_jitter_max_ms integer not null default 10000,
  suppress_non_essential_rescans boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_snapshots_block_vendor_guess_idx
  on public.scan_snapshots (block_vendor_guess, scan_timestamp desc);

create index if not exists scan_snapshots_egress_id_idx
  on public.scan_snapshots (egress_id, scan_timestamp desc);

create index if not exists scan_snapshots_normalized_body_hash_idx
  on public.scan_snapshots (normalized_body_hash, scan_timestamp desc);

update public.scan_snapshots
set
  coverage_level = coalesce(
    coverage_level,
    case
      when pages_scanned = 0 then 'limited_none'
      when pages_scanned < 3 or partial_scan = true then 'limited_partial'
      else 'broad'
    end
  ),
  verified_public_surfaces_count = greatest(
    verified_public_surfaces_count,
    (case when privacy_policy_present then 1 else 0 end) +
    (case when terms_of_service_present then 1 else 0 end) +
    (case when cookie_policy_present then 1 else 0 end) +
    (case when contact_page_present then 1 else 0 end)
  ),
  passive_verification_attempted = passive_verification_attempted or coalesce(passive_verification_attempt_count, 0) > 0,
  block_vendor_guess = coalesce(
    block_vendor_guess,
    case
      when cf_ray_present = true then 'cloudflare'
      when akamai_marker_present = true then 'akamai'
      else null
    end
  ),
  block_page_classification = coalesce(
    block_page_classification,
    case
      when captcha_flag = true or captcha_marker_present = true then 'captcha_probable'
      when auth_wall_detected = true or auth_wall_suspected = true then 'login_wall_probable'
      when challenge_suspected = true or interstitial_marker_present = true then 'vendor_interstitial_probable'
      when homepage_fetch_http_status = 403 then 'plain_origin_403'
      when normalized_body_hash is null and homepage_fetch_http_status in (401, 403) then 'empty_or_thin_block_page'
      else block_page_classification
    end
  ),
  retry_recommended = coalesce(
    retry_recommended,
    case
      when homepage_fetch_status = 'error' then true
      when homepage_fetch_status = 'timeout' then true
      when homepage_fetch_http_status in (401, 403, 429) then false
      else retry_recommended
    end
  ),
  cooldown_hours = coalesce(
    cooldown_hours,
    case
      when homepage_fetch_http_status = 429 then 8
      when challenge_suspected = true then 24
      when homepage_fetch_http_status = 403 then 24
      when homepage_fetch_status = 'error' then 2
      when homepage_fetch_status = 'timeout' then 2
      else cooldown_hours
    end
  ),
  scan_outcome = case
    when robots_allowed = false then 'robots_restricted'
    when homepage_fetch_http_status = 401 then 'reachability_blocked_homepage_401'
    when captcha_flag = true or captcha_marker_present = true then 'reachability_blocked_captcha'
    when auth_wall_detected = true or auth_wall_suspected = true then 'reachability_blocked_auth_wall'
    when geo_block_suspected = true or fingerprint_block_suspected = true then 'reachability_blocked_geo_or_reputation'
    when challenge_suspected = true then 'reachability_blocked_challenge_suspected'
    when homepage_fetch_status = 'timeout' then 'timeout_navigation'
    when homepage_fetch_status = 'error' then 'transport_failure'
    when homepage_fetch_status = 'not_found' then 'domain_inactive_or_unstable'
    when homepage_fetch_http_status = 403 or homepage_fetch_status in ('forbidden', 'blocked') or blocked_flag = true then 'reachability_blocked_homepage_403'
    when pages_scanned = 0 then coalesce(scan_outcome, 'unknown_access_limitation')
    else scan_outcome
  end,
  stop_reason_code = case
    when robots_allowed = false then 'robots_restricted'
    when homepage_fetch_http_status = 401 then 'reachability_blocked_homepage_401'
    when captcha_flag = true or captcha_marker_present = true then 'reachability_blocked_captcha'
    when auth_wall_detected = true or auth_wall_suspected = true then 'reachability_blocked_auth_wall'
    when geo_block_suspected = true or fingerprint_block_suspected = true then 'reachability_blocked_geo_or_reputation'
    when challenge_suspected = true then 'reachability_blocked_challenge_suspected'
    when homepage_fetch_http_status = 429 then 'homepage_rate_limited_429'
    when homepage_fetch_status = 'timeout' then 'timeout_navigation'
    when homepage_fetch_status = 'error' then 'transport_failure'
    when homepage_fetch_status = 'not_found' then 'inactive_or_unstable'
    when homepage_fetch_http_status = 403 or homepage_fetch_status in ('forbidden', 'blocked') or blocked_flag = true then 'reachability_blocked_homepage_403'
    when pages_scanned = 0 then coalesce(stop_reason_code, 'unknown_access_limitation')
    else stop_reason_code
  end,
  stop_reason_label = case
    when scan_outcome in (
      'reachability_blocked_homepage_403',
      'reachability_blocked_homepage_401',
      'reachability_blocked_challenge_suspected',
      'reachability_blocked_captcha',
      'reachability_blocked_auth_wall',
      'reachability_blocked_geo_or_reputation',
      'robots_restricted',
      'unknown_access_limitation'
    ) then 'Access limited by site protections'
    when scan_outcome = 'transport_failure' then 'Transport failure'
    when scan_outcome = 'timeout_navigation' then 'Navigation timeout'
    when scan_outcome = 'domain_inactive_or_unstable' then 'Domain inactive or unstable'
    else stop_reason_label
  end;
