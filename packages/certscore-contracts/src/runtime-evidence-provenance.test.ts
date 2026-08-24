import assert from "node:assert/strict";
import test from "node:test";
import { cookieEventSchema, policySurfaceObservationSchema } from "./index.js";

test("cookie evidence retains typed purpose, necessity, confidence, and reason codes", () => {
  const parsed = cookieEventSchema.parse({
    eventId: "cookie_1",
    eventType: "cookie",
    timestampMs: 12,
    sourceScanner: "pre_consent_runtime",
    scenario: "baseline_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    url: "https://example.test/",
    evidenceRefs: [],
    confidence: 0.98,
    directVsInferred: "direct",
    cookieName: "_gcl_au",
    cookiePurpose: "advertising",
    cookieEssentiality: "non_essential",
    cookieEssentialityConfidence: 0.98,
    cookieEssentialityReasonCodes: ["canonical_cookie_kb:advertising"],
    operation: "browser_snapshot",
    valueRedacted: true,
  });

  assert.equal(parsed.cookiePurpose, "advertising");
  assert.equal(parsed.cookieEssentiality, "non_essential");
  assert.equal(parsed.cookieEssentialityConfidence, 0.98);
  assert.deepEqual(parsed.cookieEssentialityReasonCodes, ["canonical_cookie_kb:advertising"]);
});

test("policy evidence retains retrieval and regional provenance without inferring translation", () => {
  const documentTextSha256 = "a".repeat(64);
  const evidenceTextSha256 = "b".repeat(64);
  const parsed = policySurfaceObservationSchema.parse({
    observationId: "policy_1",
    surfaceType: "privacy_policy",
    url: "https://example.test/datenschutz",
    status: "fetched",
    confidence: 0.95,
    directVsInferred: "direct",
    retrievedAt: "2026-08-01T20:00:00.000Z",
    effectiveDate: "1 July 2026",
    directlyLinkedFromScannedPage: true,
    translationApplied: false,
    documentRole: "policy_document",
    documentRoleReasonCodes: ["evidence_bound_substantive_policy_document"],
    governingPolicySelection: {
      contractVersion: "governing_policy_selection.v1",
      state: "primary",
      rank: 1,
      score: 97,
      reasonCodes: ["highest_ranked_eligible_governing_policy"],
    },
    retainedPolicySections: [{
      sourceUrl: "https://example.test/datenschutz",
      heading: "Speicherdauer",
      textExcerpt: "Personenbezogene Daten werden nur so lange gespeichert, wie dies für den jeweiligen Zweck erforderlich ist.",
      extractionMethod: "html_heading_hierarchy",
      sourceOffsetBasis: "sanitized_html",
      documentTextSha256,
      evidenceTextSha256,
      charStart: 120,
      charEnd: 225,
      quality: "strong",
    }],
    retainedArticle13SectionEvidence: [{
      coverageArea: "data_retention",
      selectedPolicySectionHeading: "Speicherdauer",
      selectedPolicySectionExcerpt: "Personenbezogene Daten werden nur so lange gespeichert, wie dies für den jeweiligen Zweck erforderlich ist.",
      selectedPolicySectionUrl: "https://example.test/datenschutz",
      sectionExtractionMethod: "html_heading_hierarchy",
      sourceOffsetBasis: "sanitized_html",
      sourceDocumentTextSha256: documentTextSha256,
      evidenceTextSha256,
      sourceCharStart: 120,
      sourceCharEnd: 225,
      selectedEvidenceStrength: "strong",
      signalObserved: "observed",
    }],
    gdprTransparencyTopicCoverageDiagnostics: [{
      contractVersion: "gdpr_transparency_topic_coverage_diagnostic.v1",
      topic: "data_retention",
      evaluationState: "observed",
      coverageState: "complete",
      evidenceSectionSha256: evidenceTextSha256,
      sourceDocumentSha256: documentTextSha256,
      sectionExtractionMethod: "html_heading_hierarchy",
      reasonCodes: ["row_specific_disclosure_observed", "evidence_hash_binding_verified"],
    }],
  });

  assert.equal(parsed.retrievedAt, "2026-08-01T20:00:00.000Z");
  assert.equal(parsed.effectiveDate, "1 July 2026");
  assert.equal(parsed.directlyLinkedFromScannedPage, true);
  assert.equal(parsed.translationApplied, false);
  assert.deepEqual(parsed.documentRoleReasonCodes, ["evidence_bound_substantive_policy_document"]);
  assert.equal(parsed.governingPolicySelection?.state, "primary");
  assert.equal(parsed.retainedPolicySections[0]?.extractionMethod, "html_heading_hierarchy");
  assert.equal(parsed.retainedPolicySections[0]?.sourceOffsetBasis, "sanitized_html");
  assert.equal(parsed.retainedPolicySections[0]?.documentTextSha256, documentTextSha256);
  assert.equal(parsed.retainedArticle13SectionEvidence[0]?.sectionExtractionMethod, "html_heading_hierarchy");
  assert.equal(parsed.retainedArticle13SectionEvidence[0]?.sourceOffsetBasis, "sanitized_html");
  assert.equal(parsed.retainedArticle13SectionEvidence[0]?.evidenceTextSha256, evidenceTextSha256);
  assert.equal(parsed.gdprTransparencyTopicCoverageDiagnostics?.[0]?.evaluationState, "observed");
  assert.equal(parsed.gdprTransparencyTopicCoverageDiagnostics?.[0]?.sourceDocumentSha256, documentTextSha256);
});
