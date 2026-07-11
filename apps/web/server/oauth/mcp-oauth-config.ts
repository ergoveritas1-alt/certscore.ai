const DEFAULT_ISSUER = "https://certscore.ai";
const DEFAULT_MCP_PUBLIC_URL = "https://mcp.certscore.ai";

export function getMcpOAuthIssuer() {
  return process.env.OAUTH_ISSUER?.trim() || DEFAULT_ISSUER;
}

export function getMcpPublicUrl() {
  return process.env.MCP_PUBLIC_URL?.trim() || DEFAULT_MCP_PUBLIC_URL;
}
