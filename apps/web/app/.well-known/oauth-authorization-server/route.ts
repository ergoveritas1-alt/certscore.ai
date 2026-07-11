import { NextResponse } from "next/server";
import {
  CERTSCORE_OAUTH_CREATE_SCOPE,
  CERTSCORE_OAUTH_MCP_SCOPE,
  CERTSCORE_OAUTH_READ_SCOPE
} from "@certscore/mcp-auth";
import { getMcpOAuthIssuer } from "../../../server/oauth/mcp-oauth-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const issuer = getMcpOAuthIssuer();
  const scopesSupported = [CERTSCORE_OAUTH_READ_SCOPE, CERTSCORE_OAUTH_MCP_SCOPE];
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/v2/oauth/token`,
      registration_endpoint: `${issuer}/api/v2/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: scopesSupported,
      grant_gated_scopes: [CERTSCORE_OAUTH_CREATE_SCOPE],
      service_documentation: `${issuer}/developers/mcp`
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
