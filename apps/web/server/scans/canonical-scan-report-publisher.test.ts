import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

test("publication skips stale loaded/materialized generations before expensive projection and preserves the final guard", async () => {
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
        queryOne: async () => ({event_count:1,latest_event_id:String(state.latest)}),
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
