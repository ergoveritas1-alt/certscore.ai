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
