import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

test("sample service reads the writer for exact public target/region reuse and preserves normal scan guards", async () => {
  await mkdir("tmp", { recursive: true });
  const directory = await mkdtemp(path.resolve("tmp/sample-report-"));
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "service.cjs");
  const webRequire = createRequire(path.resolve("apps/web/package.json"));
  try {
    await writeFile(fixture, `
      const state = {queries:[],creations:[],locks:[],candidates:[],attempt:null,failRead:false};
      module.exports = {state,
        query:async (sql,params,options)=>{state.queries.push({sql,params,options});if(state.failRead)throw Error('read failed');return {rows:state.candidates}},
        queryOne:async(sql,params,options)=>{state.queries.push({sql,params,options});return state.attempt},
        withNonBlockingDatabaseLock:async(key,run)=>{state.locks.push(key);return {acquired:true,value:await run()}},
        getPlanLimits:async()=>({maxPagesPerScan:3}),
        getScanRequesterIpContext:()=>({ipHash:'fixture-hash'}),
        createAnonymousFullScan:async input=>{state.creations.push(input);return {scan:{id:'fresh-scan'}}},
        normalizeLocalV2DagRunViaLambda:()=>true,shouldUseLocalhostFullScanQueue:()=>false,
        LOCAL_V2_DAG_SCAN_PROCESSOR:'local-certscore-v2-dag-parallel-v1',
        getLocalV2DagLambdaAwsRegionForScanFrom:value=>value==='california'?'us-west-1':value==='eu_ie'?'eu-west-1':'eu-central-1'
      };
    `);
    await build({ entryPoints: [path.resolve("apps/web/server/scans/sample-report-service.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "sample-fixture", setup(builder) {
        builder.onResolve({ filter: /^(?:@website-signal-risk-scanner\/db|\.\.\/plans\/get-plan-limits|\.\/create-anonymous-full-scan|\.\/local-v2-dag-scan-config|\.\/requester-ip-context)$/ },
          () => ({ path: fixture, external: true }));
        builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
      } }] });
    const require = createRequire(import.meta.url);
    const { state } = require(fixture);
    const { openVisitorSampleReport } = require(output);
    const target = "https://ergoveritas.com/test1.html";
    state.candidates = [{ id: "recent", organizationId: null, hostname: "ergoveritas.com", normalizedUrl: target,
      completedAt: new Date(Date.now() - 1_000).toISOString(), status: "completed", scanType: "full", scanFrom: "california",
      pagesRequested: 3, pagesScanned: 3, gpcObservationEnabled: true, coverageLevel: "full", scanOutcome: "completed_successfully" }];
    const input = { scanFrom: "california", headers: new Headers(), scheduleBackgroundTask: () => {} };
    assert.deepEqual(await openVisitorSampleReport(input), { kind: "recent", scanId: "recent" });
    assert.equal(state.creations.length, 0);
    assert.equal(state.queries[0].options.readOnly, false);
    assert.equal(state.queries[0].params[0], null);
    assert.equal(state.queries[0].params[2], 24);
    assert.equal(state.queries[0].params[3], "california");
    assert.equal(state.queries[0].params[6], target);
    assert.match(state.queries[0].sql, /normalized_url\) = \$7/);

    // A query variant is not this exact sample, even though ordinary reuse
    // intentionally matches paths across scheme/query variants.
    state.candidates[0].normalizedUrl = target + "?variant=other";
    assert.deepEqual(await openVisitorSampleReport(input), { kind: "fresh", scanId: "fresh-scan" });
    const attemptQuery = state.queries.at(-1);
    assert.equal(attemptQuery.options.readOnly, false);
    assert.match(attemptQuery.sql, /s.organization_id is null and d.organization_id is null/);
    assert.match(attemptQuery.sql, /normalizedUrl' = \$2/);
    assert.match(attemptQuery.sql, /scanFrom' = \$3/);
    assert.deepEqual(attemptQuery.params.slice(0, 4), ["ergoveritas.com", target, "california", 3]);
    const created = state.creations[0];
    assert.equal(created.normalizedUrl, target);
    assert.equal(created.hostname, "ergoveritas.com");
    assert.equal(created.scanFrom, "california");
    assert.equal(created.provenance.source, "sample-report");
    assert.equal(created.bypassRecentScanReuse, true);
    assert.equal("countAnonymousQuota" in created, false);
    assert.equal("localV2DagLambdaDebugOverrides" in created, false);
    assert.match(created.clientRequestId, /^sample-report:california:/);
    assert.ok(state.locks.every((key: string) => key === "sample-report:california"));

    state.failRead = true;
    await assert.rejects(openVisitorSampleReport(input), /read failed/);
    assert.equal(state.creations.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
