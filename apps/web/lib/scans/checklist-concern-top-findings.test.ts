import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChecklistConcernTopFindings,
  mergeCanonicalHighPriorityFindings
} from "./checklist-concern-top-findings";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { CertScoreFinding } from "./finding-registry";

const pipeline = {
  concernPolicyKey: "test.concern",
  projectionStage: "coverage_policy" as const,
  wc01NormalizedConcernKey: "test_concern",
  ws01EvidenceRole: "retained_test_evidence"
};

function row(input: Partial<GdprEprivacyCoverageChecklistItem> & Pick<GdprEprivacyCoverageChecklistItem, "id" | "label" | "status">) {
  return {
    assessmentStatus: input.status === "Gap observed" ? "gap_observed" : "review_signal",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline,
      projectedFindings: [],
      retainedEvidence: {},
      statusBasis: input.note ?? input.label
    },
    evidenceRefs: [],
    evidenceState: input.status === "Gap observed" ? "observed" : "not_confirmed",
    explanation: input.note ?? input.label,
    note: input.note ?? input.label,
    tone: "review",
    ...input
  } as GdprEprivacyCoverageChecklistItem;
}

test("canonical checklist concerns include every potential gap and partial concern", () => {
  const findings = buildChecklistConcernTopFindings([
    row({
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [],
        pipeline,
        projectedFindings: [{ id: "analytics_cookie_pre_consent", label: "Analytics cookies before consent" }],
        retainedEvidence: {},
        statusBasis: "A classified non-essential cookie was retained before consent."
      },
      id: "pre_consent_cookies_storage",
      label: "Non-essential pre-consent cookies/storage",
      note: "A classified non-essential cookie was retained before consent.",
      status: "Gap observed"
    }),
    row({
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [],
        pipeline,
        projectedFindings: [],
        retainedEvidence: { trackerPriority: "high" },
        statusBasis: "High-priority advertising inventory was retained without promotion-grade tracking proof."
      },
      id: "pre_consent_third_party_tracking",
      label: "Pre-consent non-essential tracking",
      status: "Not confirmed"
    }),
    row({
      assessmentStatus: "coverage_limitation",
      evidenceState: "not_testable",
      id: "legal_basis_disclosure_observed",
      label: "Legal basis disclosure",
      status: "Not testable"
    })
  ]);

  assert.deepEqual(findings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",
    "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking"
  ]);
  assert.equal(findings[0]?.label, "Non-essential pre-consent cookies/storage");
  assert.equal(findings[1]?.label, "Pre-consent non-essential tracking");
});

test("canonical high-priority merge keeps checklist concerns and suppresses equivalent executive duplicates", () => {
  const checklistFinding = {
    id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",
    label: "Non-essential pre-consent cookies/storage"
  } as unknown as CertScoreFinding;
  const executiveFinding = {
    id: "pre_consent_tracking_detected",
    label: "Tracking started before consent"
  } as unknown as CertScoreFinding;

  assert.deepEqual(
    mergeCanonicalHighPriorityFindings({
      checklistFindings: [checklistFinding],
      executiveFindings: [
        executiveFinding,
        { id: "unrelated_executive_finding", label: "Unrelated concern" } as unknown as CertScoreFinding
      ]
    }).map((finding) => finding.id),
    [checklistFinding.id, executiveFinding.id, "unrelated_executive_finding"]
  );
});

test("canonical high-priority merge prefers the checklist tracking concern over its executive duplicate", () => {
  const checklistFinding = {
    evidenceDetails: { policyEvidenceDetails: { rowId: "pre_consent_third_party_tracking" } },
    id: "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking",
    label: "Pre-consent non-essential tracking"
  } as unknown as CertScoreFinding;
  const executiveFinding = {
    id: "pre_consent_tracking_detected",
    label: "Tracking started before consent"
  } as unknown as CertScoreFinding;

  assert.deepEqual(
    mergeCanonicalHighPriorityFindings({
      checklistFindings: [checklistFinding],
      executiveFindings: [executiveFinding]
    }).map((finding) => finding.id),
    [checklistFinding.id]
  );
});
