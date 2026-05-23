import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateConsentControlLifecycleEvidence,
  getConsentControlLifecycleEvidence
} from "./consent-control-lifecycle";

function baseEvidence(overrides: Record<string, unknown> = {}) {
  return {
    consentControlLifecycleEvidence: {
      privacySettingsControlObserved: false,
      cookiePreferencesLinkObserved: false,
      cmpReopenControlObserved: false,
      withdrawalTextObserved: false,
      footerPreferenceLinkObserved: false,
      preferenceCenterReachableAfterInitialLayer: null,
      initialConsentLayerObserved: true,
      consentDependentTrackingObserved: true,
      pagesChecked: ["https://example.com/"],
      controlsSearched: ["cookie preferences", "privacy settings", "manage consent"],
      footerLinksInspected: ["Privacy Policy -> https://example.com/privacy"],
      coverageStatus: "usable",
      evidenceRefs: ["browser_runtime_consent_control_lifecycle"],
      ...overrides
    }
  };
}

test("projects consent-control lifecycle subtype with usable retained absence evidence", () => {
  const review = evaluateConsentControlLifecycleEvidence(baseEvidence());

  assert.equal(review.disposition, "eligible");
  assert.equal(review.confidence, "strong");
  assert.equal(review.negativeEvidenceFlags.length, 0);
});

test("suppresses when a footer cookie preferences link exists", () => {
  const review = evaluateConsentControlLifecycleEvidence(baseEvidence({
    cookiePreferencesLinkObserved: true,
    footerPreferenceLinkObserved: true,
    observedControls: [{ text: "Cookie Preferences", href: "https://example.com/#cookies", source: "footer_link" }]
  }));

  assert.equal(review.disposition, "suppress");
  assert.ok(review.negativeEvidenceFlags.includes("consent_revisit_control_observed"));
});

test("demotes blocked or shallow coverage", () => {
  const blocked = evaluateConsentControlLifecycleEvidence(baseEvidence({ coverageStatus: "blocked" }));
  assert.equal(blocked.disposition, "audit_only");
  assert.ok(blocked.negativeEvidenceFlags.includes("incomplete_consent_control_lifecycle_coverage"));

  const shallow = evaluateConsentControlLifecycleEvidence(baseEvidence({ footerLinksInspected: [] }));
  assert.equal(shallow.disposition, "audit_only");
  assert.ok(shallow.negativeEvidenceFlags.includes("shallow_consent_control_search_scope"));
});

test("does not project without consent or tracking context", () => {
  const review = evaluateConsentControlLifecycleEvidence(baseEvidence({
    consentDependentTrackingObserved: false,
    initialConsentLayerObserved: false
  }));

  assert.equal(review.disposition, "audit_only");
  assert.ok(review.negativeEvidenceFlags.includes("missing_consent_tracking_context"));
});

test("normalizes nested lifecycle evidence without raw page content", () => {
  const evidence = getConsentControlLifecycleEvidence(baseEvidence());

  assert.deepEqual(evidence?.pagesChecked, ["https://example.com/"]);
  assert.equal(JSON.stringify(evidence).includes("<html"), false);
  assert.equal(JSON.stringify(evidence).includes("Privacy Policy -> https://example.com/privacy"), true);
});
