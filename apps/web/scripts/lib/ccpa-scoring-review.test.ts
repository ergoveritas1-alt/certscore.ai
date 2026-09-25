import assert from "node:assert/strict";
import test from "node:test";
import type { ApiV2GpcResponse, PrivacyAuditEvidence } from "@certscore/api-contracts";
import { reviewCcpaScoring } from "./ccpa-scoring-review";

function privacy(): PrivacyAuditEvidence {
  return {
    contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "scan-1",
    documentUrl: "https://example.test/", capturedAt: "2026-09-25T00:00:00.000Z",
    sourceHash: "a".repeat(64), verificationStatus: "verified", scoreEffect: "none",
    passagePolicy: "california_notice_passages.v1",
    controls: [{ kind: "do_not_sell_or_share", label: "Do Not Sell or Share",
      sourceUrl: "https://example.test/", destinationUrl: "https://example.test/choices",
      placement: "footer", evidenceRef: "control:1", retrieval: "not_attempted", interaction: "not_tested" }],
    notices: [{ kind: "privacy_policy", url: "https://example.test/privacy", evidenceRef: "notice:1",
      directlyLinkedFromScannedPage: true, coverage: "complete",
      passages: [{ topic: "sale_sharing", excerpt: "We share information with advertising partners." }] }],
    negativeControlCoverage: "not_verified", collectionPointNoticeAssessment: "not_assessed", truncated: false,
  };
}

function gpc(): ApiV2GpcResponse {
  const delta = { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["vendor:1"],
    baselineOnlyCount: 0, gpcOnlyCount: 0, sharedCount: 1, samplesTruncated: false };
  return {
    contractVersion: "certscore.gpc-response-assessment.v2", status: "no_observable_response",
    findingTitle: "No observable GPC response", summary: "Qualifying activity remained observable.",
    scoreEffect: "none", legalInterpretation: "not_assessed",
    comparison: { comparable: true, protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: { lane: "runtime_evidence", sha256: "b".repeat(64), sizeBytes: 100 },
      gpcArtifact: { lane: "gpc_observation", sha256: "c".repeat(64), sizeBytes: 100 },
      enabledProof: { secGpcHeaderValue: "1", requestsWithSecGpc: 1, requestEventIds: ["request:1"], navigatorGlobalPrivacyControl: true },
      deltas: { cookies: delta, trackers: delta, advertisingOrMeasurementActivity: delta,
        consentOrCmpBehavior: delta, webStorage: delta, advertisingOrMarketingActivity: delta },
      delivery: { status: "verified" }, coverage: { status: "complete", comparedThroughMs: 1000 },
      responseBasis: "no_qualified_reduction", limitationKeys: [] },
    californiaPolicy: { applied: true, deductionPoints: 15 }, evidenceUrl: "https://example.test/evidence",
  };
}

function report() {
  return { artifactType: "certscore_canonical_report_export", artifactVersion: "canonical-report-export-v6",
    generatedAt: "2026-09-25T00:01:00.000Z", scan: { id: "scan-1", status: "completed", scanFrom: "us_ca" },
    privacyAuditEvidence: privacy(), gpcResponse: gpc(),
    projection: { scoreAssessmentInput: { score: 85 } } };
}

test("retained evidence is traceable without a new score, deduction or mutation", () => {
  const input = report(), before = structuredClone(input);
  const result = reviewCcpaScoring(input);
  assert.deepEqual(input, before);
  assert.equal(result.score, null);
  assert.equal(result.productionProjectable, false);
  assert.equal(result.scoreReadiness, "not_ready");
  assert.equal(result.checks.gpc_response.status, "observed");
  assert.deepEqual(result.existingGpcPolicy, { applied: true, deductionPoints: 15 });
  assert.equal(result.checks.sale_share_choice_surface.status, "observed");
  assert.equal(result.checks.notice_evidence.status, "observed");
  assert.deepEqual(result.noticeTopics, ["sale_sharing"]);
  assert.deepEqual(result.checks.notice_evidence.evidenceRefs, ["notice:1"]);
  assert.equal(result.source.privacySourceHash, "a".repeat(64));
  assert.equal(result.source.gpcSourceHash, "c".repeat(64));
  assert.doesNotMatch(JSON.stringify(result), /We share information/);
});

