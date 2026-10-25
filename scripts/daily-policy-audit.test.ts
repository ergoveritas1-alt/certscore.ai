import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { preparePolicyAudit, sealPolicyAudit, comparePolicyAudit, finalizePolicyAudit } from "./daily-policy-audit";
import { sha256 } from "./lib/daily-policy-audit";
function fixture(t: TestContext) {
  const base = mkdtempSync(path.join(os.tmpdir(), "certscore-policy-cli-")), run = path.join(base, "source"), out = path.join(base, "new");
  mkdirSync(run); t.after(() => rmSync(base, { recursive: true, force: true }));
  const save = (name: string, value: unknown) => writeFileSync(path.join(run, name), JSON.stringify(value));
  const bundle = { scanId: "scan1", policySurfaceObservations: [] }, raw = JSON.stringify(bundle), file = path.join(run, "bundle.json"); writeFileSync(file, raw);
  save("work-inventory-v2.json", [{ id: "scan1", hostname: "example.test", status: "completed" }]);
  save("evidence-retrieval-receipts.json", [{ scanId: "scan1", kind: "scanArtifactUri", eventIndex: 0, verified: true, localPath: file, expected: { sha256: sha256(raw), sizeBytes: Buffer.byteLength(raw) } }]);
  save("support-retrieval-receipts.json", []); save("full-review-selection.json", { seed: "seed", normalRandomScanIds: ["scan1"] });
  return { base, run, out, file, save };
}
test("prepare is metadata-only, records shortfall, and cannot overwrite source/history", t => {
  const f = fixture(t), bytes = readFileSync(f.file);
  const result = preparePolicyAudit({ ...f, invocation: "manual_pilot" });
  assert.equal(result.inventoryAttempts, 1); assert.equal(result.verifiedBundleMetadataChecks, 1); assert.equal(result.selection.shortfall, 8);
  assert.deepEqual(readFileSync(f.file), bytes); assert.equal(existsSync(path.join(f.out, "policy-pass-a.json")), false);
  assert.throws(() => preparePolicyAudit({ ...f, invocation: "manual_pilot" }));
  assert.throws(() => preparePolicyAudit({ ...f, out: path.join(f.run, "nested"), invocation: "manual_pilot" }));
});
test("duplicate identities and mismatched source scan IDs fail safely", t => {
  const f = fixture(t); f.save("work-inventory-v2.json", [{ id: "scan1" }, { id: "scan1" }]);
  assert.throws(() => preparePolicyAudit({ ...f, invocation: "manual_pilot" }), /Duplicate/);
  f.save("work-inventory-v2.json", [{ id: "another" }]);
  const result = preparePolicyAudit({ ...f, invocation: "manual_pilot" });
  assert.equal(result.verifiedBundleMetadataChecks, 0); assert.equal(result.bundleUnavailableOrInvalid, 1);
});
test("comparison cannot read product outputs before a seal", async t => {
  const f = fixture(t); preparePolicyAudit({ ...f, invocation: "manual_pilot" });
  await assert.rejects(comparePolicyAudit(f.out));
  assert.equal(existsSync(path.join(f.out, "policy-product-comparison-sources.json")), false);
});
test("sealed source inventory is immutable and comparison detects Pass A tampering", async t => {
  const f = fixture(t); preparePolicyAudit({ ...f, invocation: "manual_pilot" });
  const review = path.join(f.out, "policy-review-template.json");
  sealPolicyAudit(f.out, review); assert.throws(() => sealPolicyAudit(f.out, review), /already saved/);
  writeFileSync(path.join(f.out, "policy-pass-a.json"), "{}");
  await assert.rejects(comparePolicyAudit(f.out), /seal mismatch/);
});
test("empty eligible cohort completes with explicit zero reviews and no accuracy claim", async t => {
  const f = fixture(t); preparePolicyAudit({ ...f, invocation: "manual_pilot" });
  sealPolicyAudit(f.out, path.join(f.out, "policy-review-template.json"));
  const summary = await comparePolicyAudit(f.out);
  assert.equal(summary.completedPolicyReviews, 0); assert.equal(summary.precision, null); assert.equal(summary.inventoryAttempts, 1);
  assert.equal(summary.pilot.manualPilotCountsAsScheduled, false);
  const comparisons = readFileSync(path.join(f.out, "policy-topic-review.json")), review = path.join(f.base, "pass-b.json");
  writeFileSync(review, JSON.stringify({ comparisonSha256: sha256(comparisons), reviewerKind: "independent_model_audit", pairs: [] }));
  assert.equal(finalizePolicyAudit(f.out, review).pairs, 0);
  assert.throws(() => finalizePolicyAudit(f.out, review));
});
test("Pass B refuses missing topic dispositions and changed comparison bytes", async t => {
  const f = fixture(t); preparePolicyAudit({ ...f, invocation: "manual_pilot" }); sealPolicyAudit(f.out, path.join(f.out, "policy-review-template.json"));
  await comparePolicyAudit(f.out);
  const review = path.join(f.base, "pass-b.json"), comparisons = readFileSync(path.join(f.out, "policy-topic-review.json"));
  writeFileSync(review, JSON.stringify({ comparisonSha256: sha256(comparisons), reviewerKind: "independent_model_audit", pairs: [{scanId:"unexpected"}] }));
  assert.throws(() => finalizePolicyAudit(f.out, review));
  writeFileSync(path.join(f.out, "policy-topic-review.json"), "[]");
  assert.throws(() => finalizePolicyAudit(f.out, review), /Comparison seal drift/);
});
