import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("authorization POST cannot issue a code without page-bound approval", async () => {
  const routePath = fileURLToPath(new URL("../../app/api/v2/oauth/authorize/route.ts", import.meta.url));
  const mocks: Record<string, string> = {
    state: `export const state={calls:[]};`,
    navigation: `export function redirect(url){throw Object.assign(new Error('redirect'),{url});}`,
    auth: `export async function getCurrentUser(){return {id:'session-user'};}`,
    bootstrap: `export async function bootstrapAppUserSession(){return {organization:{id:'workspace'},user:{id:'user'}};}`,
    oauth: `import {state} from 'test-state';
      export async function getMcpOAuthClient(){return {clientId:'client',clientName:'Test'};}
      export function redirectUriAllowed(_client,uri){return uri==='https://client.example/callback';}
      export async function resolveMcpOAuthRequestedScopes(){return {approvedScopes:['scan:read','mcp'],invalidScopes:[],deniedScopes:[]};}
      export async function createAuthorizationCode(){state.calls.push('code');return 'issued-code';}`,
    consent: `export function isTrustedMcpOAuthConnection(){return false;}
      export function verifyMcpOAuthConsentProof(context,expiresAt,proof){return context.clientId==='client' && context.ownerUserId==='user' && context.redirectUri==='https://client.example/callback' && context.scope==='scan:read mcp' && expiresAt===123 && proof==='signed-proof';}`,
    event: `export async function recordMcpOAuthAuthorization(){}`,
    scopes: `export function oauthScopeString(scopes){return scopes.join(' ');}`
  };
  const result = await build({
    stdin: { contents: `export {POST} from ${JSON.stringify(routePath)};export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "isolated-route", setup(api) {
      api.onResolve({ filter: /.*/ }, args => {
        const key = args.path === "test-state" ? "state" : args.path === "next/navigation" ? "navigation"
          : args.path.endsWith("/server/auth") ? "auth" : args.path.endsWith("/server/bootstrap-user") ? "bootstrap"
          : args.path.endsWith("/server/oauth/mcp-oauth-consent") ? "consent"
          : args.path.endsWith("/server/oauth/mcp-oauth-authorization-event") ? "event"
          : args.path.endsWith("/server/oauth/mcp-oauth") ? "oauth"
          : args.path === "@certscore/mcp-auth" ? "scopes" : null;
        return key ? { path: key, namespace: "mock" } : undefined;
      });
      api.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }]
  });
  const { POST, state } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`);
  const fields = {
    client_id: "client", redirect_uri: "https://client.example/callback", code_challenge: "a".repeat(43),
    code_challenge_method: "S256", state: "caller-state", scope: "scan:read mcp",
    decision: "approve", consent_expires_at: "123", consent_proof: "signed-proof"
  };
  async function submit(patch: Record<string, string>) {
    const body = new URLSearchParams({ ...fields, ...patch });
    return POST(new Request("https://certscore.ai/api/v2/oauth/authorize", { method: "POST", body }));
  }
  await assert.rejects(submit({ consent_proof: "" }), (error: any) => error.url === "/developers/mcp?oauth_error=invalid_consent");
  assert.equal(state.calls.length, 0);
  await assert.rejects(submit({ decision: "deny" }), (error: any) => error.url === "/developers/mcp?oauth_error=access_denied");
  assert.equal(state.calls.length, 0);
  await assert.rejects(submit({}), (error: any) => error.url.includes("code=issued-code"));
  assert.equal(state.calls.length, 1);
});
