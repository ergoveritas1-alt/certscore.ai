alter table public.scan_snapshots
  alter column organization_id drop not null;

insert into public.scan_snapshots (
  scan_id,
  organization_id,
  domain_id,
  scanner_schema_version,
  detection_engine_version,
  domain,
  registered_domain,
  scan_timestamp,
  crawl_source,
  crawl_tier,
  pages_requested,
  pages_scanned,
  total_signals,
  accessibility_signal_count,
  privacy_signal_count,
  disclosure_signal_count,
  high_severity_count,
  medium_severity_count,
  low_severity_count,
  tracker_vendor_count,
  robots_allowed,
  robots_fetch_status,
  homepage_fetch_status,
  final_url,
  final_url_scheme,
  redirect_count,
  render_mode_used,
  scan_confidence,
  partial_scan,
  timeout_flag,
  blocked_flag,
  captcha_flag,
  auth_wall_detected,
  cookie_banner_present,
  privacy_policy_present,
  terms_of_service_present,
  cookie_policy_present,
  refund_policy_present,
  certscore_overall,
  privacy_score,
  accessibility_score
)
select
  scans.id as scan_id,
  scans.organization_id,
  scans.domain_id,
  1 as scanner_schema_version,
  'stub-preview-v1' as detection_engine_version,
  domains.hostname as domain,
  domains.hostname as registered_domain,
  coalesce(scans.completed_at, scans.updated_at, scans.created_at) as scan_timestamp,
  'preview' as crawl_source,
  'quick' as crawl_tier,
  scans.pages_requested,
  scans.pages_scanned,
  coalesce(
    nullif((regexp_match(coalesce(scans.scan_config_json->'previewPayload'->'summaryBullets'->>0, ''), '([0-9]+)'))[1], '')::integer,
    jsonb_array_length(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb))
  ) as total_signals,
  (
    select count(*)
    from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
    where finding->>'category' = 'accessibility'
  ) as accessibility_signal_count,
  (
    select count(*)
    from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
    where finding->>'category' = 'privacy'
  ) as privacy_signal_count,
  (
    select count(*)
    from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
    where finding->>'category' not in ('accessibility', 'privacy')
  ) as disclosure_signal_count,
  coalesce((scans.scan_config_json->'previewPayload'->'issueCounts'->>'high')::integer, 0) as high_severity_count,
  coalesce((scans.scan_config_json->'previewPayload'->'issueCounts'->>'medium')::integer, 0) as medium_severity_count,
  coalesce((scans.scan_config_json->'previewPayload'->'issueCounts'->>'low')::integer, 0) as low_severity_count,
  0 as tracker_vendor_count,
  true as robots_allowed,
  'skipped' as robots_fetch_status,
  'skipped' as homepage_fetch_status,
  domains.normalized_url as final_url,
  case
    when domains.normalized_url like 'https://%' then 'https'
    when domains.normalized_url like 'http://%' then 'http'
    else null
  end as final_url_scheme,
  0 as redirect_count,
  'http_only' as render_mode_used,
  'low' as scan_confidence,
  true as partial_scan,
  false as timeout_flag,
  false as blocked_flag,
  false as captcha_flag,
  false as auth_wall_detected,
  exists (
    select 1
    from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
    where finding->>'category' = 'privacy'
  ) as cookie_banner_present,
  not exists (
    select 1
    from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
    where lower(coalesce(finding->>'title', '')) like '%privacy policy not detected%'
  ) as privacy_policy_present,
  not exists (
    select 1
    from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
    where lower(coalesce(finding->>'title', '')) like '%terms or disclosure links may be incomplete%'
  ) as terms_of_service_present,
  false as cookie_policy_present,
  false as refund_policy_present,
  greatest(
    0,
    100
      - coalesce((scans.scan_config_json->'previewPayload'->'issueCounts'->>'high')::integer, 0) * 20
      - coalesce((scans.scan_config_json->'previewPayload'->'issueCounts'->>'medium')::integer, 0) * 10
      - coalesce((scans.scan_config_json->'previewPayload'->'issueCounts'->>'low')::integer, 0) * 4
  ) as certscore_overall,
  greatest(
    0,
    100 - (
      select coalesce(sum(
        case
          when finding->>'severity' = 'high' then 24
          when finding->>'severity' = 'medium' then 12
          else 5
        end
      ), 0)
      from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
      where finding->>'category' = 'privacy'
    )
  ) as privacy_score,
  greatest(
    0,
    100 - (
      select coalesce(sum(
        case
          when finding->>'severity' = 'high' then 28
          when finding->>'severity' = 'medium' then 14
          else 6
        end
      ), 0)
      from jsonb_array_elements(coalesce(scans.scan_config_json->'previewPayload'->'sampleFindings', '[]'::jsonb)) finding
      where finding->>'category' = 'accessibility'
    )
  ) as accessibility_score
from public.scans
join public.domains on domains.id = scans.domain_id
left join public.scan_snapshots on scan_snapshots.scan_id = scans.id
where scans.scan_type = 'preview'
  and scans.status = 'completed'
  and scans.scan_config_json ? 'previewPayload'
  and scan_snapshots.scan_id is null;
