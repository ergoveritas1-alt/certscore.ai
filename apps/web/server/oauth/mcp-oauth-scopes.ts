import {
  CERTSCORE_OAUTH_CREATE_SCOPE,
  CERTSCORE_OAUTH_MCP_SCOPE,
  CERTSCORE_OAUTH_READ_SCOPE,
  normalizeOAuthScopes,
  type CertScoreOAuthScope
} from "@certscore/mcp-auth";

export type McpOAuthScopeResolution = {
  approvedScopes: CertScoreOAuthScope[];
  deniedScopes: CertScoreOAuthScope[];
};

export function normalizeMcpOAuthClientScopes(scopes: string[] | readonly string[]) {
  const normalized = normalizeOAuthScopes([...scopes]);
  if (!normalized.includes(CERTSCORE_OAUTH_READ_SCOPE)) {
    normalized.unshift(CERTSCORE_OAUTH_READ_SCOPE);
  }
  if (!normalized.includes(CERTSCORE_OAUTH_MCP_SCOPE)) {
    normalized.push(CERTSCORE_OAUTH_MCP_SCOPE);
  }
  return Array.from(new Set(normalized));
}

export function resolveMcpOAuthScopeRequest(input: {
  clientScopes: readonly string[];
  requestedScopes: readonly string[];
  scanCreateGranted: boolean;
}): McpOAuthScopeResolution {
  const normalizedRequested = normalizeMcpOAuthClientScopes(input.requestedScopes);
  const normalizedClientScopes = normalizeOAuthScopes([...input.clientScopes]);
  const approvedScopes = normalizedRequested.filter((scope) => {
    if (scope === CERTSCORE_OAUTH_CREATE_SCOPE) {
      return input.scanCreateGranted;
    }
    return normalizedClientScopes.includes(scope);
  });
  const deniedScopes = normalizedRequested.filter((scope) => !approvedScopes.includes(scope));
  return { approvedScopes: normalizeOAuthScopes(approvedScopes), deniedScopes };
}
