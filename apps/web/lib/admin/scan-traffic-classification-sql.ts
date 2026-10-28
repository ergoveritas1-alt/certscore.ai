import { scanCanaryTargetSql } from "./canary-scan-target";
import { scanCreatorSql, scanOriginalRequestsSql } from "./scan-creation-source";

function requesterJoinsSql() {
  return `left join public.integration_api_keys origin_key on origin_key.public_id = origin.requested_by ->> 'apiKeyId'
    left join public.users origin_user on origin_user.id::text = coalesce(origin.requested_by ->> 'userId', origin_key.owner_user_id::text)
    left join public.better_auth_users origin_auth_user on origin_auth_user.id = coalesce(origin.requested_by ->> 'userId', origin_key.owner_user_id::text)`;
}

function requesterQaSql(emailParam: string, ipParam: string, clientParam: string) {
  return `(lower(coalesce(origin_user.email, origin_auth_user.email, origin_key.created_by, '')) = any(${emailParam}::text[])
    or trim(split_part(coalesce(nullif(origin.request_context ->> 'sourceIp', ''), nullif(origin.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(origin.requested_by ->> 'sourceIp', ''), ''), '/', 1)) = any(${ipParam}::text[])
    or lower(coalesce(nullif(origin.request_context ->> 'clientName', ''), nullif(origin.request_context ->> 'client', ''), '')) = any(${clientParam}::text[]))`;
}

export function scanOriginalRequesterQaSql(scanId: string, emailParam: string, ipParam: string, clientParam: string) {
  return `exists (select 1 from (${scanCreatorSql(scanId)}) origin ${requesterJoinsSql()}
    where ${requesterQaSql(emailParam, ipParam, clientParam)})`;
}

export function scanOriginalRequesterMacMiniSql(scanId: string, keysParam: string) {
  return `exists (select 1 from (${scanCreatorSql(scanId)}) origin ${requesterJoinsSql()}
    where origin_key.name = any(${keysParam}::text[]))`;
}

export function scanOriginalRequestCanarySql(scanId: string) {
  return `exists (select 1 from (${scanCreatorSql(scanId)}) origin
    where coalesce(origin.requested_url, '') ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/')`;
}

// Parameters: Mac mini key names, QA emails, QA requester IPs, QA client names.
// Select the original request before classifying it. A later internal result
// lookup (or daemon reuse) cannot change the audience of an existing scan.
export const SCAN_TRAFFIC_CLASSIFICATION_SQL = `with origins as materialized (
    ${scanOriginalRequestsSql()}
  ), classified as (
    select origin.scan_id,
      ${requesterQaSql("$2", "$3", "$4")} as qa,
      origin_key.name = any($1::text[]) as macmini,
      coalesce(origin.requested_url, '') ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/' as canary
    from origins origin ${requesterJoinsSql()}
  ), canary_scan_ids as (
    select s.id as scan_id from public.scans s where ${scanCanaryTargetSql("s.scan_config_json")}
    union
    select sp.scan_id from public.scan_pages sp
      where sp.page_url ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/'
    union
    select scan_id from classified where qa or canary
  ) select
    coalesce((select array_agg(scan_id::text) from canary_scan_ids), '{}') as qa,
    coalesce((select array_agg(scan_id::text) from classified where macmini), '{}') as macmini`;

// Batch the same original-request proof for a bounded set of scan IDs. Never
// constrain original request timestamps: a current reuse may point to an old run.
export function scanActivityTrafficClassificationCtes(scanIdsSql: string) {
  return `activity_origins as materialized (
    ${scanOriginalRequestsSql(scanIdsSql)}
  ), activity_classified as materialized (
    select origin.scan_id, ${requesterQaSql("$23", "$24", "$25")} as qa,
      origin_key.name = any($22::text[]) as macmini,
      coalesce(origin.requested_url, '') ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/' as canary
    from activity_origins origin ${requesterJoinsSql()}
  ), activity_canary_scan_ids as materialized (
    select s.id as scan_id from public.scans s
      where s.id in (${scanIdsSql}) and ${scanCanaryTargetSql("s.scan_config_json")}
    union select sp.scan_id from public.scan_pages sp
      where sp.scan_id in (${scanIdsSql}) and sp.page_url ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/'
    union select scan_id from activity_classified where qa or canary
  )`;
}
