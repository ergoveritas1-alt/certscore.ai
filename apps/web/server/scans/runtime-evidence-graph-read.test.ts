import assert from "node:assert/strict";
import test from "node:test";
import { handleRuntimeGraphRead } from "./runtime-evidence-graph-read";
import { runtimeGraphUiFixture } from "../../components/scans/runtime-evidence-graph-ui-fixture";
import type { ScanDetailResponse } from "./get-scan-by-id";

const scanId = "00000000-0000-4000-8000-000000000123";
const request = new Request(`https://certscore.ai/api/scans/${scanId}/runtime-evidence-graph`);
const record = () => ({ scan: { id: scanId, status: "completed" }, runtimeArtifacts: { runtimeEvidenceGraphProjection: { ...runtimeGraphUiFixture(), scanId } } }) as unknown as ScanDetailResponse;

test("canonical quota runs before access lookup and artifact hydration", async () => {
  const order: string[] = [];
  const response = await handleRuntimeGraphRead(request, scanId, { throttle: async () => { order.push("quota"); return null; }, loadAuthorized: async () => { order.push("access"); return record(); }, hydrate: async value => { order.push("artifact"); return value; } });
  assert.deepEqual(order, ["quota", "access", "artifact"]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await response.json()).scanId, scanId);
});

test("denied/unavailable protection prevents every report/artifact read and preserves retry response", async () => {
  for (const status of [429, 503]) {
    const denied = Response.json({ error: "canonical policy response" }, { status, headers: { "Retry-After": "60" } });
    const response = await handleRuntimeGraphRead(request, scanId, { throttle: async () => denied, loadAuthorized: async () => { assert.fail("no report read"); }, hydrate: async () => { assert.fail("no artifact read"); } });
    assert.equal(response, denied);
  }
  const response = await handleRuntimeGraphRead(request, scanId, { throttle: async () => { throw new Error("protection unavailable"); }, loadAuthorized: async () => { assert.fail("no report read"); }, hydrate: async () => { assert.fail("no artifact read"); } });
  assert.equal(response.status, 503);
});

test("inaccessible, incomplete or cross-scan records cannot reach graph hydration", async () => {
  for (const value of [null, { ...record(), scan: { ...record().scan, status: "pending" } }, { ...record(), scan: { ...record().scan, id: "another" } }]) {
    const response = await handleRuntimeGraphRead(request, scanId, { throttle: async () => null, loadAuthorized: async () => value as ScanDetailResponse | null, hydrate: async () => { assert.fail("no unauthorized artifact read"); } });
    assert.equal(response.status, 404);
  }
  const response = await handleRuntimeGraphRead(request, "not-a-scan", { throttle: async () => { assert.fail("invalid identity"); }, loadAuthorized: async () => null, hydrate: async value => value });
  assert.equal(response.status, 400);
});

test("GPC inventory view returns only its resources under the same access and quota boundary", async () => {
 const value=record();value.scan.domainHostname="fixture.test";
 const projection=value.runtimeArtifacts!.runtimeEvidenceGraphProjection as ReturnType<typeof runtimeGraphUiFixture>;
 const gpc=projection.graphs.find(g=>g.scenario==="gpc")!;gpc.captureId=`${scanId}:gpc_observation`;
 const response=await handleRuntimeGraphRead(new Request(`${request.url}?view=gpc-inventory`),scanId,{throttle:async()=>null,loadAuthorized:async()=>value,hydrate:async r=>r});
 assert.equal(response.status,200);const body=await response.json();
 assert.ok(body.inventory.resources.length);assert.equal(body.clockLabel,"Times from GPC visit start");
 assert.equal(body.graphs,undefined);assert.equal(body.stacks,undefined);
 assert.ok(body.inventory.resources.every((r:any)=>r.occurrence.evidenceRefs.every((ref:string)=>ref.startsWith("gpc:"))));
});

test("GPC flagged-items reads return only distinct inventory counts bound to the requested report generation", async () => {
  const hydrated = record();
  const graph = hydrated.runtimeArtifacts!.runtimeEvidenceGraphProjection as ReturnType<typeof runtimeGraphUiFixture>;
  const gpc = graph.graphs.find(g => g.scenario === "gpc")!;
  gpc.captureId = `${scanId}:gpc_observation`;
  const attempted = gpc.nodes.find(node => node.kind === "cookie")!;
  gpc.nodes.push({ ...attempted, id: "cookie-snapshot", operation: "snapshot", outcome: "stored" });
  const compact = { ...hydrated, runtimeArtifacts: { runtimeEvidenceGraphProjection: {
    ...graph, graphs: [], details: { href: new URL(request.url).pathname, sha256: "a".repeat(64),
      scenarioCount: graph.graphs.length, nodeCount: 10, edgeCount: 5 },
  } } };
  const response = await handleRuntimeGraphRead(new Request(`${request.url}?view=gpc-flagged-items`), scanId,
    { throttle: async () => null, loadAuthorized: async () => compact, hydrate: async () => hydrated });
  const summary = await response.json();
  assert.equal(summary.scanId, scanId);
  assert.equal(summary.graphHash, "a".repeat(64));
  assert.equal(summary.count, 1);
  assert.equal(summary.contributors.length, 1);
  assert.equal(summary.contributors[0].review, 1);
  assert.deepEqual(summary.breakdown, { nonEssential: 0, review: 1 });
  assert.deepEqual(Object.keys(summary).sort(), ["breakdown", "contributors", "count", "graphHash", "scanId", "state"]);
});
