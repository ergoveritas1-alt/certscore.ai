import assert from "node:assert/strict";
import test from "node:test";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import {
  buildGdprEprivacyChecklistPresentation,
  GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION,
  isGdprEprivacyChecklistPresentation,
} from "./gdpr-eprivacy-checklist-presentation";

function makePolicyRow(): GdprEprivacyCoverageChecklistItem {
  return {
    assessmentStatus: "checked",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_transparency.legal_basis.observed",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "gdpr_transparency.legal_basis",
        ws01EvidenceRole: "policy-evidence",
      },
      projectedFindings: [],
      retainedEvidence: {
        article13Signal: {
          disclosureType: "legal_basis",
          evidenceText: "We rely on consent and contract for the processing described here.",
        },
        policySurfaceSummary: {
          retainedPrivacyPolicyTextExcerpt: `${"full retained policy evidence ".repeat(800)}TAIL_MARKER_MUST_STAY_LAZY`,
        },
      },
      statusBasis: "A typed legal-basis disclosure signal was retained.",
    },
    evidenceRefs: ["policy:privacy"],
    evidenceState: "observed",
    explanation: "Whether processing legal-basis language was observed.",
    id: "legal_basis_disclosure_observed",
    label: "Processing legal-basis language",
    note: "A typed disclosure signal was retained.",
    status: "Observed",
    tone: "neutral",
  };
}

test("compact checklist presentation preserves decisions without retained evidence payloads", () => {
  const row = makePolicyRow();
  const presentation = buildGdprEprivacyChecklistPresentation([row]);
  const serialized = JSON.stringify(presentation);

  assert.equal(presentation.artifactVersion, GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION);
  assert.equal(presentation.rows[0]?.id, row.id);
  assert.equal(presentation.rows[0]?.evidenceLabel, "Observed");
  assert.equal(presentation.rows[0]?.assessmentDirection, "positive_signal");
  assert.equal(presentation.rows[0]?.policyReviewCandidate, true);
  assert.ok((presentation.rows[0]?.rationale.length ?? 0) <= 320);
  assert.doesNotMatch(serialized, /TAIL_MARKER_MUST_STAY_LAZY/);
  assert.ok(serialized.length < JSON.stringify(row).length / 4);
  assert.equal(isGdprEprivacyChecklistPresentation(presentation), true);
});

test("compact checklist presentation validator fails closed on malformed rows", () => {
  assert.equal(isGdprEprivacyChecklistPresentation({
    artifactVersion: GDPR_EPRIVACY_CHECKLIST_PRESENTATION_VERSION,
    checklistScore: {},
    reviewSummary: {},
    rows: [{ id: "missing-required-fields" }],
    summaryCounts: {},
  }), false);
});

test("compact checklist presentation rejects split GDPR status and evidence labels", () => {
  const presentation = buildGdprEprivacyChecklistPresentation([makePolicyRow()]);
  assert.equal(isGdprEprivacyChecklistPresentation({
    ...presentation,
    rows: presentation.rows.map((row) => ({
      ...row,
      evidenceLabel: "No match found",
      status: "Not confirmed",
    })),
  }), false);
});

test("compact checklist presentation rejects contradictory GDPR row state", () => {
  const presentation = buildGdprEprivacyChecklistPresentation([makePolicyRow()]);
  assert.equal(isGdprEprivacyChecklistPresentation({
    ...presentation,
    rows: presentation.rows.map((row) => ({
      ...row,
      assessmentDirection: "technical_limitation",
      evidenceState: "not_testable",
    })),
  }), false);
  assert.equal(isGdprEprivacyChecklistPresentation({
    ...presentation,
    rows: [...presentation.rows, presentation.rows[0]],
  }), false);
});
