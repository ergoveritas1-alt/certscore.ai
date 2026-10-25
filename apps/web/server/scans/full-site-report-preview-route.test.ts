import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

test("compact report requires the existing rollout, access and rate gates before reading prepared data", async () => {
  const directory=await mkdtemp(resolve("apps/web/.preview-route-"));
  const fixture={allowed:true,access:true,throttle:false,reads:0};
  const globals=globalThis as typeof globalThis & {previewRouteFixture?:typeof fixture};
  globals.previewRouteFixture=fixture;
  try {
    const output=join(directory,"route.cjs");
    await build({entryPoints:[resolve("apps/web/app/api/scans/[scanId]/full-site/route.ts")],outfile:output,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"fixture",setup(builder){
      const fixtures:Record<string,string>={
        "full-site-options":`export async function readFullSiteOptions(){return {allowed:globalThis.previewRouteFixture.allowed};}`,
        "scan-status-projection":`export async function getPublicScanStatusProjection(){return globalThis.previewRouteFixture.access;}`,
        "api-v2-read-throttle":`export async function enforceApiV2ScanReadThrottle(){return globalThis.previewRouteFixture.throttle?new Response(null,{status:429}):null;}`,
        "runtime-evidence-graph-access":`export const runtimeGraphQuotaRequest=r=>r;`,
        "full-site-report":`export async function loadFullSiteReportPreview(id,crawl){globalThis.previewRouteFixture.reads++;return {version:'full-site-report-preview.v1',summary:{state:{scanId:id,status:crawl.status}}};} export function loadFullSiteReport(){throw new Error('Detailed read on overview path');}`,
        "full-site-report-stream":`export function streamFullSiteReport(){throw new Error('Stream on overview path');}`,
        "full-site-forms":`export function loadFullSiteFormSnapshot(){throw new Error('Form on overview path');}`,
        "full-site-graph":`export function loadFullSiteGraph(){throw new Error('Graph on overview path');}`,
        "@website-signal-risk-scanner/db":`export async function loadFullSiteCrawl(){return {status:'completed'};}`,
      };
      builder.onResolve({filter:/.*/},args=>{const key=args.path in fixtures?args.path:args.path.split('/').at(-1)!;return key in fixtures?{path:key,namespace:"fixture"}:undefined;});
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path]!,loader:"js"}));
    }}]});
    const {GET}=createRequire(import.meta.url)(output);
    const id="10000000-0000-4000-8000-000000000001";
    const read=()=>GET(new Request(`http://localhost:3000/api/scans/${id}/full-site?view=overview`),{params:Promise.resolve({scanId:id})});
    fixture.allowed=false;assert.equal((await read()).status,404);
    fixture.allowed=true;fixture.access=false;assert.equal((await read()).status,404);
    fixture.access=true;fixture.throttle=true;assert.equal((await read()).status,429);
    assert.equal(fixture.reads,0);
    fixture.throttle=false;const response=await read();assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal((await response.json()).summary.state.scanId,id);
    assert.equal(fixture.reads,1);
  } finally {delete globals.previewRouteFixture;await rm(directory,{recursive:true,force:true});}
});
