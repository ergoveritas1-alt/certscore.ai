import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const webRequire = createRequire(path.resolve("apps/web/package.json"));

test("publication skips stale loaded/materialized generations before expensive projection and preserves the final guard", async () => {
  await mkdir(path.resolve("tmp"), { recursive: true });
  const directory = await mkdtemp(path.resolve("tmp/publisher-speed-"));
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "publisher.cjs");
  try {
    await writeFile(fixture, `
      const state = {loads:0,materializations:0,projections:0,latest:1,changeOnLoad:true,changeOnMaterialize:true};
      class StaleScanReportProjectionSourceError extends Error {}
      class ScanReportProjectionNotReadyError extends Error {}
      async function load() {
        state.loads++;
        const record = {scan:{id:'scan',status:'completed'},snapshot:{},events:[{id:String(state.latest),createdAt:'2026-10-08T12:00:00.000Z',eventType:'v2_lambda_result.received'}],signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true}};
        if (state.changeOnLoad) {state.changeOnLoad=false;state.latest++;}
        return record;
      }
      module.exports = {state,StaleScanReportProjectionSourceError,ScanReportProjectionNotReadyError,
        queryOne: async sql => sql.includes('worker_reserved')
          ? {scan_status:'completed',projection_required:true,merged_signals_ready:true,findings_ready:true,worker_reserved:false}
          : {event_count:1,latest_event_id:String(state.latest)},
        withNonBlockingDatabaseLock: async (key,run) => ({acquired:true,value:await run()}),
        getScanById:load,getAnonymousScanById:load,
        getLocalV2DagReportInput:() => ({}),
        materializeLocalV2DagScanDetail:async record => {state.materializations++;if(state.changeOnMaterialize){state.changeOnMaterialize=false;state.latest++;}return record},
        persistScanReportProjection: async record => {state.projections++;if(record.events[0].id!==String(state.latest))throw new StaleScanReportProjectionSourceError('stale')},
        getPersistedScanReportProjection:()=>null,isCurrentScanReportProjectionReady:()=>false,
        SCAN_REPORT_PROJECTION_VERSION:'test',getPublicScanStatusProjection:()=>null};
    `);
    await build({ entryPoints: [path.resolve("apps/web/server/scans/canonical-scan-report-publisher.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "publisher-fixture", setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
        builder.onResolve({ filter: /(?:@website-signal-risk-scanner\/db|\.\/get-scan-by-id|\.\/local-v2-dag-report|\.\/scan-report-projection|\.\/scan-report-projection-contract|\.\/scan-status-projection)$/ },
          () => ({ path: fixture, external: true }));
        builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
      } }] });
    const require = createRequire(import.meta.url);
    const { state } = require(fixture);
    const { publishCanonicalScanReportProjection } = require(output);
    const result = await publishCanonicalScanReportProjection({ organizationId: null, scanId: "scan" });
    assert.equal(result.status, "ready");
    assert.equal(result.latestEventId, "3");
    assert.equal(state.loads, 3);
    assert.equal(state.materializations, 2, "stale load must not start materialization");
    assert.equal(state.projections, 1, "stale materialization must not start projection");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("read recovery cannot steal worker publication or coalesce away its artifact transfer", async () => {
  await mkdir(path.resolve("tmp"), { recursive: true });
  const directory = await mkdtemp(path.resolve("tmp/publisher-ownership-"));
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "publisher.cjs");
  try {
    await writeFile(fixture, `
      let release;
      const ownershipRead = new Promise(resolve => {release=resolve});
      const state = {locks:0,loads:0,materializations:0,projections:0,transfer:null,ownershipReads:0,release};
      const record = {scan:{id:'scan',status:'completed'},snapshot:{},events:[{id:'1',createdAt:'2026-10-08T12:00:00.000Z',eventType:'v2_lambda_result.received'}],signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true}};
      module.exports = {state,
        StaleScanReportProjectionSourceError:class extends Error {},ScanReportProjectionNotReadyError:class extends Error {},
        queryOne:async sql => {
          if(sql.includes('worker_reserved')){state.ownershipReads++;await ownershipRead;return {scan_status:'completed',projection_required:true,merged_signals_ready:true,findings_ready:true,worker_reserved:true}}
          return {event_count:1,latest_event_id:'1'};
        },
        withNonBlockingDatabaseLock:async(key,run)=>{state.locks++;return {acquired:true,value:await run()}},
        getScanById:async()=>{state.loads++;return record},getAnonymousScanById:async()=>{state.loads++;return record},
        getLocalV2DagReportInput:()=>({}),
        materializeLocalV2DagScanDetail:async(record,options)=>{state.materializations++;state.transfer=options.artifactTransfer;return record},
        persistScanReportProjection:async()=>{state.projections++},
        getPersistedScanReportProjection:()=>null,isCurrentScanReportProjectionReady:()=>false,
        SCAN_REPORT_PROJECTION_VERSION:'test',getPublicScanStatusProjection:()=>null};
    `);
    await build({ entryPoints: [path.resolve("apps/web/server/scans/canonical-scan-report-publisher.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "ownership-fixture", setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
        builder.onResolve({ filter: /(?:@website-signal-risk-scanner\/db|\.\/get-scan-by-id|\.\/local-v2-dag-report|\.\/scan-report-projection|\.\/scan-report-projection-contract|\.\/scan-status-projection)$/ },
          () => ({ path: fixture, external: true }));
        builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
      } }] });
    const require = createRequire(import.meta.url);
    const { state } = require(fixture);
    const { publishCanonicalScanReportProjection: publish } = require(output);
    const read = publish({ organizationId: null, scanId: "scan", artifactTransfer: { untrusted: true } });
    const duplicate = publish({ organizationId: null, scanId: "scan" });
    assert.equal(read, duplicate, "read callers still coalesce");
    const forceRead = publish({ organizationId: null, scanId: "scan", forceRebuild: true });
    const transfer = { worker: "original retained bytes" };
    const worker = publish({ organizationId: null, scanId: "scan", publicationTrigger: "authorized_worker", artifactTransfer: transfer });
    // A pending read-side query must not block or replace the authorized worker promise.
    assert.notEqual(read, worker);
    const result = await Promise.race([worker, new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("worker coalesced with pending read")), 1000);
      timer.unref();
    })]);
    assert.equal(result.status, "ready");
    assert.equal(state.transfer, transfer);
    state.release();
    for (const pending of [read, forceRead]) {
      assert.equal((await pending).reason, "durable_worker_publication_pending");
    }
    assert.deepEqual({locks:state.locks,loads:state.loads,materializations:state.materializations,projections:state.projections},
      {locks:1,loads:1,materializations:1,projections:1});
    assert.equal(state.ownershipReads, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
