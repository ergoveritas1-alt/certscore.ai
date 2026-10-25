import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { observeReliability, scoreReliability, hash } from "./daily-reliability-scorecard";
function fixture(t: TestContext) {
  const base = mkdtempSync(path.join(os.tmpdir(), "certscore-reliability-")), run = path.join(base, "source"), out = path.join(base, "new");
  mkdirSync(run); t.after(() => rmSync(base, { recursive: true, force: true }));
  const save = (name: string, value: unknown) => writeFileSync(path.join(run, name), JSON.stringify(value));
  const bundle = { scanId: "scan1", url: "https://example.test/", scannerBuildProvenance: { gitSha: "abc" } }, bytes = JSON.stringify(bundle), file = path.join(run, "bundle.json");
  writeFileSync(file, bytes);
  const originalHash = { sha256: hash(bytes), sizeBytes: Buffer.byteLength(bytes) }, uri = "s3://test/scan1/bundle.json";
  const inventory = [{ id: "scan1", created_at: "2026-10-25T01:00:00Z", status: "completed", hostname: "example.test", source: "sdk", lambda_config: { targetEnvironment: "production" }, retained: [{ hashes: { scanArtifactUri: originalHash }, pointers: { scanArtifactUri: uri } }] }];
  save("work-inventory-v2.json", inventory);
  save("evidence-retrieval-receipts.json", [{ scanId: "scan1", kind: "scanArtifactUri", uri, eventIndex: 0, localPath: file, verified: true, expected: originalHash }]);
  save("support-retrieval-receipts.json", []);
  const primary = path.join(run, "pass-a.json"); writeFileSync(primary, "{\"observed\":true}");
  const primarySeal = path.join(run, "seal.json"); save("seal.json", { file: primary, sha256: hash(readFileSync(primary)) });
  const input = { run, out, invocation: "manual_validation" as const, primaryRunId: "manual-test", windowStart: "2026-10-25T00:00:00Z", windowEnd: "2026-10-26T00:00:00Z" };
  return { base, run, out, file, save, inventory, primarySeal, input };
}
test("source pass is sealed, excludes product outputs, and refuses overwrites", t => {
  const f = fixture(t); const original = readFileSync(f.file);
  assert.equal(observeReliability(f.input).sourceRows, 1);
  const prep = JSON.parse(readFileSync(path.join(f.out, "reliability-pass-a.json"), "utf8"));
  assert.equal(prep.rows[0].cohort, "ordinary"); assert.equal(prep.rows[0].projectionVerification, "not_checked_before_pass_a");
  assert.deepEqual(readFileSync(f.file), original); assert.throws(() => observeReliability(f.input), /fresh/);
  assert.throws(() => observeReliability({ ...f.input, out: path.join(f.run, "nested") }), /fresh/);
});
test("missing, corrupt and unbound sources remain unavailable/invalid, never a clean pass", t => {
  const f = fixture(t); writeFileSync(f.file, "{}"); observeReliability(f.input);
  const prep = JSON.parse(readFileSync(path.join(f.out, "reliability-pass-a.json"), "utf8"));
  assert.equal(prep.rows[0].bundleVerification, "invalid"); assert.equal(prep.rows[0].cohort, "classification_unknown");
});
test("duplicate or out-of-interval records cannot be silently double counted", t => {
  const f = fixture(t); f.save("work-inventory-v2.json", [...f.inventory, ...f.inventory]);
  assert.throws(() => observeReliability(f.input), /Duplicate/);
  f.save("work-inventory-v2.json", f.inventory);
  assert.throws(() => observeReliability({ ...f.input, windowStart: "2026-10-25T02:00:00Z" }), /outside frozen/);
});
test("action evidence binds the original parent and exact lane child identity", t => {
  const f = fixture(t), packet = { scanId: "scan1:reject_observation", parentScanId: "scan1", afterActionCapture: { activationStatus: "completed" }, refusalRegistration: { status: "unconfirmed" } };
  const bytes = JSON.stringify(packet), file = path.join(f.run, "reject.json"); writeFileSync(file, bytes);
  const expected = { sha256: hash(bytes), sizeBytes: Buffer.byteLength(bytes) }, uri = "s3://test/scan1/reject.json";
  const inventory = f.inventory as unknown as { retained: { hashes: Record<string, unknown>; pointers: Record<string, unknown> }[] }[];
  inventory[0]!.retained[0]!.hashes.postRefusalPacketUri = expected; inventory[0]!.retained[0]!.pointers.postRefusalPacketUri = uri;
  f.save("work-inventory-v2.json", inventory);
  const receipts = JSON.parse(readFileSync(path.join(f.run, "evidence-retrieval-receipts.json"), "utf8"));
  receipts.push({ scanId: "scan1", kind: "postRefusalPacketUri", eventIndex: 0, uri, verified: true, localPath: file, expected });
  f.save("evidence-retrieval-receipts.json", receipts); observeReliability(f.input);
  const prep = JSON.parse(readFileSync(path.join(f.out, "reliability-pass-a.json"), "utf8"));
  assert.equal(prep.rows[0].actions.reject.packet, "verified"); assert.equal(prep.rows[0].actions.reject.click, "completed");
  const bad = JSON.stringify({ ...packet, scanId: "scan1:accept_observation" }); writeFileSync(file, bad);
  const badExpected = { sha256: hash(bad), sizeBytes: Buffer.byteLength(bad) };
  inventory[0]!.retained[0]!.hashes.postRefusalPacketUri = badExpected; receipts[1].expected = badExpected;
  f.save("work-inventory-v2.json", inventory); f.save("evidence-retrieval-receipts.json", receipts);
  observeReliability({ ...f.input, out: path.join(f.base, "bad-lane") });
  assert.equal(JSON.parse(readFileSync(path.join(f.base, "bad-lane/reliability-pass-a.json"), "utf8")).rows[0].actions.reject.packet, "invalid");
});
test("symlink source escape is rejected and not read as evidence", t => {
  const f = fixture(t), outside = path.join(f.base, "outside.json"); writeFileSync(outside, readFileSync(f.file));
  rmSync(f.file); symlinkSync(outside, f.file); observeReliability(f.input);
  const prep = JSON.parse(readFileSync(path.join(f.out, "reliability-pass-a.json"), "utf8"));
  assert.equal(prep.rows[0].bundleVerification, "invalid");
});
test("product phase requires the independent primary seal and detects source drift", async t => {
  const f = fixture(t); observeReliability(f.input);
  await assert.rejects(scoreReliability({ out: f.out, primarySeal: path.join(f.run, "missing") }));
  assert.equal(existsSync(path.join(f.out, "reliability-per-scan.json")), false);
  writeFileSync(f.file, "{}");
  await assert.rejects(scoreReliability({ out: f.out, primarySeal: f.primarySeal }), /Source changed/);
});
test("unavailable product snapshots remain not checked and manual validation never counts as scheduled", async t => {
  const f = fixture(t); observeReliability(f.input); await scoreReliability({ out: f.out, primarySeal: f.primarySeal });
  const result = JSON.parse(readFileSync(path.join(f.out, "reliability-scorecard.json"), "utf8"));
  assert.equal(result.scheduledInvocationsAddedByTool, 0); assert.equal(result.summary.population.ordinaryReportable, 0);
  assert.equal(result.summary.population.projectionVerification.unavailable, 1); assert.equal(result.summary.precision, null);
  assert.equal(result.comparison.status, "baseline_only");
  await assert.rejects(scoreReliability({ out: f.out, primarySeal: f.primarySeal }), /already saved/);
});
