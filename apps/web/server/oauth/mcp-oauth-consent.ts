import { createHmac, timingSafeEqual } from "node:crypto";
import { getMcpJwtSecret } from "./mcp-oauth";

const CONSENT_PROOF_TTL_SECONDS = 10 * 60;
const TRUSTED_CURSOR_CLIENT_ID = "certscore_cursor_hosted_oauth_v1";
const TRUSTED_CURSOR_CALLBACK = "https://www.cursor.com/agents/mcp/oauth/callback";

export type McpOAuthConsentContext = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope: string;
  organizationId: string;
  ownerUserId: string;
};

// This server-owned registration can only deliver the code to Cursor's exact
// HTTPS callback. Dynamic registrations and loopback callbacks are not trusted.
export function isTrustedMcpOAuthConnection(clientId: string, redirectUri: string) {
  return clientId === TRUSTED_CURSOR_CLIENT_ID && redirectUri === TRUSTED_CURSOR_CALLBACK;
}

function signature(context: McpOAuthConsentContext, expiresAt: number) {
  return createHmac("sha256", getMcpJwtSecret())
    .update(JSON.stringify([
      "mcp-oauth-consent-v1", expiresAt, context.clientId, context.redirectUri,
      context.codeChallenge, context.state, context.scope, context.organizationId, context.ownerUserId
    ]))
    .digest("base64url");
}

export function createMcpOAuthConsentProof(context: McpOAuthConsentContext, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiresAt = nowSeconds + CONSENT_PROOF_TTL_SECONDS;
  return { expiresAt, proof: signature(context, expiresAt) };
}

export function verifyMcpOAuthConsentProof(
  context: McpOAuthConsentContext,
  expiresAt: number,
  proof: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + CONSENT_PROOF_TTL_SECONDS ||
      !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  const expected = Buffer.from(signature(context, expiresAt));
  const actual = Buffer.from(proof);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
