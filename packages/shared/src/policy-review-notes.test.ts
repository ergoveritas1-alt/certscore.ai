import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStandardPolicyReviewNote,
  normalizePolicyReviewNote,
  resolvePolicyReviewVerdict,
  resolvePolicyReviewNote
} from "./policy-review-notes";

test("buildStandardPolicyReviewNote returns the canonical session replay note", () => {
  assert.equal(
    buildStandardPolicyReviewNote({
      reason: "session_replay_without_disclosure_detected",
      reviewVerdict: "needs_followup"
    }),
    "Technical evidence suggests a session replay vendor or similar replay tooling is likely present, but the record does not clearly establish that the behavior is undisclosed in the site's privacy disclosures. This finding is best marked inconclusive pending direct policy-text verification."
  );
});

test("buildStandardPolicyReviewNote maps confirmed verdicts to confirmed wording", () => {
  assert.equal(
    buildStandardPolicyReviewNote({
      pageType: "privacy_policy",
      reason: "missing_dsar_high_exposure",
      reviewVerdict: "confirmed"
    }),
    "Technical evidence suggests the policy may lack a clearly identified DSAR mechanism, but the record does not clearly establish that no access, deletion, or privacy-request path is available. This finding is best marked confirmed pending direct policy-text verification."
  );
});

test("buildStandardPolicyReviewNote returns the canonical DSAR note", () => {
  assert.equal(
    buildStandardPolicyReviewNote({
      pageType: "privacy_policy",
      reason: "no_dsar_mechanism",
      reviewVerdict: "needs_followup"
    }),
    "Technical evidence suggests the policy may lack a clearly identified DSAR or privacy-request mechanism, but the record does not clearly establish that no DSAR or privacy-request path is available. This finding is best marked inconclusive pending direct policy-text verification."
  );
});

test("buildStandardPolicyReviewNote returns the canonical alias session replay note", () => {
  assert.equal(
    buildStandardPolicyReviewNote({
      pageType: "privacy_policy",
      reason: "session_replay_detected_without_disclosure",
      reviewVerdict: "needs_followup"
    }),
    "Technical evidence suggests a session replay vendor or similar replay tooling is likely present, but the record does not clearly establish that the behavior is undisclosed in the site's privacy disclosures. This finding is best marked inconclusive pending direct policy-text verification."
  );
});

test("buildStandardPolicyReviewNote supports heuristic clarity risk reasons", () => {
  assert.equal(
    buildStandardPolicyReviewNote({
      pageType: "terms_of_service",
      reason: "clarity_risk_68",
      reviewVerdict: "needs_followup"
    }),
    "Technical evidence suggests the page was assigned an elevated policy clarity-risk score. This finding is best marked inconclusive pending direct policy-text verification."
  );
});

test("resolvePolicyReviewVerdict downgrades substantive confirmed findings on non-privacy pages", () => {
  assert.deepEqual(
    resolvePolicyReviewVerdict({
      pageType: "terms_of_service",
      reason: "missing_dsar_high_exposure",
      reviewVerdict: "confirmed"
    }),
    {
      reviewVerdict: "needs_followup",
      verdictOverriddenByScopeGuardrail: true
    }
  );
});

test("resolvePolicyReviewVerdict preserves confirmed findings on privacy policy pages", () => {
  assert.deepEqual(
    resolvePolicyReviewVerdict({
      pageType: "privacy_policy",
      reason: "missing_dsar_high_exposure",
      reviewVerdict: "confirmed"
    }),
    {
      reviewVerdict: "confirmed",
      verdictOverriddenByScopeGuardrail: false
    }
  );
});

test("resolvePolicyReviewVerdict preserves extraction-quality findings on non-privacy pages", () => {
  assert.deepEqual(
    resolvePolicyReviewVerdict({
      pageType: "terms_of_service",
      reason: "low_confidence_critical_fields",
      reviewVerdict: "confirmed"
    }),
    {
      reviewVerdict: "confirmed",
      verdictOverriddenByScopeGuardrail: false
    }
  );
});

test("resolvePolicyReviewNote prefers normalized custom text when provided", () => {
  assert.deepEqual(
    resolvePolicyReviewNote({
      pageType: "privacy_policy",
      reason: "missing_dsar_high_exposure",
      reviewVerdict: "needs_followup",
      reviewerNotes: "  Custom    note.  "
    }),
    {
      reviewerNotes: "Custom note.",
      reviewVerdict: "needs_followup",
      standardNote:
        "Technical evidence suggests the policy may lack a clearly identified DSAR mechanism, but the record does not clearly establish that no access, deletion, or privacy-request path is available. This finding is best marked inconclusive pending direct policy-text verification.",
      verdictOverriddenByScopeGuardrail: false
    }
  );
});

test("normalizePolicyReviewNote collapses whitespace-only notes to null", () => {
  assert.equal(normalizePolicyReviewNote("   \n\t  "), null);
});
