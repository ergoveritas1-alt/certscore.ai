alter table public.scan_snapshots
  add column if not exists scan_outcome text,
  add column if not exists stop_reason_code text,
  add column if not exists stop_reason_label text,
  add column if not exists stop_reason_detail text,
  add column if not exists stop_reason_http_status smallint;

update public.scan_snapshots
set
  scan_outcome = case
    when robots_allowed = false then 'reachability_blocked'
    when homepage_fetch_http_status = 429 then 'reachability_blocked'
    when homepage_fetch_http_status = 403
      or homepage_fetch_status in ('forbidden', 'blocked')
      or blocked_flag = true then 'reachability_blocked'
    when captcha_flag = true then 'reachability_blocked'
    when auth_wall_detected = true then 'reachability_blocked'
    when homepage_fetch_status = 'not_found' then 'domain_inactive_or_unstable'
    when homepage_fetch_status = 'timeout' then 'transport_failure'
    when homepage_fetch_status = 'error' then 'transport_failure'
    when pages_scanned = 0 then 'verification_incomplete'
    else scan_outcome
  end,
  stop_reason_code = case
    when robots_allowed = false then 'robots_blocked'
    when homepage_fetch_http_status = 429 then 'homepage_blocked_429'
    when homepage_fetch_http_status = 403 then 'homepage_blocked_403'
    when homepage_fetch_status in ('forbidden', 'blocked') or blocked_flag = true then 'homepage_blocked'
    when captcha_flag = true then 'captcha'
    when auth_wall_detected = true then 'auth_wall'
    when homepage_fetch_status = 'not_found' then 'homepage_not_found'
    when homepage_fetch_status = 'timeout' then 'homepage_timeout'
    when homepage_fetch_status = 'error' then 'homepage_unreachable'
    when pages_scanned = 0 then 'no_pages_scanned'
    else stop_reason_code
  end,
  stop_reason_label = case
    when robots_allowed = false then 'Robots blocked'
    when homepage_fetch_http_status = 429 then 'HTTP 429'
    when homepage_fetch_http_status = 403 then 'HTTP 403'
    when homepage_fetch_status in ('forbidden', 'blocked') or blocked_flag = true then 'Reachability blocked'
    when captcha_flag = true then 'Captcha'
    when auth_wall_detected = true then 'Auth wall'
    when homepage_fetch_status = 'not_found' then 'Not found'
    when homepage_fetch_status = 'timeout' then 'Timeout'
    when homepage_fetch_status = 'error' then 'Transport failure'
    when pages_scanned = 0 then 'Verification incomplete'
    else stop_reason_label
  end,
  stop_reason_detail = case
    when robots_allowed = false and robots_fetch_status = 'ok' then 'robots.txt disallowed scanner access to the homepage.'
    when robots_allowed = false and robots_fetch_http_status is not null then
      concat('crawler access was blocked by robots handling with HTTP ', robots_fetch_http_status, ' before homepage verification.')
    when robots_allowed = false then 'crawler access was disallowed by robots policy before homepage verification.'
    when homepage_fetch_http_status = 429 then
      'homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface.'
    when homepage_fetch_http_status is not null
      and (
        homepage_fetch_http_status = 403
        or homepage_fetch_status in ('forbidden', 'blocked')
        or blocked_flag = true
      ) then concat('homepage request was blocked with HTTP ', homepage_fetch_http_status, '.')
    when homepage_fetch_status in ('forbidden', 'blocked') or blocked_flag = true then
      'homepage request was blocked by bot protection, access controls, or a forbidden response.'
    when captcha_flag = true then
      'the homepage triggered a captcha or bot challenge before the scanner could verify a usable public page surface.'
    when auth_wall_detected = true then
      'the homepage presented an authentication wall before the scanner could verify a usable public page surface.'
    when homepage_fetch_status = 'not_found' and homepage_fetch_http_status is not null then
      concat('homepage returned HTTP ', homepage_fetch_http_status, ' Not Found.')
    when homepage_fetch_status = 'not_found' then 'homepage returned a not-found response.'
    when homepage_fetch_status = 'timeout' then
      'homepage navigation timed out before the scanner could verify a usable page surface.'
    when homepage_fetch_status = 'error' then
      'homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.'
    when pages_scanned = 0 then 'no specific reachability blocker was retained for this run.'
    else stop_reason_detail
  end,
  stop_reason_http_status = case
    when robots_allowed = false then coalesce(robots_fetch_http_status, stop_reason_http_status)
    when homepage_fetch_http_status is not null then homepage_fetch_http_status
    else stop_reason_http_status
  end;
