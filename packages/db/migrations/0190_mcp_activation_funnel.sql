alter table public.product_analytics_events
  drop constraint if exists product_analytics_events_event_name_check;

alter table public.product_analytics_events
  add constraint product_analytics_events_event_name_check
  check (event_name in (
    'page_viewed', 'navigation_clicked', 'action_clicked', 'form_started',
    'form_submitted', 'form_succeeded', 'form_failed', 'scan_started', 'scan_completed', 'scan_viewed',
    'report_viewed', 'scroll_depth_reached', 'session_engaged',
    'web_vital_recorded', 'client_error', 'account_created',
    'oauth_authorized', 'mcp_initialized', 'mcp_tools_listed',
    'mcp_first_tool_invoked', 'mcp_scan_requested',
    'analytics_opted_in', 'analytics_opted_out'
  ));

comment on constraint product_analytics_events_event_name_check on public.product_analytics_events is
  'Bounded product and operational event names, including the OAuth-to-MCP activation funnel.';
