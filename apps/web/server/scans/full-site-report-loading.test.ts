import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("report publishes canonical overview before policy reads, including on a cold process", async () => {
  const directory = await mkdtemp(resolve("apps/web/.report-stream-test-"));
  try {
    const output = join(directory,"loader.cjs");
    await build({entryPoints:[resolve("apps/web/server/scans/full-site-report.ts")],outfile:output,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"fixtures",setup(builder) {
      const fixtures: Record<string,string> = {
        "server-only":"",
        "@website-signal-risk-scanner/db":`export async function loadFullSiteCrawl(){throw new Error('Duplicate crawl read');} export async function loadFullSitePages(){return [];} export async function query(){return {rows:[]};}`,
        "./full-site-score":`export async function loadFullSiteScore(){return {value:92,assessedStorageRecords:[],limitedPages:4};}`,
        "./full-site-reviewed-policies":`export async function loadFullSiteReviewedPolicies(){throw new Error('Slow details unavailable');}`,
        "./full-site-relationship-counts":`export async function loadFullSiteRelationshipCounts(){throw new Error('Graph details must follow overview');}`,
      };
      builder.onResolve({filter:/.*/},args=>args.path in fixtures?{path:args.path,namespace:"fixture"}:undefined);
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path]!,loader:"js"}));
    }}]});
    const require=createRequire(import.meta.url);
    const crawl={scan_id:"scan",status:"completed",policy_json:{},requested_json:{maxPages:500,concurrency:3,waitSeconds:5},effective_concurrency:3,effective_wait_seconds:5,region:"eu-west-1",configuration_hash:"hash",started_at:new Date(),completed_at:new Date(),robots_json:null};
    for (let i=0;i<2;i++) {
      delete require.cache[output];
      let overview: {score:{value:number;limitedPages:number};summary:{state:{status:string}}} | undefined;
      await assert.rejects(require(output).loadFullSiteReport("scan",new URLSearchParams(),false,{crawl,onOverview:(value: typeof overview)=>{overview=value;}}),/Slow details unavailable/);
      assert.equal(overview?.score.value,92);
      assert.equal(overview?.score.limitedPages,4);
      assert.equal(overview?.summary.state.status,"completed");
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("server stream delivers overview before completion and strips duplicate assessment fields", async () => {
  const directory = await mkdtemp(resolve("apps/web/.report-stream-test-"));
  try {
    const output=join(directory,"stream.cjs");
    await build({entryPoints:[resolve("apps/web/server/scans/full-site-report-stream.ts")],outfile:output,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"server-only",setup(builder){
      builder.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"",loader:"js"}));
    }}]});
    const {streamFullSiteReport}=createRequire(import.meta.url)(output);
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const overview={score:{value:92},summary:{counts:{completed:171}},finalizationStartedAt:null};
    const response=streamFullSiteReport(async (send:(value:unknown)=>void)=>{send(overview);await gate;return {...overview,services:[]};});
    const reader=response.body.getReader();
    const first=JSON.parse(new TextDecoder().decode((await reader.read()).value));
    assert.equal(first.type,"overview");
    assert.deepEqual(first.data,overview);
    assert.equal(response.headers.get("cache-control"),"private, no-store, no-transform");
    release();
    const second=JSON.parse(new TextDecoder().decode((await reader.read()).value));
    assert.equal(second.type,"report");
    assert.deepEqual(second.data,{services:[]});
    assert.equal((await reader.read()).done,true);
    const failed=streamFullSiteReport(async()=>{throw new Error("private backend detail");});
    const error=JSON.parse(await failed.text());
    assert.equal(error.type,"error");
    assert.ok(!error.message.includes("private backend"));
  } finally {await rm(directory,{recursive:true,force:true});}
});
