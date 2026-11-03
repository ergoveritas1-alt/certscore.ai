import assert from "node:assert/strict";
import test from "node:test";
import { cookieSnapshotSchema } from "./index";
import { gpcCookieReadBindingSchema } from "./gpc-cookie-read-binding";
const proof = { contractVersion: "certscore.gpc-cookie-read-binding.v1", scope: "gpc_browser_context_point_in_time", scanId: "fixture",
  captureId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", snapshotArtifactId: "cookie_snapshot_pre_consent", documentToken: "private-loader",
  targetUrlSha256: "a".repeat(64), documentUrlSha256: "b".repeat(64), documentCommittedAtMs: 10, startedAtMs: 20, completedAtMs: 22,
  inventoryCompleteness: "not_assessed", matchedRequestHorizon: "not_established" };
test("private GPC cookie binding is bounded and independent of legacy baseline snapshot eligibility", () => {
  const legacy = cookieSnapshotSchema.parse({ artifactId: "cookie_snapshot_pre_consent", capturedAtMs: 22, consentStateAtTime: "pre_consent", cookies: [] });
  assert.equal(legacy.gpcReadBinding, undefined); assert.equal(legacy.captureCoverage, undefined);
  assert.deepEqual(cookieSnapshotSchema.parse({ ...legacy, gpcReadBinding: proof }).gpcReadBinding, proof);
  assert.equal(cookieSnapshotSchema.parse({ ...legacy, gpcReadBinding: proof }).captureCoverage, undefined);
  for (const change of [{ rawCookie: "PRIVATE" }, { startedAtMs: 9 }, { completedAtMs: 19 }, { completedAtMs: 120001 },
    { matchedRequestHorizon: "matched" }, { inventoryCompleteness: "complete" }, { documentToken: "x".repeat(161) }, { captureId: "unknown" }, { documentUrlSha256: "unknown" }])
    assert.equal(gpcCookieReadBindingSchema.safeParse({ ...proof, ...change }).success, false);
});
