import assert from "node:assert/strict";
import test from "node:test";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";

function gapRow(id: string): GdprEprivacyCoverageChecklistItem {
  return {
    assessmentStatus: "gap_observed",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_transparency_article13_gap",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "gdpr_transparency_article13",
        ws01EvidenceRole: "policy_evidence"
      },
      projectedFindings: [],
      retainedEvidence: {
        article13Signal: {
          disclosureType: id,
          evidenceText: null,
          status: "not_observed_with_sufficient_coverage"
        }
      },
      statusBasis: "Verified complete owned policy did not contain the row-specific disclosure."
    },
    evidenceRefs: [],
    evidenceState: "not_observed",
    explanation: "Row-specific disclosure was not observed.",
    id,
    label: "Transparency disclosure",
    note: "Row-specific disclosure was not observed.",
    status: "Gap observed",
    tone: "warning"
  };
}

test("Article 13 absence rationale does not claim matching policy text", () => {
  const rationale = deriveGdprEprivacyCoverageChecklistRowRationale(
    gapRow("international_transfers_disclosure")
  );
  assert.doesNotMatch(rationale, /included matching/i);
  assert.match(rationale, /did not retain|not observed|did not contain/i);
});
