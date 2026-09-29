-- Historical grants have no proven approved destination and require one new approval.
alter table public.mcp_oauth_refresh_tokens
  add column if not exists redirect_uri text;
