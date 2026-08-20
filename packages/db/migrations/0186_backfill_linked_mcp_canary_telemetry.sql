update public.mcp_tool_invocation_events event
   set is_canary = true
 where event.is_canary = false
   and event.scan_id is not null
   and (
     exists (
       select 1
         from public.scan_requests request
        where coalesce(request.fulfilled_by_scan_id, request.scan_id)::text = event.scan_id
          and coalesce(request.requested_url, '') ~* '^https?://[^/?#]+/\.well-known/certscore-canary/'
     )
     or exists (
       select 1
         from public.pulse_requests request
        where request.scan_id::text = event.scan_id
          and coalesce(request.requested_url, '') ~* '^https?://[^/?#]+/\.well-known/certscore-canary/'
     )
     or exists (
       select 1
         from public.scan_pages page
        where page.scan_id::text = event.scan_id
          and coalesce(page.page_url, '') ~* '^https?://[^/?#]+/\.well-known/certscore-canary/'
     )
   );

comment on column public.mcp_tool_invocation_events.is_canary is
  'True when the bounded MCP target input or any retained URL linked by scan_id uses the CertScore canary path prefix; target paths are not retained here.';