test("missing, malformed and foreign-scan privacy evidence remain limited", () => {
  for (const value of [null, {}, { ...privacy(), scanId: "other-scan" }]) {
    const result = reviewCcpaScoring({ ...report(), privacyAuditEvidence: value, gpcResponse: null });
    assert.equal(result.checks.sale_share_choice_surface.status, "limited");
    assert.equal(result.checks.notice_evidence.status, "limited");
    assert.equal(result.checks.gpc_response.status, "limited");
    assert.equal(result.existingGpcPolicy, null);
    assert.equal(result.source.privacySourceHash, null);
  }
});

test("cookie settings and confirmed cookie refusal cannot satisfy sale/share checks", () => {
  const input = report();
  input.privacyAuditEvidence.controls[0]!.kind = "cookie_settings";
  const result = reviewCcpaScoring({ ...input, postRefusalObservation: { status: "confirmed" } });
  assert.equal(result.checks.sale_share_choice_surface.status, "limited");
  assert.equal(result.checks.sale_share_opt_out_effectiveness.status, "not_assessed");
  input.privacyAuditEvidence.controls[0]!.kind = "your_privacy_choices";
  assert.equal(reviewCcpaScoring(input).checks.sale_share_choice_surface.status, "observed");
});

test("partial, truncated and empty notice passages never imply adequate coverage", () => {
  for (const change of ["partial", "truncated", "empty"] as const) {
    const input = report();
    if (change === "partial") input.privacyAuditEvidence.notices[0]!.coverage = "partial";
    if (change === "truncated") input.privacyAuditEvidence.truncated = true;
    if (change === "empty") input.privacyAuditEvidence.notices[0]!.passages = [];
    assert.equal(reviewCcpaScoring(input).checks.notice_evidence.status, "limited");
  }
});

test("indeterminate and inconsistent GPC evidence cannot become a pass", () => {
  const input = report();
  input.gpcResponse.status = "indeterminate";
  input.gpcResponse.findingTitle = "GPC response";
  input.gpcResponse.comparison.comparable = false;
  input.gpcResponse.comparison.responseBasis = "insufficient_evidence";
  input.gpcResponse.comparison.coverage = { status: "limited", comparedThroughMs: null };
  input.gpcResponse.californiaPolicy = { applied: false, deductionPoints: 0 };
  const result = reviewCcpaScoring(input);
  assert.equal(result.gpcOutcome, "indeterminate");
  assert.equal(result.checks.gpc_response.status, "limited");
  assert.equal(result.existingGpcPolicy?.deductionPoints, 0);
  input.gpcResponse.californiaPolicy = { applied: true, deductionPoints: 15 };
  assert.equal(reviewCcpaScoring(input).existingGpcPolicy, null);
});

test("historical GPC proof stays historical and origin never changes evidence", () => {
  const input = report();
  input.gpcResponse.contractVersion = "certscore.gpc-response-assessment.v1";
  const result = reviewCcpaScoring(input);
  assert.equal(result.source.gpcContractVersion, "certscore.gpc-response-assessment.v1");
  assert.equal(result.checks.gpc_response.status, "limited");
  input.scan.scanFrom = "eu_ie";
  const eu = reviewCcpaScoring(input);
  assert.deepEqual(eu.checks, result.checks);
  assert.deepEqual(eu.existingGpcPolicy, result.existingGpcPolicy);
  assert.equal(eu.source.scanFrom, "eu_ie");
});

test("rejects wrong artifacts, unsupported exports and unfinished scans", () => {
  for (const input of [null, {}, { ...report(), artifactType: "raw_bundle" },
    { ...report(), artifactVersion: "canonical-report-export-v5" },
    { ...report(), scan: { ...report().scan, status: "running" } }]) {
    assert.throws(() => reviewCcpaScoring(input));
  }
});
