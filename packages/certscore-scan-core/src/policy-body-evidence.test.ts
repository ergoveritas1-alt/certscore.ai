import assert from "node:assert/strict";
import test from "node:test";
import { classifyPrivacySurface, classifyGdprTransparencyTopics } from "@certscore/contracts";
import { assessGoverningPolicyBodyEvidence, assessPolicyDocumentSubstance, type PolicySurfaceCandidate } from "./scanners/policy-surface-scanner";

function assess(text: string, label = "Privacy Policy") {
  const classification = classifyPrivacySurface({linkText: label, url: "https://example.test/politique-de-confidentialite/"});
  const candidate: PolicySurfaceCandidate = {candidateId: "policy", url: "https://example.test/politique-de-confidentialite/", normalizedUrl: "https://example.test/politique-de-confidentialite/",
    linkText: label, domLocation: "footer", sameOrigin: true, fetchable: true, clickable: true, mayLeadToConsentControls: false, observationOnly: false,
    deterministicSurfaceType: classification.surfaceType, deterministicScore: classification.confidence, deterministicKeywordMatches: [],
    deterministicMatchedLocale: classification.matchedLocale ?? undefined, deterministicMatchStrength: classification.matchStrength,
    deterministicClassifierReasonCodes: classification.reasonCodes, deterministicClassifierProvenance: "privacy_surface_classifier.v1", discoveryMethod: "footer_link"};
  return assessGoverningPolicyBodyEvidence({candidate, documentSubstance: assessPolicyDocumentSubstance({surfaceType: "privacy_policy", text, title: label}),
    documentTextChars: text.length, documentTextCoverageStatus: "complete", evidenceBoundObservedTopicCount: classifyGdprTransparencyTopics({text}).matches.length,
    substantiveDisclosureSignalCount: 0, targetRelationship: "target_controller", text, title: label});
}

test("accent-stripped French policy labels preserve substantive body eligibility", () => {
  const text = ("Politique de confidentialité. Nous traitons vos données personnelles pour répondre à vos demandes et fournir nos services. " +
    "Pourquoi et sur quelle base traitons-nous vos données ? Pour répondre à vos demandes de contact et organiser un rendez-vous. " +
    "Certaines données peuvent être transmises aux sous-traitants suivants : les partenaires de gestion du consentement. " +
    "Vous pouvez adresser une réclamation à la CNIL. Vous disposez du droit d'accès et de rectification de vos données personnelles. ").repeat(6);
  assert.equal(classifyPrivacySurface({linkText: "politique de confidentialite"}).matchStrength, "direct");
  assert.equal(assess(text, "politique de confidentialite").state, "substantive");
});

test("raw application markup cannot become a substantive governing body through embedded privacy keywords", () => {
  const text = '<!DOCTYPE html><html><script>const settings = {privacy: "Privacy policy. We process personal data to provide services and retain personal data for six months."};</script><body id="root"></body></html>'.repeat(6);
  assert.equal(assess(text).state, "insufficient");
  assert.ok(assess(text).reasonCodes.includes("policy_body_code_or_markup"));
});
