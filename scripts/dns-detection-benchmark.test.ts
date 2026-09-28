import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBenchmark, evidencePacketSetHashes, type EvidencePacket, type HumanLabel, type PredictionRecord } from "./dns-detection-benchmark.js";

const packets: EvidencePacket[] = [
  { packetId: "a1", siteKey: "a", capture: "complete", evidence: [{ evidenceId: "ea", kind: "anchor", excerpt: "Your Privacy Choices", source: "fixture://a" }] },
  { packetId: "a2", siteKey: "a", capture: "complete", evidence: [{ evidenceId: "ea2", kind: "anchor", excerpt: "Privacy policy", source: "fixture://a" }] },
  { packetId: "b", siteKey: "b", capture: "complete", evidence: [{ evidenceId: "eb", kind: "anchor", excerpt: "Privacy policy", source: "fixture://b" }] },
  { packetId: "c", siteKey: "c", capture: "limited", evidence: [{ evidenceId: "ec", kind: "coverage", excerpt: "truncated", source: "fixture://c" }] },
];
const predictions: PredictionRecord[] = [
  { packetId: "a1", prediction: "positive" }, { packetId: "a2", prediction: "negative" },
  { packetId: "b", prediction: "negative" }, { packetId: "c", prediction: "limited" },
];
const label = (siteKey: string, truth: HumanLabel["truth"], evidenceRefs: string[]): HumanLabel => ({
  siteKey, truth, reviewer: "Synthetic test fixture", evidenceOnlyAttested: true,
  evidencePacketSetSha256: evidencePacketSetHashes(packets)[siteKey]!, evidenceRefs, rationale: "Synthetic unit-test label; not human adjudication",
});

test("scores unique sites and keeps unknown or limited states out of absence labels", () => {
  const result = evaluateBenchmark(packets, predictions, [label("a", "present", ["ea"]), label("b", "absent", ["eb"]), label("c", "unknown", ["ec"])]);
  assert.deepEqual(result.confusion, { truePositive: 1, falsePositive: 0, falseNegative: 0, trueNegative: 1 });
  assert.equal(result.sites, 3);
  assert.equal(result.adjudicatedSites, 2);
  assert.equal(result.unresolvedSites, 1);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
});

test("limited detection on an adjudicated positive counts as a recall miss", () => {
  const single = [packets[3]!];
  const result = evaluateBenchmark(single, [{ packetId: "c", prediction: "limited" }], [{ ...label("c", "present", ["ec"]), evidencePacketSetSha256: evidencePacketSetHashes(single).c! }]);
  assert.equal(result.confusion.falseNegative, 1);
  assert.equal(result.recall, 0);
});

test("unknown detector output on an absent site is an abstention, not a true negative", () => {
  const result = evaluateBenchmark(packets.slice(0, 2), [{ packetId: "a1", prediction: "unknown" }, { packetId: "a2", prediction: "limited" }], [label("a", "absent", ["ea"])]);
  assert.equal(result.confusion.trueNegative, 0);
  assert.equal(result.abstentions.absentSites, 1);
});

test("release gate fails for missing labels, unresolved labels, and insufficient capture coverage", () => {
  const missing = evaluateBenchmark(packets.slice(0, 3), predictions.slice(0, 3), [label("a", "present", ["ea"])]);
  assert.equal(missing.releaseGate.passed, false);
  assert.ok(missing.releaseGate.blockers.some((blocker) => blocker.includes("lack human labels")));
  const unresolved = evaluateBenchmark(packets.slice(0, 3), predictions.slice(0, 3), [label("a", "present", ["ea"]), label("b", "unknown", ["eb"])]);
  assert.equal(unresolved.releaseGate.passed, false);
  assert.ok(unresolved.releaseGate.blockers.some((blocker) => blocker.includes("unresolved")));
  const lowCoverage = evaluateBenchmark(packets, predictions, [label("a", "present", ["ea"]), label("b", "absent", ["eb"]), label("c", "unknown", ["ec"])], 1);
  assert.ok(lowCoverage.releaseGate.blockers.some((blocker) => blocker.includes("capture coverage")));
});

test("release gate blocks low precision or recall even with complete labels and capture", () => {
  const complete = packets.slice(0, 3);
  const labels = [label("a", "present", ["ea"]), label("b", "absent", ["eb"])];
  const lowPrecision = evaluateBenchmark(complete, [
    { packetId: "a1", prediction: "positive" }, { packetId: "a2", prediction: "negative" },
    { packetId: "b", prediction: "positive" },
  ], labels);
  assert.equal(lowPrecision.releaseGate.passed, false);
  assert.ok(lowPrecision.releaseGate.blockers.some((blocker) => blocker.includes("precision")));
  const lowRecall = evaluateBenchmark(complete, [
    { packetId: "a1", prediction: "negative" }, { packetId: "a2", prediction: "negative" },
    { packetId: "b", prediction: "positive" },
  ], labels);
  assert.equal(lowRecall.releaseGate.passed, false);
  assert.ok(lowRecall.releaseGate.blockers.some((blocker) => blocker.includes("recall")));
});

test("rejects label records without evidence-only review attestation", () => {
  const single = [packets[0]!];
  assert.throws(() => evaluateBenchmark(single, [{ packetId: "a1", prediction: "positive" }], [{ ...label("a", "present", ["ea"]), evidencePacketSetSha256: evidencePacketSetHashes(single).a!, evidenceOnlyAttested: false as true }]), /Incomplete evidence-only human label/);
});

test("rejects labels when the evidence packet set changed after review", () => {
  const changed = [{ ...packets[0]!, evidence: [{ ...packets[0]!.evidence[0]!, excerpt: "Changed evidence" }] }];
  assert.throws(() => evaluateBenchmark(changed, [{ packetId: "a1", prediction: "positive" }], [label("a", "present", ["ea"])]), /packet hash mismatch/);
});
