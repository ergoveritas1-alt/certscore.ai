import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

test("durable report cache survives a cold module, validates sources and integrity, and bounds storage", async () => {
  const directory = await mkdtemp(resolve("apps/web/.report-cache-test-"));
  const state = { fingerprint: "first", revision: "release-a", writes: 0, row: null as null | {payload:Buffer;payload_sha256:string} };
  const globals = globalThis as typeof globalThis & { reportCacheFixture?: typeof state };
  globals.reportCacheFixture = state;
  try {
    const output = join(directory,"cache.cjs");
    await build({entryPoints:[resolve("apps/web/server/scans/full-site-report-cache.ts")],outfile:output,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"fixtures",setup(builder){
      const fixtures: Record<string,string> = {
        "server-only":"",
        "../runtime-version":`export function getRuntimeVersionInfo(){return {gitSha:globalThis.reportCacheFixture.revision};}`,
        "@website-signal-risk-scanner/db":`export async function query(sql,args){
          const state=globalThis.reportCacheFixture;
          if(sql.includes('as fingerprint')) return {rows:[{fingerprint:state.fingerprint}]};
          if(sql.startsWith('select payload')) return {rows:state.row?[state.row]:[]};
          if(sql.startsWith('insert into full_site_report_cache')) {
            if(args[0]<0||args[0]>=128||args[3].length>524288) throw new Error('Budget exceeded');
            state.writes++;state.row={payload:args[3],payload_sha256:args[4]};return {rows:[]};
          }
          throw new Error('Unexpected query');
        }`,
      };
      builder.onResolve({filter:/.*/},args=>args.path in fixtures?{path:args.path,namespace:"fixture"}:undefined);
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path]!,loader:"js"}));
    }}]});
    const require = createRequire(import.meta.url);
    let cache = require(output);
    const key = await cache.fullSiteReportSourceKey("scan");
    const report = {score:92,services:["Cookiebot"],counts:{pages:171},limitation:"retained"};
    assert.equal(await cache.writeFullSiteReportCache("scan",key,report),true);
    delete require.cache[output]; cache=require(output);
    assert.deepEqual(await cache.readFullSiteReportCache("scan",key),report);
    state.row!.payload[0] = state.row!.payload[0]! ^ 1;
    assert.equal(await cache.readFullSiteReportCache("scan",key),null);
    state.fingerprint="changed evidence";
    assert.notEqual(await cache.fullSiteReportSourceKey("scan"),key);
    assert.equal(await cache.writeFullSiteReportCache("scan",key,report),false);
    const changedKey=await cache.fullSiteReportSourceKey("scan");
    state.revision="release-b";
    assert.notEqual(await cache.fullSiteReportSourceKey("scan"),changedKey);
    const currentKey=await cache.fullSiteReportSourceKey("scan");
    assert.equal(await cache.writeFullSiteReportCache("scan",currentKey,{large:randomBytes(700000).toString("base64")}),false);
    assert.equal(await cache.writeFullSiteReportCache("scan",currentKey,{large:"x".repeat(17*1024*1024)}),false);
    assert.equal(state.writes,1);
    assert.equal(cache.isDefaultFullSiteReport(new URLSearchParams("kind=all&sort=priority&pageSort=url&offset=0&stream=1"),false),true);
    for(const query of ["kind=all&q=example","kind=all&offset=50","kind=all&detailPage=page","kind=all&sort=vendor","kind=cookie"])
      assert.equal(cache.isDefaultFullSiteReport(new URLSearchParams(query),false),false);
    assert.equal(cache.isDefaultFullSiteReport(new URLSearchParams("kind=all"),true),false);
  } finally { delete globals.reportCacheFixture; await rm(directory,{recursive:true,force:true}); }
});

test("a persisted report delivers the full inventory without reading page evidence on a cold process", async () => {
  const directory = await mkdtemp(resolve("apps/web/.report-cache-test-"));
  try {
    const output=join(directory,"loader.cjs");
    await build({entryPoints:[resolve("apps/web/server/scans/full-site-report.ts")],outfile:output,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"fixtures",setup(builder){
      const fixtures:Record<string,string>={
        "server-only":"",
        "@website-signal-risk-scanner/db":`export function query(){throw new Error('Evidence must not be queried');} export const loadFullSiteCrawl=query,loadFullSitePages=query;`,
        "./full-site-score":`export function loadFullSiteScore(){throw new Error('Score must not be rebuilt');}`,
        "./full-site-reviewed-policies":`export function loadFullSiteReviewedPolicies(){throw new Error('Policies must not be reread');}`,
        "./full-site-relationship-counts":`export function loadFullSiteRelationshipCounts(){throw new Error('Graphs must not be reread');}`,
        "./full-site-report-cache":`export function isDefaultFullSiteReport(){return true;} export async function fullSiteReportSourceKey(){return 'valid-key';}
          export async function readFullSiteReportCache(){return {summary:{state:{scanId:'scan',status:'completed'}},score:{value:92},resources:{rows:[{key:'retained-resource'}]},pages:{rows:[]}};}
          export function writeFullSiteReportCache(){throw new Error('Hit must not write');}`,
      };
      builder.onResolve({filter:/.*/},args=>args.path in fixtures?{path:args.path,namespace:"fixture"}:undefined);
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path]!,loader:"js"}));
    }}]});
    const require=createRequire(import.meta.url);
    for(let i=0;i<2;i++) {
      delete require.cache[output]; let score:number|undefined;
      const report=await require(output).loadFullSiteReport("scan",new URLSearchParams("kind=all"),false,{onOverview:(value:{score:{value:number}})=>{score=value.score.value;}});
      assert.equal(score,92);assert.equal(report.resources.rows[0].key,"retained-resource");
    }
  } finally { await rm(directory,{recursive:true,force:true}); }
});
