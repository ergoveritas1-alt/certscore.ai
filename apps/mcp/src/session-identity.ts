import type { CertScoreAccessTokenClaims } from "@certscore/mcp-auth";

// Token-instance fields (jti, iat, exp) are validated per request, not session identity.
export function oauthSessionIdentity(claims: CertScoreAccessTokenClaims) {
  const scopeSet = (values: readonly string[]) => JSON.stringify([...new Set(values)].sort());
  return {
    version: "oauth-session.v1",
    issuer: claims.iss,
    audience: claims.aud,
    subject: claims.sub,
    client: claims.client_id,
    organization: claims.certscore.organizationId,
    user: claims.certscore.userId,
    scopes: scopeSet(claims.scope.split(/\s+/).filter(Boolean)),
    integrationScopes: scopeSet(claims.certscore.scopes),
  } as const;
}

export type OAuthSessionIdentity = ReturnType<typeof oauthSessionIdentity>;

export function oauthSessionMismatch(expected: OAuthSessionIdentity, actual: OAuthSessionIdentity) {
  for (const field of Object.keys(expected) as (keyof OAuthSessionIdentity)[]) {
    if (expected[field] !== actual[field]) return field;
  }
  return null;
}
