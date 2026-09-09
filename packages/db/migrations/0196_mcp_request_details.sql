alter table public.mcp_tool_invocation_events
  add column if not exists request_details jsonb;

alter table public.mcp_tool_invocation_events
  add constraint mcp_request_details_bounded check (
    request_details is null or (
      jsonb_typeof(request_details) = 'object'
      and octet_length(request_details::text) <= 4096
    )
  );

comment on column public.mcp_tool_invocation_events.request_details is
  'Versioned allowlisted tool options, correlation basis, enforced rate-limit details, and optional declared task context. Short question summaries require explicit sharing; no original chat prompts, headers, credentials, URL paths or query values. Null for older events; same 90-day event retention.';
