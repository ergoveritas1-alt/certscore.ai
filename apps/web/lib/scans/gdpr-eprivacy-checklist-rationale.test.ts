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

test("pre-consent storage rationale includes the retained first-observed time", () => {
  const rationale = deriveGdprEprivacyCoverageChecklistRowRationale({
    assessmentStatus: "gap_observed",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "pre_consent_cookies_storage",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "storage.preconsent",
        ws01EvidenceRole: "runtime_evidence"
      },
      projectedFindings: [],
      retainedEvidence: {
        firstPreconsentCookieOrStorageObservedMs: 2630,
        preConsentStorageAssessment: {
          classifiedNonEssentialCount: 7,
          provenWriteCount: 0
        },
        preConsentStorageAssessmentStatus: "classified_nonessential_observed"
      },
      statusBasis: "Seven non-essential storage records were retained before consent."
    },
    evidenceRefs: [],
    evidenceState: "observed",
    explanation: "Non-essential pre-consent cookies/storage were observed.",
    id: "pre_consent_cookies_storage",
    label: "Non-essential pre-consent cookies/storage",
    note: "",
    status: "Gap observed",
    tone: "warning"
  });

  assert.match(rationale, /7 non-essential cookie or browser-storage items were observed before consent/i);
  assert.match(rationale, /First observed at 2\.63s after scan start/i);
  assert.doesNotMatch(rationale, /First-seen times reflect the pre-consent check/i);
});

test("not-observed tracking rationale distinguishes broader third-party embeds", () => {
  const row = gapRow("pre_consent_third_party_tracking");
  row.assessmentStatus = "checked";
  row.evidenceState = "not_observed";
  row.status = "Not observed";
  row.label = "Pre-consent non-essential tracking";

  const rationale = deriveGdprEprivacyCoverageChecklistRowRationale(row);
  assert.match(rationale, /tracking-classified threshold/i);
  assert.match(rationale, /third-party requests or embedded services/i);
  assert.match(rationale, /do not by themselves establish tracking/i);
});
