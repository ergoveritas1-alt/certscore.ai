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

test("review-only tracking rationale uses the projected note without assigning an unverified purpose", () => {
  const row = gapRow("pre_consent_third_party_tracking");
  row.assessmentStatus = "review_signal";
  row.status = "Review signal";
  row.criticalEvidence.statusBasis = "Selected retained pre-consent request/vendor timing evidence; storage evidence is evaluated separately.";
  row.note = "Security/performance vendor activity was observed before a recorded consent choice, including https://example.test/script.js. This preserves the timing evidence without classifying the activity as advertising or retargeting.";
  assert.equal(deriveGdprEprivacyCoverageChecklistRowRationale(row),
    "Security/performance vendor activity was observed before a recorded consent choice. The scan did not classify it as advertising or retargeting.");
  row.note = "3rd party vendor activity with unresolved purpose was observed before a recorded consent choice, including https://example.test/. Review purpose and essentiality before treating it as advertising or retargeting.";
  assert.equal(deriveGdprEprivacyCoverageChecklistRowRationale(row),
    "Third-party activity was observed before a recorded consent choice, but its purpose and essentiality were unresolved.");
  row.note = "No eligible observation retained.";
  assert.equal(deriveGdprEprivacyCoverageChecklistRowRationale(row), row.criticalEvidence.statusBasis);
});

test("review-only refusal copy remains whole and limited to first-layer availability", () => {
  const row = gapRow("reject_all_path_availability");
  row.assessmentStatus = "review_signal";
  row.status = "Review signal";
  row.criticalEvidence.statusBasis = "A first-layer GDPR/ePrivacy cookie consent surface was retained with an accept option and non-essential cookie/purpose text, but no same-layer reject, decline, refuse, or continue-without-accepting option was retained. This is a first-layer availability signal only; CertScore.ai did not run a consent flow.";
  const copy = deriveGdprEprivacyCoverageChecklistRowRationale(row);
  assert.match(copy, /accept option and non-essential cookie\/purpose text, but no same-layer refusal option/);
  assert.match(copy, /first-layer availability only; CertScore.ai did not run a consent flow\./);
  assert.doesNotMatch(copy, /\.\.\.|CertScore\.ai$/);
});

test("review-only preferences copy preserves the specific placement concern without truncation", () => {
  const row = gapRow("options_settings_preferences_control");
  row.assessmentStatus = "review_signal";
  row.status = "Review signal";
  row.criticalEvidence.statusBasis = "A preferences control was retained as an inline text link outside the confirmed accept/reject action cluster. Granular choices appear available, but the control may be less discoverable within the banner copy; verify that it is prominent, keyboard accessible, clearly labelled, and opens purpose-level choices.";
  const copy = deriveGdprEprivacyCoverageChecklistRowRationale(row);
  assert.match(copy, /preferences link was retained outside the confirmed Accept\/Reject action cluster/);
  assert.match(copy, /verify the link's prominence, keyboard access, label, and purpose-level choices\./);
  assert.doesNotMatch(copy, /\.\.\.$/);
});
