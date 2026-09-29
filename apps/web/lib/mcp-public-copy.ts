/** Public wording for the deployed OAuth membership policy. Keep static guides linked here via /developers/mcp. */
export const MCP_OAUTH_ELIGIBILITY = "Members of active CertScore.ai workspaces can connect through registered OAuth clients with scan:read, scan:create and mcp scopes, across workspace plans, without a manual CertScore access grant. Existing usage limits and public-target restrictions apply.";
export const MCP_OAUTH_AUTHORIZATION = "Start Connect in your MCP client and sign in to CertScore.ai if prompted. For an unfamiliar client, review its exact connection destination and access, then select Connect or Cancel. Verified integrations and previously approved connections can reconnect without this extra step. Your client may show its own connection and tool-approval prompts.";
export const MCP_OAUTH_RECONNECT = "Use your existing connector to reconnect when access expires, is revoked or needs additional scopes. Request scan:read scan:create mcp. An existing sign-in session may be reused; token refresh does not add scopes. A quota limit needs time to reset, not reauthorization.";
export const MCP_HOSTED_ENDPOINT = "https://mcp.certscore.ai/mcp";
export const MCP_LIGHT_ENDPOINT = "https://mcp.certscore.ai/mcp/light";
export const MCP_HOSTED_SETUP = "/developers/mcp#hosted-oauth-start";
