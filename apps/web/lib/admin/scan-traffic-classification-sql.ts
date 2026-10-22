import { scanCanaryTargetSql } from "./canary-scan-target";

// Parameters: Mac mini key names, QA emails, QA requester IPs, QA client names.
export const SCAN_TRAFFIC_CLASSIFICATION_SQL = `with canary_scan_ids as materialized (
         select s.id as scan_id from public.scans s
          where ${scanCanaryTargetSql("s.scan_config_json")}
         union
         select sp.scan_id
           from public.scan_pages sp
          where sp.page_url ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/'
         union
         select coalesce(sr.fulfilled_by_scan_id, sr.scan_id) as scan_id
           from public.scan_requests sr
          where coalesce(sr.fulfilled_by_scan_id, sr.scan_id) is not null
            and coalesce(sr.requested_url, '') ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/'
         union
         select pr.scan_id
           from public.pulse_requests pr
          where pr.scan_id is not null
            and coalesce(pr.requested_url, '') ~* '^https?://[^/?#]+/\\.well-known/certscore-canary/'
         union
         select iqa_pr.scan_id
           from public.pulse_requests iqa_pr
           left join public.integration_api_keys iqa_key on iqa_key.public_id = iqa_pr.requested_by ->> 'apiKeyId'
           left join public.users iqa_user on iqa_user.id::text = coalesce(iqa_pr.requested_by ->> 'userId', iqa_key.owner_user_id::text)
           left join public.better_auth_users iqa_auth_user on iqa_auth_user.id = iqa_pr.requested_by ->> 'userId'
          where iqa_pr.scan_id is not null
            and (
              lower(coalesce(iqa_user.email, iqa_auth_user.email, iqa_key.created_by, '')) = any($2::text[])
              or trim(split_part(coalesce(nullif(iqa_pr.request_context ->> 'sourceIp', ''), nullif(iqa_pr.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(iqa_pr.requested_by ->> 'sourceIp', ''), ''), '/', 1)) = any($3::text[])
              or lower(coalesce(nullif(iqa_pr.request_context ->> 'clientName', ''), nullif(iqa_pr.request_context ->> 'client', ''), '')) = any($4::text[])
            )
         union
         select coalesce(iqa_sr.fulfilled_by_scan_id, iqa_sr.scan_id)
           from public.scan_requests iqa_sr
           left join public.integration_api_keys iqa_key on iqa_key.public_id = iqa_sr.requested_by ->> 'apiKeyId'
           left join public.users iqa_user on iqa_user.id::text = coalesce(iqa_sr.requested_by ->> 'userId', iqa_key.owner_user_id::text)
           left join public.better_auth_users iqa_auth_user on iqa_auth_user.id = iqa_sr.requested_by ->> 'userId'
          where coalesce(iqa_sr.fulfilled_by_scan_id, iqa_sr.scan_id) is not null
            and (
              lower(coalesce(iqa_user.email, iqa_auth_user.email, iqa_key.created_by, '')) = any($2::text[])
              or trim(split_part(coalesce(nullif(iqa_sr.request_context ->> 'sourceIp', ''), nullif(iqa_sr.request_context -> 'provenance' ->> 'sourceIp', ''), nullif(iqa_sr.requested_by ->> 'sourceIp', ''), ''), '/', 1)) = any($3::text[])
              or lower(coalesce(nullif(iqa_sr.request_context ->> 'clientName', ''), nullif(iqa_sr.request_context ->> 'client', ''), '')) = any($4::text[])
            )
       ), mac_mini_scan_bot_keys as materialized (
         select public_id
           from public.integration_api_keys
          where name = any($1::text[])
       ), mac_mini_scan_bot_scan_ids as materialized (
         select pr.scan_id
           from public.pulse_requests pr
           join mac_mini_scan_bot_keys bot_key on bot_key.public_id = pr.requested_by ->> 'apiKeyId'
          where pr.scan_id is not null
         union
         select coalesce(sr.fulfilled_by_scan_id, sr.scan_id) as scan_id
           from public.scan_requests sr
           join mac_mini_scan_bot_keys bot_key on bot_key.public_id = sr.requested_by ->> 'apiKeyId'
          where coalesce(sr.fulfilled_by_scan_id, sr.scan_id) is not null
       ) select
       coalesce((select array_agg(scan_id::text) from canary_scan_ids), '{}') as qa,
       coalesce((select array_agg(scan_id::text) from mac_mini_scan_bot_scan_ids), '{}') as macmini`;
