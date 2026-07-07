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
  downgradedScopes: CertScoreOAuthScope[];
  invalidScopes: string[];
};

function uniqueValues<T extends string>(values: readonly T[]) {
  return Array.from(new Set(values));
}

function tokenizeScopes(scopes: string[] | readonly string[]) {
  return scopes
    .flatMap((scope) => scope.split(/\s+/))
    .map((scope) => scope.trim())
    .filter(Boolean);
}

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
  const requestedTokens = uniqueValues(tokenizeScopes(input.requestedScopes));
  const supportedScopes = [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_CREATE_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE] as const;
  const invalidScopes = requestedTokens.filter((scope) => !supportedScopes.includes(scope as CertScoreOAuthScope));
  const supportedRequested = requestedTokens.filter((scope): scope is CertScoreOAuthScope =>
    supportedScopes.includes(scope as CertScoreOAuthScope)
  );
  const normalizedRequested = normalizeMcpOAuthClientScopes(supportedRequested);
  const normalizedClientScopes = normalizeOAuthScopes([...input.clientScopes]);
  const downgradedScopes = normalizedRequested.filter((scope) => scope === CERTSCORE_OAUTH_CREATE_SCOPE && !input.scanCreateGranted);
  const approvedScopes = normalizedRequested.filter((scope) => {
    if (scope === CERTSCORE_OAUTH_CREATE_SCOPE) {
      return input.scanCreateGranted;
    }
    return normalizedClientScopes.includes(scope);
  });
  const deniedScopes = normalizedRequested.filter((scope) => !approvedScopes.includes(scope));
  return {
    approvedScopes: normalizeOAuthScopes(approvedScopes),
    deniedScopes: deniedScopes.filter((scope) => !downgradedScopes.includes(scope)),
    downgradedScopes,
    invalidScopes
  };
}
