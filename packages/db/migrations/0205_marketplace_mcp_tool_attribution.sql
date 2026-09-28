-- Attribution begins with new, successfully validated Marketplace MCP requests.
-- Historical Light events remain unattributed; no key material or buyer account is copied here.
alter table public.mcp_tool_invocation_events
  add column marketplace_agreement_id text,
  add column marketplace_license_arn text;

alter table public.mcp_tool_invocation_events
  drop constraint if exists mcp_tool_invocation_events_surface_check,
  add constraint mcp_tool_invocation_events_surface_check
    check (surface in ('mcp_light', 'mcp_marketplace_light', 'mcp_anonymous', 'mcp_authenticated')),
  drop constraint if exists mcp_tool_invocation_events_endpoint_check,
  add constraint mcp_tool_invocation_events_endpoint_check
    check (endpoint in ('/mcp/light', '/mcp/marketplace/light', '/mcp/anonymous', '/mcp')),
  add constraint mcp_tool_invocation_events_marketplace_identity_check
    check (
      (surface = 'mcp_marketplace_light' and endpoint = '/mcp/marketplace/light'
        and auth_class = 'authenticated' and marketplace_agreement_id is not null
        and marketplace_license_arn is not null)
      or (surface <> 'mcp_marketplace_light' and endpoint <> '/mcp/marketplace/light'
        and marketplace_agreement_id is null and marketplace_license_arn is null)
    ),
  add constraint mcp_tool_invocation_events_marketplace_privacy_check
    check (surface <> 'mcp_marketplace_light' or (
      request_details is null and actor_id is null and client_name is null
      and requester_ip is null and requester_ip_hash is null and session_id is null
      and target_hostname is null
      and ((requested_resource is null and requested_resource_type is null) or
        (requested_resource_type is not null and requested_resource is not null
          and requested_resource_type = 'scan_id' and requested_resource ~ '^[A-Za-z0-9_-]{1,128}$'))
      and source = 'unknown' and source_attribution = 'unknown'
      and caller_product = 'unknown' and client_family = 'unknown'
      and attribution_confidence = 'unknown' and attribution_signals = '[]'::jsonb
      and execution_channel = 'unknown' and installation_origin = 'unknown'
      and requester_network = 'unknown'
    )),
  add constraint mcp_tool_invocation_events_marketplace_agreement_id_check
    check (marketplace_agreement_id is null or
      (char_length(marketplace_agreement_id) between 1 and 256
       and marketplace_agreement_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$')),
  add constraint mcp_tool_invocation_events_marketplace_license_arn_check
    check (marketplace_license_arn is null or
      (char_length(marketplace_license_arn) between 1 and 512
       and marketplace_license_arn ~ '^arn:aws(-[a-z]+)?:license-manager:[A-Za-z0-9-]*:[0-9]{12}:license:[A-Za-z0-9/._-]+$'));

create index mcp_tool_invocation_events_marketplace_agreement_time_idx
  on public.mcp_tool_invocation_events (marketplace_agreement_id, occurred_at desc)
  where surface = 'mcp_marketplace_light';

create index mcp_tool_invocation_events_marketplace_license_time_idx
  on public.mcp_tool_invocation_events (marketplace_license_arn, occurred_at desc)
  where surface = 'mcp_marketplace_light';

comment on column public.mcp_tool_invocation_events.marketplace_agreement_id is
  'Validated AWS Marketplace agreement at the time of the MCP tool request. Marketplace tool events are retained indefinitely; never client supplied or backfilled.';
comment on column public.mcp_tool_invocation_events.marketplace_license_arn is
  'Validated license binding for server-side buyer lookup, including after agreement changes. No key or token hash is retained in telemetry.';
comment on table public.mcp_tool_invocation_events is
  'Hosted MCP tool telemetry: ordinary rows target 90 days; authenticated Marketplace Light rows are retained indefinitely with only validated agreement/license and bounded tool/scan/outcome metadata. No prompts, tool payloads, credentials or token hashes.';
