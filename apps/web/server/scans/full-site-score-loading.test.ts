import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("completed crawls persist permanent page limitations but never persist failed evidence reads", async () => {
  const directory = await mkdtemp(resolve("apps/web/.site-score-loading-"));
  try {
    const output = join(directory, "loader.cjs");
    await build({ entryPoints: [resolve("apps/web/server/scans/full-site-score.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "score-fixtures", setup(builder) {
        const fixtures: Record<string, string> = {
          "server-only": "",
          "@website-signal-risk-scanner/db": `
            export async function query(sql, args) {
              if (sql.startsWith('update')) { globalThis.scoreWrites.push(JSON.parse(args[1])); return {rows:[]}; }
              if (sql.includes('full_site_attempts')) return {rows:[{id:'attempt',page_id:'child',artifact_json:{bucket:'bucket',evidenceKey:'prefix/child/attempt/evidence.json',sourceHash:'a'.repeat(64)}}]};
              return {rows:[{report_projection_payload_sha256:globalThis.snapshotHash}]};
            }
            export async function readFullSiteArtifact(){ throw new Error('Temporary S3 failure'); }
          `,
          "./scan-report-projection-contract": "export const readPersistedScanReportProjection=()=>({runtimeArtifacts:{}});",
          "./persisted-canonical-report-projection": "export const getPersistedCanonicalReportProjection=()=>({checklistRows:[],globalUnifiedFindings:[],ownerUnifiedFindings:[]});",
          "./canonical-overall-score": "export const deriveCanonicalOverallScoreForReport=()=>100;",
        };
        builder.onResolve({filter:/.*/}, args => args.path in fixtures ? {path:args.path,namespace:"fixture"} : undefined);
        builder.onLoad({filter:/.*/,namespace:"fixture"}, args => ({contents:fixtures[args.path]!,loader:"js"}));
      } }] });
    const globals = globalThis as typeof globalThis & {scoreWrites: Array<{sourceHash:string;score:unknown}>;snapshotHash:string};
    globals.scoreWrites = []; globals.snapshotHash = "b".repeat(64);
    const require = createRequire(import.meta.url);
    const {loadFullSiteScore} = require(output);
    const crawl = {scan_id:"scan",status:"completed",completed_at:new Date(),configuration_hash:"config",policy_json:{},bucket:"bucket",artifact_prefix:"prefix",region:"eu-west-1"};
    const home = {id:"home",source:"homepage",url:"https://example.com/",status:"completed",observation:{executionProfile:"homepage_baseline"}};
    const failed = {id:"child",url:"https://example.com/child",status:"failed",observation:null};
    const first = await loadFullSiteScore(crawl,[home,failed]);
    assert.equal(first.limitedPages,1);
    assert.equal(first.value,100);
    assert.equal(globals.scoreWrites.length,1, "permanent failed page must not prevent durable reuse");
    delete require.cache[output];
    const cached = await require(output).loadFullSiteScore({...crawl,policy_json:{fullSiteScore:globals.scoreWrites[0]}},[home,failed]);
    assert.deepEqual(cached,first);
    assert.equal(globals.scoreWrites.length,1);
    globals.snapshotHash = "c".repeat(64);
    const missing = {...failed,status:"completed",observation:{status:"completed",httpStatus:200,attemptId:"attempt",parentScanId:"scan",pageJobId:"child",configurationHash:"config",sourceHash:"a".repeat(64),runtimeGraph:{sourceSizeBytes:100}}};
    const limited = await loadFullSiteScore(crawl,[home,missing]);
    assert.equal(limited.limitedPages,1);
    assert.equal(globals.scoreWrites.length,1,"temporary read failure must remain retryable, not durably cached");
  } finally { await rm(directory,{recursive:true,force:true}); }
});
