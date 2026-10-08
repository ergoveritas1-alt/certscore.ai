import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { CANONICAL_SCAN_ID_PATTERN } from "@certscore/api-contracts";

test("API form screenshots share authorized report scope, read limits and retained-image verifiers", async () => {
  const directory = await mkdtemp(path.resolve("tmp/api-form-snapshot-route-"));
  const fixturePath = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "route.cjs");
  const scanId = "11111111-1111-4111-8111-111111111111";
  const pageId = "22222222-2222-4222-8222-222222222222";
  try {
    await writeFile(fixturePath, `
      const assert = require('node:assert/strict');
      const state = { calls: [], image: Buffer.from([255,216,255,217]), public: false, missing: false, fullSite: true, status: 'completed' };
      const record = () => ({ scan: { id: '${scanId}', status: state.status, scanConfigJson: {fullSite: state.fullSite} } });
      module.exports = {state, CANONICAL_SCAN_ID_PATTERN: ${CANONICAL_SCAN_ID_PATTERN.toString()},
        parseBearerToken: request => {const header=request.headers.get('authorization');return {provided:header!==null,token:header?.replace(/^Bearer /,'')??null}},
        validateCertScoreBearerToken: async (token,scopes) => {state.calls.push(['auth',scopes]);return {ok:token==='valid',key:{organizationId:'workspace'}}},
        loadPersistedScanReportProjection: async scope => {state.calls.push(['owned',scope]);return state.missing?null:record()},
        loadAnonymousPersistedScanReportProjection: async scope => {state.calls.push(['public',scope]);return state.public?record():null},
        enforceApiV2ScanReadThrottle: async input => {state.calls.push(['quota',input.scanId,input.detail]);return state.throttled?new Response(null,{status:429}):null},
        loadSinglePageFormSnapshot: async (scan,ref) => {assert.equal(scan.scan.id,'${scanId}');state.calls.push(['single',ref]);return state.image},
        loadFullSiteFormSnapshot: async (...args) => {state.calls.push(['full',...args]);return state.image},
      };
    `);
    await build({ entryPoints: [path.resolve("apps/web/app/api/v2/scans/[scanId]/report-evidence/form-snapshot/route.ts")],
      outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external",
      plugins: [{ name: "authorized-form-images", setup(builder) {
        builder.onResolve({ filter: /(?:integrations\/api-keys|api-v2-read-throttle|scan-report-projection|local-v2-dag-report|full-site-forms)$/ },
          () => ({ path: fixturePath, external: true }));
        builder.onResolve({ filter: /^@certscore\/api-contracts$/ }, () => ({ path: fixturePath, external: true }));
      } }],
    });
    const require = createRequire(import.meta.url);
    const { state } = require(fixturePath);
    const { GET } = require(output);
    const context = { params: Promise.resolve({ scanId }) };
    const request = (query: string, token: string | null = "valid") => new Request(
      `http://localhost:3000/api/v2/scans/${scanId}/report-evidence/form-snapshot?${query}`,
      { headers: token === null ? {} : { Authorization: `Bearer ${token}` } });
    for (const ref of ["collection_form_0", "after_accept:collection_form_0", "after_accept:collection_form_1"]) {
      state.calls = [];
      const response = await GET(request(`formRef=${encodeURIComponent(ref)}`), context);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), state.image);
      assert.deepEqual(state.calls, [["quota", scanId, "evidence"], ["auth", ["pulse:read"]],
        ["owned", { scanId, organizationId: "workspace" }], ["single", ref]]);
    }
    state.calls = [];
    assert.equal((await GET(request(`formPage=${pageId}&formRef=collection_form_0`), context)).status, 200);
    assert.deepEqual(state.calls.at(-1), ["full", scanId, pageId, "collection_form_0"]);
    for (const query of ["formRef=bad", "formRef=collection_form_0&formRef=collection_form_1",
      `formPage=${pageId}&formRef=after_accept:collection_form_0`, "formPage=&formRef=collection_form_0"]) {
      state.calls = [];
      assert.equal((await GET(request(query), context)).status, 400);
      assert.deepEqual(state.calls, []);
    }
    state.calls = [];
    assert.equal((await GET(request("formRef=collection_form_0", "invalid"), context)).status, 403);
    assert.ok(!state.calls.some(([kind]: [string]) => ["owned", "public", "single", "full"].includes(kind)));
    state.calls = [];
    assert.equal((await GET(request("formRef=collection_form_0", null), context)).status, 404);
    assert.deepEqual(state.calls, [["quota", scanId, "evidence"], ["public", { scanId }]]);
    state.public = true;
    assert.equal((await GET(request("formRef=collection_form_0", null), context)).status, 200);
    state.image = null;
    assert.equal((await GET(request("formRef=after_accept:collection_form_1"), context)).status, 404);
    state.status = "running";
    assert.equal((await GET(request("formRef=collection_form_0"), context)).status, 404);
    state.status = "completed"; state.fullSite = false;
    assert.equal((await GET(request(`formPage=${pageId}&formRef=collection_form_0`), context)).status, 404);
    state.throttled = true; state.calls = [];
    assert.equal((await GET(request("formRef=collection_form_0"), context)).status, 429);
    assert.deepEqual(state.calls, [["quota", scanId, "evidence"]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
