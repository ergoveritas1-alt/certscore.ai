import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { POLICY_AUDIT_TOPICS, POLICY_AUDIT_VERSION, sha256, inspectPolicyCapture, verifiedLocalBytes,
  selectPolicyReviews, validatePolicyPassA, comparePolicyTopics, summarizePolicyAudit, policyTopicForReportRow,
  type Receipt, type Preparation, type PolicyPassA } from "./daily-policy-audit";

function fixture(t: TestContext) {
  const root = mkdtempSync(path.join(os.tmpdir(), "certscore-policy-audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const text = "Example Limited controls this website. Contact privacy@example.test. We keep your data for two years.";
  const file = path.join(root, "policy.txt"); writeFileSync(file, text);
  const receipt: Receipt = { scanId: "s1", kind: "policy_surface_text_one.txt", localPath: file, verified: true, expected: { sha256: sha256(text), sizeBytes: Buffer.byteLength(text) } };
  const policy = { observationId: "p1", surfaceType: "privacy_policy", url: "https://example.test/privacy", linkObservationState: "observed", documentFetchState: "fetched",
    documentRole: "policy_document", targetRelationship: "target_controller", documentEvaluationState: "usable",
    documentTextCoverage: { status: "complete", sourceTextChars: text.length, retainedTextChars: text.length },
    contentCoverage: { status: "truncated", limitationKeys: ["policy_section_text_bounded"] },
    artifactRefs: [{ artifactId: "policy_surface_text_one", path: "/tmp/policy_surface_text_one.txt" }] };
  const bundle = { scanId: "s1", url: "https://example.test", policySurfaceObservations: [policy] };
  const check = inspectPolicyCapture({ root, scanId: "s1", site: "example.test", region: "eu_de", status: "completed", bundle, receipts: [receipt] });
  const prep: Preparation = { version: POLICY_AUDIT_VERSION, inputRun: root, invocation: "manual_pilot", checks: [check], selectedScanIds: ["s1"], interpretationVersion: "v1", topicInventory: [...POLICY_AUDIT_TOPICS] };
  const bytes = Buffer.from(JSON.stringify(prep));
  const ref = { documentKey: "p1", sha256: sha256(text), start: 0, end: 70 };
  const passA: PolicyPassA = { version: POLICY_AUDIT_VERSION, preparationSha256: sha256(bytes), reviewerKind: "independent_model_audit", exposureDisclosure: "Fixture source only; outputs have not been exposed.",
    reviews: [{ scanId: "s1", reuse: "new_review", documents: [{ documentKey: "p1", sha256: sha256(text), fullTextRead: true, governing: "yes", ownership: "confirmed_target", supplements: "shown_irrelevant", rationale: "Exact target entity and privacy contact in retained source.", evidence: [ref] }],
      topics: POLICY_AUDIT_TOPICS.map(topic => ({ topic, expected: "no_support_with_sufficient_coverage", rationale: "Reviewed all retained governing text and relevant supplements.", evidence: [] })) }] };
  return { root, file, text, receipt, policy, bundle, check, prep, bytes, ref, passA };
}

test("canonical inventory includes profiling and rejects unknown new rows", () => {
  assert.equal(POLICY_AUDIT_TOPICS.length, 10);
  assert.ok(POLICY_AUDIT_TOPICS.includes("automated_decision_making_or_profiling"));
  assert.equal(policyTopicForReportRow("retention_disclosure_present"), "data_retention");
  assert.throws(() => policyTopicForReportRow("new_disclosure"));
});
test("link-only is discovery, never confirmed proper capture or recall", t => {
  const f = fixture(t); f.bundle.policySurfaceObservations = [{ ...f.policy, documentFetchState: "failed" }];
  const c = inspectPolicyCapture({ root: f.root, scanId: "s1", site: "example.test", region: "eu", status: "completed", bundle: f.bundle, receipts: [] });
  assert.equal(c.observedPolicyLink, true); assert.equal(c.policyFetches, 0); assert.equal(c.metadataUsablePolicyCandidates, 0); assert.equal(c.knownAvailablePolicyRecall, null);
});
test("complete raw text remains distinct from bounded section excerpts", t => {
  const f = fixture(t); assert.equal(f.check.documents[0]!.verification, "verified_local_bytes");
  assert.equal(f.check.documents[0]!.textCoverage, "complete"); assert.equal(f.check.documents[0]!.sectionCoverage, "truncated");
  assert.doesNotThrow(() => validatePolicyPassA(f.passA, f.prep, f.bytes));
});
test("cross-host ownership metadata is not independent ownership proof", t => {
  const f = fixture(t); f.policy.targetRelationship = "service_provider";
  const c = inspectPolicyCapture({ root: f.root, scanId: "s1", site: "example.test", region: "eu", status: "completed", bundle: f.bundle, receipts: [f.receipt] });
  assert.equal(c.metadataUsablePolicyCandidates, 0); assert.ok(c.riskReasons.includes("unverified_governing_scope"));
});
test("excerpt and duplicate receipts cannot substitute for a unique full source", t => {
  const f = fixture(t);
  let c = inspectPolicyCapture({ root: f.root, scanId: "s1", site: "x", region: "eu", status: "completed", bundle: f.bundle, receipts: [f.receipt, f.receipt] });
  assert.equal(c.documents[0]!.verification, "invalid_local_bytes");
  f.policy.artifactRefs[0]!.artifactId = "policy_excerpt_one";
  c = inspectPolicyCapture({ root: f.root, scanId: "s1", site: "x", region: "eu", status: "completed", bundle: f.bundle, receipts: [f.receipt] });
  assert.equal(c.documents[0]!.verification, "no_full_text_reference");
});
test("original bytes, path and size are enforced including symlink escape", t => {
  const f = fixture(t);
  assert.throws(() => verifiedLocalBytes(f.root, { ...f.receipt, expected: { ...f.receipt.expected, sha256: "0".repeat(64) } }, 1000));
  assert.throws(() => verifiedLocalBytes(f.root, { ...f.receipt, expected: { ...f.receipt.expected, sizeBytes: 1 } }, 1000));
  const escape = path.join(f.root, "escape"); symlinkSync(process.execPath, escape);
  assert.throws(() => verifiedLocalBytes(f.root, { ...f.receipt, localPath: escape }, 1000));
});
test("selected reviews are stable, unique sites, bounded and restricted to original deep reviews", t => {
  const f = fixture(t), checks = Array.from({ length: 15 }, (_, i) => ({ ...f.check, scanId: `s${i}`, site: `site${i % 12}`, riskReasons: Array(i % 4).fill("risk") }));
  const ids = checks.slice(0, 11).map(c => c.scanId), a = selectPolicyReviews(checks, ids, "seed"), b = selectPolicyReviews([...checks].reverse(), ids, "seed");
  assert.deepEqual(a.selected, b.selected); assert.equal(a.selected.length, 8); assert.equal(a.selected.filter(s => s.reason === "seeded_random").length, 5);
  assert.ok(a.selected.every(s => ids.includes(s.scanId))); assert.equal(new Set(a.selected.map(s => checks.find(c => c.scanId === s.scanId)!.site)).size, 8);
  assert.equal(selectPolicyReviews(checks, ["s1"], "seed").shortfall, 7);
});
test("every canonical topic, including profiling, must occur exactly once", t => {
  const f = fixture(t); f.passA.reviews[0]!.topics[9] = f.passA.reviews[0]!.topics[0]!;
  assert.throws(() => validatePolicyPassA(f.passA, f.prep, f.bytes), /Missing or duplicate/);
});
for (const limitation of ["ownership", "fulltext", "coverage", "supplements"] as const) test(`absence cannot bypass ${limitation}`, t => {
  const f = fixture(t), doc = f.passA.reviews[0]!.documents[0]!;
  if (limitation === "ownership") doc.ownership = "unresolved";
  if (limitation === "fulltext") doc.fullTextRead = false;
  if (limitation === "coverage") f.check.documents[0]!.textCoverage = "truncated";
  if (limitation === "supplements") doc.supplements = "unresolved";
  assert.throws(() => validatePolicyPassA(f.passA, f.prep, f.bytes), /Absence requires/);
});
test("positive and applicability decisions require governing source passages", t => {
  const f = fixture(t), topic = f.passA.reviews[0]!.topics[0]!; topic.expected = "supported";
  assert.throws(() => validatePolicyPassA(f.passA, f.prep, f.bytes), /Positive topic/);
  topic.evidence = [f.ref]; assert.doesNotThrow(() => validatePolicyPassA(f.passA, f.prep, f.bytes));
  topic.expected = "not_applicable"; topic.evidence = []; assert.throws(() => validatePolicyPassA(f.passA, f.prep, f.bytes), /Applicability/);
});
test("stale preparation, source tampering and out-of-range references fail closed", t => {
  const f = fixture(t); assert.throws(() => validatePolicyPassA(f.passA, f.prep, Buffer.from("other")), /Preparation drift/);
  f.passA.reviews[0]!.documents[0]!.evidence[0]!.end = 999;
  assert.throws(() => validatePolicyPassA(f.passA, f.prep, f.bytes), /outside/);
  f.passA.reviews[0]!.documents[0]!.evidence[0]!.end = 70; writeFileSync(f.file, "changed");
  assert.throws(() => validatePolicyPassA(f.passA, f.prep, f.bytes), /mismatch/);
});
test("missing/unknown rows and conditional applicability never count as agreements", t => {
  const f = fixture(t), topic = f.passA.reviews[0]!.topics[0]!; topic.expected = "supported"; topic.evidence = [f.ref];
  assert.equal(comparePolicyTopics(f.passA, {})[0]!.outcome, "product_row_unavailable");
  assert.equal(comparePolicyTopics(f.passA, { s1: [{ id: "controller_contact_disclosure", status: "Not confirmed" }] })[0]!.outcome, "candidate_missed_disclosure");
  assert.equal(comparePolicyTopics(f.passA, { s1: [{ id: "controller_contact_disclosure", status: "Unknown" }] })[0]!.outcome, "product_status_requires_review");
  topic.expected = "not_applicable";
  assert.equal(comparePolicyTopics(f.passA, { s1: [{ id: "controller_contact_disclosure", status: "Observed" }] })[0]!.outcome, "applicability_review");
});
test("negative agreement is qualified, semantic citations and accuracy remain unmeasured", t => {
  const f = fixture(t), comparisons = comparePolicyTopics(f.passA, { s1: [{ id: "controller_contact_disclosure", status: "Observed" }] });
  assert.equal(comparisons[0]!.outcome, "candidate_unsupported_observation");
  const summary = summarizePolicyAudit(f.prep, f.passA, comparisons);
  assert.equal(summary.precision, null); assert.equal(summary.recall, null); assert.equal(summary.humanAdjudicated, false);
  assert.equal(summary.pilot.manualPilotCountsAsScheduled, false); assert.equal(summary.completion, "reviewed_with_pending_work");
});
test("accounted cases with unresolved source scope are not complete governing-policy reviews", t => {
  const f = fixture(t); f.passA.reviews[0]!.documents[0]!.governing = "unresolved";
  const summary = summarizePolicyAudit(f.prep, f.passA);
  assert.equal(summary.accountedReviewRecords, 1); assert.equal(summary.completedPolicyReviews, 0);
});
