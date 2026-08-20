alter table public.mcp_tool_invocation_events
  add column if not exists caller_product text not null default 'unknown',
  add column if not exists attribution_confidence text not null default 'unknown',
  add column if not exists attribution_signals jsonb not null default '[]'::jsonb,
  add column if not exists attribution_ruleset_version text not null default 'legacy',
  add column if not exists execution_channel text not null default 'unknown',
  add column if not exists installation_origin text not null default 'unknown';

alter table public.mcp_tool_invocation_events
  drop constraint if exists mcp_tool_invocation_events_source_check,
  add constraint mcp_tool_invocation_events_source_check
    check (source in ('openai', 'anthropic', 'google', 'xai', 'other', 'unknown')),
  drop constraint if exists mcp_tool_invocation_events_client_family_check,
  add constraint mcp_tool_invocation_events_client_family_check
    check (client_family in (
      'openai_chatgpt', 'openai_codex', 'anthropic_claude', 'anthropic_claude_code',
      'google_gemini_cli', 'xai_grok', 'other', 'unknown'
    )),
  add constraint mcp_tool_invocation_events_caller_product_check
    check (caller_product in ('chatgpt', 'codex', 'claude', 'claude_code', 'gemini_cli', 'grok', 'other', 'unknown')),
  add constraint mcp_tool_invocation_events_attribution_confidence_check
    check (attribution_confidence in ('verified', 'corroborated', 'declared', 'inferred', 'unknown')),
  add constraint mcp_tool_invocation_events_attribution_signals_check
    check (jsonb_typeof(attribution_signals) = 'array' and jsonb_array_length(attribution_signals) <= 8),
  add constraint mcp_tool_invocation_events_execution_channel_check
    check (execution_channel in ('hosted_connector', 'api_managed_mcp', 'desktop_cli', 'custom_mcp', 'unknown')),
  add constraint mcp_tool_invocation_events_installation_origin_check
    check (installation_origin in ('openai_directory', 'anthropic_directory', 'xai_catalog', 'direct', 'unknown'));

update public.mcp_tool_invocation_events
   set caller_product = case client_family
         when 'openai_chatgpt' then 'chatgpt'
         when 'openai_codex' then 'codex'
         when 'anthropic_claude' then 'claude'
         else caller_product
       end,
       attribution_confidence = case
         when source_attribution = 'verified_network' and client_family = 'anthropic_claude' then 'corroborated'
         when source_attribution in ('verified_network', 'self_declared_header') then 'inferred'
         when source_attribution = 'self_declared_client' then 'declared'
         else attribution_confidence
       end,
       attribution_signals = case
         when source_attribution = 'verified_network' and client_family = 'anthropic_claude'
           then '["anthropic_connector_network", "declared_client_info"]'::jsonb
         when source_attribution = 'verified_network'
           then '["anthropic_connector_network"]'::jsonb
         when source_attribution = 'self_declared_header' and client_name is not null
           then '["declared_client_info", "openai_header_claim"]'::jsonb
         when source_attribution = 'self_declared_header'
           then '["openai_header_claim"]'::jsonb
         when source_attribution = 'self_declared_client'
           then '["declared_client_info"]'::jsonb
         else attribution_signals
       end,
       attribution_ruleset_version = '2026-08-20.1',
       execution_channel = case
         when source_attribution = 'verified_network' then 'hosted_connector'
         when client_family = 'openai_codex' then 'desktop_cli'
         else execution_channel
       end
 where attribution_ruleset_version = 'legacy';

create index if not exists mcp_tool_invocation_events_provider_confidence_idx
  on public.mcp_tool_invocation_events (source, attribution_confidence, occurred_at desc);

comment on column public.mcp_tool_invocation_events.source is
  'Evidence-scored caller provider classification; never implies directory installation origin.';
comment on column public.mcp_tool_invocation_events.caller_product is
  'Bounded caller product classification such as ChatGPT, Codex, Claude, Gemini CLI, or Grok.';
comment on column public.mcp_tool_invocation_events.attribution_confidence is
  'Confidence in caller attribution: verified, corroborated, declared, inferred, or unknown.';
comment on column public.mcp_tool_invocation_events.attribution_signals is
  'Bounded enum-only evidence names used by the versioned caller attribution classifier; contains no raw headers or credentials.';
comment on column public.mcp_tool_invocation_events.installation_origin is
  'Installation/discovery provenance. Remains unknown unless bound to a separately verified installation record.';
