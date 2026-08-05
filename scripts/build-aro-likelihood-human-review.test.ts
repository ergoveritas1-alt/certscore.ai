import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyReviewBucket,
  selectReviewCohorts,
  validateHumanReview,
  type AroReviewSourceRow,
} from "./build-aro-likelihood-human-review";

function row(scanId: string, domain: string, overrides: Partial<AroReviewSourceRow> = {}): AroReviewSourceRow {
  return {
    scan_id: scanId,
    domain,
    created_at: `2026-08-0${Number(scanId.replace(/\D/g, "")) % 8 || 1}T00:00:00.000Z`,
    completed_at: "2026-08-04T00:00:10.000Z",
    accept_observed: null,
    reject_observed: null,
    options_observed: null,
    consent_evidence_status: "unknown",
    consent_assessment_status: "limited",
    consent_coverage_status: "limited",
    consent_surface_status: "unknown",
    document_identity_status: "matched",
    assessment_source_hash: `hash-${scanId}`,
    assessment_no_go: false,
    accept_reason_codes: ["first_layer_inventory_incomplete"],
    reject_reason_codes: ["first_layer_inventory_incomplete"],
    options_reason_codes: ["first_layer_inventory_incomplete"],
    cmp_vendor_name: null,
    site_language_primary: "en",
    scan_outcome: "completed_partial",
    stop_reason_code: null,
    artifact_uri: `s3://bucket/${scanId}/CanonicalEvidenceBundle.json`,
    artifact_sha256: "a".repeat(64),
    ...overrides,
  };
}

test("review bucket classification keeps failures and completed negatives distinct", () => {
  assert.equal(classifyReviewBucket(row("1", "a.test", { assessment_no_go: true })), "hard_failure");
  assert.equal(classifyReviewBucket(row("2", "b.test", {
    consent_coverage_status: "complete",
    consent_surface_status: "not_observed",
    accept_reason_codes: [], reject_reason_codes: [], options_reason_codes: [],
  })), "completed_negative");
  assert.equal(classifyReviewBucket(row("3", "c.test", { document_identity_status: "unknown" })), "missing_observation_binding");
  assert.equal(classifyReviewBucket(row("4", "d.test", { document_identity_status: "mismatched" })), "redirect_or_document_mismatch");
});

test("cohort selection is deterministic, unique by domain, and holds out calibration domains", () => {
  const rows = Array.from({ length: 120 }, (_, index) => row(String(index + 1), `site-${index + 1}.test`,
    index % 7 === 0 ? { assessment_no_go: true } : {}));
  rows.push(row("duplicate", "www.site-1.test"));
  const first = selectReviewCohorts(rows, { calibration: 29, random: 50, challenge: 20, pilot: 6 }, ["1"]);
  const second = selectReviewCohorts(rows, { calibration: 29, random: 50, challenge: 20, pilot: 6 }, ["1"]);
  assert.deepEqual(first, second);
  assert.equal(first.calibration.length, 29);
  assert.equal(first.randomHoldout.length, 50);
  assert.equal(first.challengeHoldout.length, 20);
  assert.equal(first.pilot.length, 6);
  const calibrationDomains = new Set(first.calibration.map((entry) => entry.domain.replace(/^www\./, "")));
  assert.equal(first.randomHoldout.some((entry) => calibrationDomains.has(entry.domain.replace(/^www\./, ""))), false);
  assert.equal(first.challengeHoldout.some((entry) => calibrationDomains.has(entry.domain.replace(/^www\./, ""))), false);
});

test("human review validation requires both blind evidence and live labels", () => {
  const valid = {
    labels: [{
      scanId: "scan-1",
      reviewer: "Luna",
      reviewRegion: "EU-IR",
      evidenceLabels: { accept: "present", reject: "absent", options: "delayed" },
      liveLabels: { accept: "present", reject: "absent", options: "present" },
    }],
  };
  assert.deepEqual(validateHumanReview(valid), { ok: true, errors: [], completeLabels: 1 });
  const invalid = structuredClone(valid);
  delete (invalid.labels[0] as { liveLabels?: unknown }).liveLabels;
  assert.equal(validateHumanReview(invalid).ok, false);
});
