import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE, MCP_FREE_AUTHENTICATION_INTRO_MESSAGE } from "@website-signal-risk-scanner/shared";

test("API v2 offers free workspace access on shared daily exhaustion below the invitation threshold, preserving denial and Retry-After", async () => {
  const path = fileURLToPath(new URL("../../app/api/v2/scans/route.ts", import.meta.url));
  const mocks: Record<string, string> = {
    state: `export const state={quotaReads:0,requester:{anonymousMcpSurface:'mcp_light',ipHash:'opaque',anonymousRequesterNetwork:'direct',anonymousMcpSessionHash:'bound-session'},
      quota:{limit:60,remaining:0,resetAt:'2026-11-02T00:00:00Z',freeAuthenticationMessage:null},
      pulse:{error:{code:'rate_limited',message:'Pool exhausted',retryAfterSeconds:120,creationRateLimit:{kind:'new_scan',scope:'surface',windowId:'daily',limit:200,used:200}}}};`,
    pulse: `import {state} from 'test-state'; export async function GET(){return Response.json(state.pulse,{status:429,headers:{'Retry-After':'120'}});}`,
    requester: `import {state} from 'test-state'; export function getPulseRequesterContext(){return state.requester;}`,
    quota: `import {state} from 'test-state'; export async function getLightMcpNewScanQuotaState(){state.quotaReads++;return state.quota;} export const getAnonymousScanDailyQuotaState=getLightMcpNewScanQuotaState;`,
    keys: `export function lightMcpScanIpKey(x){return x;} export function lightMcpScanRequesterKey(x){return x.sessionHash;}`,
    publicScan: `export async function getPublicScanRecord(){throw new Error('denial must not project a report');}`,
    contracts: `const schema={safeParse:data=>({success:true,data}),parse:data=>data};export const apiV2CreateScanRequestSchema=schema,pulseResponseSchema=schema,pulseStatusSchema=schema;`,
    response: `export function apiV2JsonResponse({body,headers,status}){return Response.json(body,{headers,status});}
      export function buildApiV2ErrorFromPulse({body}){return body;} export function buildApiV2Error(x){return {error:x};}
      export function buildApiV2ScanJobFromPulseStatus(){throw new Error('unexpected job projection');}
      export const buildApiV2ScanResource=buildApiV2ScanJobFromPulseStatus,buildApiV2ScanStatus=buildApiV2ScanJobFromPulseStatus;`,
  };
  const result = await build({ stdin: { contents: `export {POST} from ${JSON.stringify(path)};export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "invitation-route-fixtures", setup(api) {
      api.onResolve({ filter: /.*/ }, args => {
        const key = args.path === "test-state" ? "state" : args.path.endsWith("v1/pulse/route") ? "pulse"
          : args.path.endsWith("lib/pulse/request") ? "requester" : args.path.endsWith("server/pulse/repository") ? "quota"
          : args.path.endsWith("server/pulse/anonymous-scan-quota") ? "keys" : args.path.endsWith("server/scans/get-public-scan-record") ? "publicScan"
          : args.path === "@certscore/api-contracts" ? "contracts" : args.path.endsWith("lib/api-v2/scan-resource") ? "response" : null;
        return key ? { path: key, namespace: "fixture" } : undefined;
      });
      api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const { POST, state } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`);
  const submit = (headers?: HeadersInit) => POST(new Request("https://certscore.ai/api/v2/scans", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ url: "https://example.com/" })
  }));
  const limited = await submit();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "120");
  const body = await limited.json();
  assert.equal(body.upgradeMessage, MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE);
  assert.equal(body.quotaConsumed, false);
  assert.equal(body.error.creationRateLimit.used, 200);
  for (const windowId of ["burst", "concurrent"]) {
    state.pulse.error.creationRateLimit.windowId = windowId;
    state.quota.freeAuthenticationMessage = MCP_FREE_AUTHENTICATION_INTRO_MESSAGE;
    assert.equal((await (await submit()).json()).upgradeMessage, null, "shared capacity is not an account-upgrade cue");
  }
  state.pulse.error.creationRateLimit.windowId = "daily";
  const before = state.quotaReads;
  assert.equal((await (await submit({ authorization: "Bearer already-authenticated" })).json()).upgradeMessage, null);
  assert.equal(state.quotaReads, before);
});
