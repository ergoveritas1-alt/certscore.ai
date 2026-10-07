import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

test("form images use the ready report generation and preserve the retained-image verifier", async () => {
  const directory = await mkdtemp(path.resolve("tmp/form-snapshot-route-"));
  const fixturePath = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "route.cjs");
  try {
    await writeFile(fixturePath, `
      const assert = require('node:assert/strict');
      const state = { ready: true, generation: 'a'.repeat(64), image: Buffer.from([255,216,255,217]), calls: [] };
      const projection = {scan: {id: '11111111-1111-4111-8111-111111111111', status: 'completed'}, runtimeArtifacts: {postAcceptEvidenceProjection: {formSnapshotCapture: {}}}};
      module.exports = {
        state,
        getPublicScanById: () => {throw new Error('Raw scan records lack After Accept form provenance')},
        getPublicScanStatusProjection: async id => {assert.equal(id, projection.scan.id); return {reportReady:state.ready,reportGeneration:state.generation}},
        loadPersistedScanReportProjection: async input => {state.calls.push(input); assert.equal(input.generation,state.generation); return state.missing ? null : projection},
        loadSinglePageFormSnapshot: async (record,ref) => {assert.equal(record,projection); assert.match(ref,/^after_accept:collection_form_[01]$/); return state.image},
        enforceApiV2ScanReadThrottle: async () => state.throttled ? new Response(null,{status:429}) : null,
        runtimeGraphQuotaRequest: request => request,
      };
    `);
    await build({ entryPoints: [path.resolve("apps/web/app/api/scans/[scanId]/form-snapshot/route.ts")],
      outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external",
      plugins: [{name:"report-generation-fixture",setup(builder) {
        builder.onResolve({filter:/(?:get-scan-by-id|scan-report-projection|scan-status-projection|local-v2-dag-report|api-v2-read-throttle|runtime-evidence-graph-access)$/},
          () => ({path:fixturePath,external:true}));
      }}],
    });
    const require = createRequire(import.meta.url);
    const {state} = require(fixturePath);
    const {GET} = require(output);
    const scanId="11111111-1111-4111-8111-111111111111";
    const context={params:Promise.resolve({scanId})};
    const request=(ref:string)=>new Request(`http://localhost:3000/api/scans/${scanId}/form-snapshot?formRef=${encodeURIComponent(ref)}`);
    for (const ref of ["after_accept:collection_form_0","after_accept:collection_form_1"]) {
      const response=await GET(request(ref),context);
      assert.equal(response.status,200);
      assert.equal(response.headers.get("content-type"),"image/jpeg");
      assert.equal(response.headers.get("cache-control"),"private, no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),state.image);
    }
    assert.deepEqual(state.calls,[{scanId,generation:"a".repeat(64)},{scanId,generation:"a".repeat(64)}]);
    state.ready=false;
    assert.equal((await GET(request("after_accept:collection_form_0"),context)).status,404);
    assert.equal(state.calls.length,2);
    state.ready=true; state.missing=true;
    assert.equal((await GET(request("after_accept:collection_form_0"),context)).status,404);
    state.missing=false; state.image=null;
    assert.equal((await GET(request("after_accept:collection_form_0"),context)).status,404);
    state.throttled=true;
    assert.equal((await GET(request("after_accept:collection_form_0"),context)).status,429);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
