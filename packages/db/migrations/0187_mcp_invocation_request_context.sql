alter table public.mcp_tool_invocation_events
  add column if not exists client_name text,
  add column if not exists requester_ip inet,
  add column if not exists requester_ip_hash text,
  add column if not exists requester_network text not null default 'unknown',
  add column if not exists requested_resource_type text,
  add column if not exists requested_resource text;

alter table public.mcp_tool_invocation_events
  drop constraint if exists mcp_tool_invocation_events_client_name_check,
  add constraint mcp_tool_invocation_events_client_name_check
    check (client_name is null or char_length(client_name) between 1 and 100),
  drop constraint if exists mcp_tool_invocation_events_requester_ip_hash_check,
  add constraint mcp_tool_invocation_events_requester_ip_hash_check
    check (requester_ip_hash is null or requester_ip_hash ~ '^[a-f0-9]{64}$'),
  drop constraint if exists mcp_tool_invocation_events_requester_network_check,
  add constraint mcp_tool_invocation_events_requester_network_check
    check (requester_network in ('anthropic', 'direct', 'unknown')),
  drop constraint if exists mcp_tool_invocation_events_requested_resource_type_check,
  add constraint mcp_tool_invocation_events_requested_resource_type_check
    check (requested_resource_type is null or requested_resource_type in ('url', 'domain', 'scan_id', 'job_id')),
  drop constraint if exists mcp_tool_invocation_events_requested_resource_check,
  add constraint mcp_tool_invocation_events_requested_resource_check
    check (requested_resource is null or char_length(requested_resource) between 1 and 512);

update public.mcp_tool_invocation_events
   set requested_resource_type = 'scan_id',
       requested_resource = scan_id
 where requested_resource is null
   and scan_id is not null;

update public.mcp_tool_invocation_events
   set requested_resource_type = 'domain',
       requested_resource = target_hostname
 where requested_resource is null
   and target_hostname is not null;

comment on column public.mcp_tool_invocation_events.client_name is
  'Bounded self-declared MCP initializer client name; excludes version and raw initialization payloads.';
comment on column public.mcp_tool_invocation_events.requester_ip is
  'Trusted request source IP retained under the MCP telemetry 90-day policy for operational attribution.';
comment on column public.mcp_tool_invocation_events.requester_ip_hash is
  'HMAC-SHA256 requester IP attribution retained alongside the trusted source IP.';
comment on column public.mcp_tool_invocation_events.requested_resource is
  'Bounded request resource only: scan/job identifier, domain, or HTTP(S) origin; paths, credentials, query, and fragment are excluded.';

comment on table public.mcp_tool_invocation_events is
  'Bounded hosted MCP invocation telemetry with a 90-day retention target. Stores trusted requester attribution, declared client identity, and safe request resources; excludes prompts, raw tool payloads, auth tokens, raw headers, provider identifiers, URL paths, and URL query values.';
