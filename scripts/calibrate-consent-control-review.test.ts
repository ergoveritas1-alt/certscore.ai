import assert from "node:assert/strict";
import test from "node:test";
import {
  metrics,
  miniShadowPacket,
  parseCsv,
  rawEvidenceRetrievalManifest,
  rootCauseInventory,
  type CalibrationRow,
} from "./calibrate-consent-control-review";

function row(overrides: Partial<CalibrationRow> = {}): CalibrationRow {
  return {
    reviewId: "eu-ir:scan-1",
    scanId: "scan-1",
    website: "https://example.com",
    proposed: { accept: "observed", reject: "unknown", options: "observed" },
    adjudicated: { accept: "observed", reject: "observed", options: "not_observed" },
    override: "Change recommendation",
    documentMatch: "yes",
    notes: "Live Chrome review — EU-IR VPN",
    disposition: "included",
    releaseGateEligible: true,
    releaseGateReasons: [],
    dispositionReasons: [],
    disagreements: ["reject", "options"],
    evidence: {
      artifactPath: "artifacts/public-evidence-corpus-cache/scan-1.json",
      sha256: "abc",
      scanId: "scan-1",
      domain: "example.com",
      completedAt: "2026-07-01T00:00:00.000Z",
      cmpVendor: "Example CMP",
      accessPosture: "clear",
      language: "en",
      noGo: false,
      homepageFetchStatus: "success",
      verifiedPublicSurfacesCount: 1,
      pagesScanned: 1,
      retainedVisualProof: true,
    },
    provenance: {
      labelClass: "human_adjudication_candidate",
      reviewMethod: "live_chrome_incognito_eu_ir_vpn",
      reviewerRole: "product_owner",
      reviewerAttestedLiveObservation: true,
      independentlyReviewed: false,
      evidenceOnlyReview: false,
      sourceWorksheetSha256: "worksheet",
      labelHash: "label",
    },
    ...overrides,
  };
}

test("CSV parser preserves quoted commas and newlines", () => {
  assert.deepEqual(parseCsv('"A","B"\n"one","two, three"\n'), [
    ["A", "B"],
    ["one", "two, three"],
  ]);
});

test("metrics preserve unknown as its own state", () => {
  const result = metrics([
    row(),
    row({
      reviewId: "eu-ir:scan-2",
      scanId: "scan-2",
      proposed: { accept: "unknown", reject: "not_observed", options: "unknown" },
      adjudicated: { accept: "unknown", reject: "not_observed", options: "unknown" },
      disagreements: [],
    }),
  ]);
  assert.equal(result.includedRows, 2);
  assert.equal(result.perField.accept.confusion.unknown.unknown, 1);
  assert.equal(result.perField.reject.confusion.observed.unknown, 1);
  assert.equal(result.exactAroAgreement, 0.5);
});

test("root-cause inventory flags false absence separately", () => {
  const result = rootCauseInventory([
    row({
      proposed: { accept: "not_observed", reject: "unknown", options: "observed" },
      adjudicated: { accept: "observed", reject: "observed", options: "not_observed" },
      disagreements: ["accept", "reject", "options"],
    }),
  ]);
  assert.equal(result.categories.false_absence_critical, 1);
  assert.equal(result.categories.capture_or_projection_miss, 1);
  assert.equal(result.categories.false_positive_or_live_state_drift, 1);
  assert.equal(result.restrictions.displayOnlyFixesAllowed, false);
});

test("raw evidence retrieval prioritizes false absence", () => {
  const result = rawEvidenceRetrievalManifest([
    row({
      proposed: { accept: "not_observed", reject: "unknown", options: "observed" },
      adjudicated: { accept: "observed", reject: "observed", options: "not_observed" },
      disagreements: ["accept", "reject", "options"],
      releaseGateEligible: false,
      releaseGateReasons: ["retained_visual_proof_missing"],
    }),
  ]);
  assert.equal(result.rows, 1);
  assert.equal(result.candidates[0]?.priority, 1);
  assert.ok(result.candidates[0]?.requiredArtifacts.includes("CanonicalEvidenceBundle.json"));
});

test("Mini shadow review fails closed without release-eligible raw evidence", () => {
  const result = miniShadowPacket([
    row({
      releaseGateEligible: false,
      releaseGateReasons: ["retained_visual_proof_missing"],
    }),
  ]);
  assert.equal(result.decision, "blocked_pending_raw_evidence_binding");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.invariants.mayCreateAbsence, false);
});
