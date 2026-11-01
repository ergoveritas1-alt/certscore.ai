import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { getPulseRequesterContext } from "./request";
import { lightMcpScanRequesterKey } from "../../server/pulse/anonymous-scan-quota";

test("Pulse creation forwards only verified session identity to the same admission key used by quota reads", async () => {
  const route = fileURLToPath(new URL("../../app/api/v1/pulse/route.ts", import.meta.url));
  const mocks: Record<string, string> = {
    "test-state": "export const state={admissions:[]};",
    "next/server": "export const NextResponse=Response;",
    "server/scans/restricted-scan-options": "export const restrictScanFromForUser=x=>x.scanFrom;",
    "lib/seo": "export const SITE_URL='https://certscore.ai';",
    "lib/pulse/cors": "export const applyPulseCors=x=>x;export const pulseOptionsResponse=()=>new Response(null,{status:204});",
    "lib/pulse/error": "export const buildPulseError=x=>({error:x});",
    "lib/pulse/gpt-action-analytics": "export const getHighPriorityFindingCount=()=>0,getTopFindingIds=()=>[],getTotalObservationCount=()=>0,logPulseGptActionEvent=()=>{};",
    "lib/pulse/markdown": "export const renderPulseMarkdown=()=>'';",
    "lib/pulse/projection": "export const assessPulseScanRecordQuality=()=>({usable:false}),buildPulseProjection=()=>{};",
    "lib/pulse/status": "export const buildPulseStatus=x=>x;",
    "lib/pulse/scan-coverage": "export const PULSE_MIN_REUSABLE_PAGES_REQUESTED=1,PULSE_SCAN_COVERAGE_PLAN_CODE='free';",
    "server/pulse/queue-alternate-region-recovery": "export const queueAlternateRegionRecovery=()=>({queued:false});",
    "server/integrations/api-keys": "export const parseBearerToken=()=>({provided:false}),validateCertScoreBearerToken=()=>{throw Error('unexpected auth');};",
    "server/domains/domain-dns": "export const checkDomainDns=()=>({exists:true}),isDomainDnsPreflightError=()=>false;",
    "server/scans/create-anonymous-full-scan": "import {state} from 'test-state';export async function createAnonymousFullScan(input){state.admissions.push(input);return {scan:{id:'11111111-1111-4111-8111-111111111111'}};}",
    "server/scans/get-public-scan-record": "export const getPublicScanRecord=()=>null;",
    "server/scans/scan-status-projection": "export const getPublicScanStatusProjection=()=>null;",
    "server/scans/recent-scan-reuse": "export const getRecentScanReuseEligibility=()=>null;",
    "server/pulse/repository": `export const claimPulseDomainScanCreation=()=>({allowed:true}),
      createPulseRequest=()=>({publicId:'request',jobId:'job'}),createPulseRequestWithApiKeyQuota=()=>{throw Error('unexpected auth');},
      createPulseRequestWithRetrievalQuota=()=>{throw Error('unexpected retrieval');},findLatestCompletedAnonymousScanForDomain=()=>null,
      getPulseGptActionUsage=()=>null,getPulseRequestByJobId=()=>null,recordPulseArtifactDownload=()=>{},
      updatePulseRequestCompleted=()=>{},updatePulseRequestFailed=()=>{},updatePulseRequestQueued=()=>{},updatePulseRequestRateLimited=()=>{};`,
    "server/pulse/read-rate-log": "export const logApiReadRateLimited=()=>{};",
  };
  const bundle = await build({ stdin: { contents: `export {GET} from ${JSON.stringify(route)};export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "offline-pulse-admission", setup(api) {
      api.onResolve({ filter: /.*/ }, args => {
        const key = Object.keys(mocks).find(key => args.path === key || args.path.endsWith(`/${key}`));
        return key ? { path: key, namespace: "fixture" } : undefined;
      });
      api.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const { GET, state } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0]!.text).toString("base64")}`);
  const previousSecret = process.env.CERTSCORE_OAUTH_JWT_SECRET;
  const secret = "offline-anonymous-session-route-fixture";
  process.env.CERTSCORE_OAUTH_JWT_SECRET = secret;
  try {
    const ip = "203.0.113.12";
    const timestamp = String(Math.floor(Date.now() / 1_000));
    for (const [binding, tampered] of [["first_session_binding", false], ["second_session_binding", false], ["first_session_binding", true]] as const) {
      const request = new Request("https://certscore.ai/api/v1/pulse?url=https%3A%2F%2Fexample.com&wait=0", { headers: {
        "x-certscore-anonymous-requester-ip": ip,
        "x-certscore-anonymous-requester-timestamp": timestamp,
        "x-certscore-anonymous-surface": "mcp_light",
        "x-certscore-anonymous-requester-session": binding,
        "x-certscore-anonymous-requester-proof": tampered ? "forged" : createHmac("sha256", secret).update(`${timestamp}.${ip}.mcp_light.${binding}`).digest("base64url"),
      } });
      const response = await GET(request);
      assert.equal(response.status, 202, JSON.stringify(await response.json()));
      const admitted = state.admissions.at(-1).requesterIpContext;
      const verified = getPulseRequesterContext(request);
      assert.deepEqual(admitted, {
        anonymousMcpSurface: verified.anonymousMcpSurface,
        anonymousMcpSessionHash: verified.anonymousMcpSessionHash,
        anonymousRequesterNetwork: verified.anonymousRequesterNetwork,
        ipHash: verified.ipHash,
        sourceIp: verified.sourceIp,
      });
      const key = lightMcpScanRequesterKey({ ipHash: admitted.ipHash, network: admitted.anonymousRequesterNetwork, sessionHash: admitted.anonymousMcpSessionHash });
      assert.equal(key, lightMcpScanRequesterKey({ ipHash: verified.ipHash, network: verified.anonymousRequesterNetwork, sessionHash: verified.anonymousMcpSessionHash }));
      assert.equal(admitted.anonymousMcpSessionHash, tampered ? null : createHash("sha256").update(binding).digest("hex"));
      if (!tampered) assert.equal(key, `session:${admitted.anonymousMcpSessionHash}`);
    }
    assert.equal(state.admissions[0].requesterIpContext.ipHash, state.admissions[1].requesterIpContext.ipHash);
    assert.notEqual(state.admissions[0].requesterIpContext.anonymousMcpSessionHash, state.admissions[1].requesterIpContext.anonymousMcpSessionHash);
    assert.equal(state.admissions[2].requesterIpContext.anonymousMcpSurface, null, "forged headers cannot claim Light admission");
  } finally {
    if (previousSecret === undefined) delete process.env.CERTSCORE_OAUTH_JWT_SECRET;
    else process.env.CERTSCORE_OAUTH_JWT_SECRET = previousSecret;
  }
});
