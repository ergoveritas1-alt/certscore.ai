import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

test("coverage CSV enforces full-site access and quota, reads all page metadata and supports compressed downloads", async () => {
  const directory = await mkdtemp(resolve("apps/web/.coverage-route-"));
  const fixture = {allowed:true, access:true, throttle:false, crawl:true, reads:0, sql:"", parameters:[] as string[]};
  const globals = globalThis as typeof globalThis & {coverageRouteFixture?:typeof fixture};
  globals.coverageRouteFixture = fixture;
  try {
    const output = join(directory,"route.cjs");
    await build({entryPoints:[resolve("apps/web/app/api/scans/[scanId]/full-site/coverage.csv/route.ts")], outfile:output,
      bundle:true, platform:"node", format:"cjs", packages:"external", tsconfig:"apps/web/tsconfig.test.json",
      plugins:[{name:"fixture",setup(builder) {
        const fixtures: Record<string,string> = {
          "server-only":"",
          "full-site-options":`export async function readFullSiteOptions(){return {allowed:globalThis.coverageRouteFixture.allowed};}`,
          "scan-status-projection":`export async function getPublicScanStatusProjection(){return globalThis.coverageRouteFixture.access;}`,
          "api-v2-read-throttle":`export async function enforceApiV2ScanReadThrottle(){return globalThis.coverageRouteFixture.throttle?new Response(null,{status:429}):null;}`,
          "runtime-evidence-graph-access":`export const runtimeGraphQuotaRequest=r=>r;`,
          "@website-signal-risk-scanner/db":`export async function loadFullSiteCrawl(){return globalThis.coverageRouteFixture.crawl?{status:'completed'}:null;}
            export async function query(sql,parameters){const f=globalThis.coverageRouteFixture;f.reads++;f.sql=sql;f.parameters=parameters;
              return {rows:Array.from({length:143},(_,i)=>({id:'page-'+i,target_url:'https://example.test/page-'+i,final_url:null,source:'link',status:'excluded',
                limitation:'robots_disallowed',attempt_count:0,has_capture:false,capture_status:null,http_status:null,failure_kind:null,capture_limitations:null,
                started_at:null,completed_at:null,crawl_status:'completed',stop_reason:'max_pages'}))};}`,
        };
        builder.onResolve({filter:/.*/}, args => {const key=args.path in fixtures?args.path:args.path.split('/').at(-1)!;return key in fixtures?{path:key,namespace:"fixture"}:undefined;});
        builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path]!,loader:"js"}));
      }}]});
    const {GET} = createRequire(import.meta.url)(output);
    const id = "10000000-0000-4000-8000-000000000001";
    const read = (scanId=id, encoding="") => GET(new Request(`http://localhost:3000/api/scans/${scanId}/full-site/coverage.csv?status=completed&page=2`,
      {headers:{"accept-encoding":encoding}}),{params:Promise.resolve({scanId})});
    fixture.allowed=false; assert.equal((await read()).status,404);
    fixture.allowed=true; assert.equal((await read("invalid")).status,400);
    fixture.access=false; assert.equal((await read()).status,404);
    fixture.access=true; fixture.crawl=false; assert.equal((await read()).status,404);
    fixture.crawl=true; fixture.throttle=true; assert.equal((await read()).status,429);
    assert.equal(fixture.reads,0);
    fixture.throttle=false;
    const response = await read();
    assert.equal(response.status,200);
    assert.equal(response.headers.get("content-type"),"text/csv; charset=utf-8");
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.match(response.headers.get("content-disposition"),/attachment; filename="certscore-covered-pages-/);
    assert.equal(response.headers.get("x-content-type-options"),"nosniff");
    const csv = await response.text();
    assert.equal(csv.match(/Not scanned — robots.txt disallowed/g)?.length,143);
    assert.ok(csv.includes("page-142"));
    assert.deepEqual(fixture.parameters,[id]);
    assert.doesNotMatch(fixture.sql,/\blimit\b|\boffset\b|observation_json|occurrences|select\s+\*/i);
    const compressed = await read(id,"gzip");
    assert.equal(compressed.headers.get("content-encoding"),"gzip");
    assert.match(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString(),/page-142/);
    assert.equal((await read(id,"gzip;q=0")).headers.get("content-encoding"),null);
  } finally { delete globals.coverageRouteFixture; await rm(directory,{recursive:true,force:true}); }
});
