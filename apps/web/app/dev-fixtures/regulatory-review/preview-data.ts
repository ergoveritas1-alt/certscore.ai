import { REGULATORY_REVIEW_TOPICS } from "../../../lib/scans/regulatory-review-catalog";
import type { SitePriorityFinding } from "../../../lib/scans/full-site-priority-review";
import type { CaliforniaPrivacyReview } from "@certscore/contracts";

// Presentation fixtures only: no observation, concern, finding, score or scan is persisted.
const summaries: Record<string, string> = {
  "reviewed-notice-omissions": "A substantive review of the illustrative complete governing notice identified multiple missing privacy disclosures. The finding remains scoped to the reviewed documents.",
  "california-agent-registration": "The illustrative retained California request instructions require an authorized agent to register with the Secretary of State. Review the condition and the available authorization routes for individuals.",
  "california-gpc-choice":"The illustrative canonical finding retains verified GPC receipt with an applicable opt-out remaining off. Review how the recorded choice reaches relevant services.",
  "california-rights-disclosure":"Complete retained English policy inspection found no candidate wording for a core privacy-rights disclosure topic. The California posture assumes CCPA applies; request handling remains untested.",
  "california-opt-out-activity": "Advertising-classified responses were retained after an explicit, recorded sale/sharing opt-out in this illustrative 500 ms window. Legal sale/sharing status requires review.",
  "california-choice": "A complete inspection found no named sale/sharing choice in rendered links and buttons. Applicability and alternative methods still need review.",
  "california-destination": "The retained privacy-choice destination returned HTTP 404 in this illustrative result.",
  "california-collection-notice-link": "The directly linked Notice at Collection returned HTTP 404 in this illustrative result. Notice adequacy at collection points remains unassessed.",
  "california-rights-information-link": "The directly linked State Privacy Rights page returned HTTP 404 in this illustrative result. Other request methods remain unassessed.",
  "post-refusal": "8 non-essential HubSpot and LinkedIn requests were observed 0.3–1.14 seconds after confirmed Reject.",
  "preconsent-storage": "The example assessment retained a classified advertising cookie written before a consent choice.",
  "preconsent-tracking": "The example assessment retained optional advertising requests before a consent choice.",
  "refusal-control": "The example assessment found no first-layer refusal control after a complete structured inspection.",
  "consent-choice": "The example assessment retained a consent-choice concern for review.",
  withdrawal: "The example assessment retained a concern about the route to withdraw an earlier choice.",
  "consent-mechanism": "The example assessment retained a consent-mechanism concern alongside consent-dependent activity.",
  "accept-control": "The example assessment retained a concern about the affirmative consent control.",
  "options-control": "The example assessment retained a concern about access to granular choices.",
  "cookie-notice": "The example assessment retained a concern about the availability of cookie information.",
  "privacy-notice": "Privacy policy not found within the example’s completed discovery scope.",
  embeds: "The example assessment retained third-party embedded content before a consent choice.",
  replay: "The example assessment retained session-replay behavior for review.",
  fingerprinting: "The example assessment retained a device-identification concern for review.",
  "sensitive-tracking": "The example assessment retained a concern about tracking around a sensitive interaction.",
  collection: "The example assessment retained a data-collection concern for review.",
  transport: "The example assessment retained a form that sends information over an unencrypted connection.",
  "privacy-accessibility": "The example assessment retained an accessibility barrier in a consent control.",
  controller: "The example assessment retained a concern about controller/contact information.",
  purposes: "The example assessment retained a processing-purpose disclosure concern.",
  "legal-basis": "The example assessment retained a concern about processing legal-basis language.",
  retention: "The example assessment retained a retention-disclosure concern.",
  recipients: "The example assessment retained a recipient-disclosure concern.",
  rights: "The example assessment retained a privacy-rights disclosure concern.",
  transfers: "The example assessment retained an international-transfer disclosure concern.",
  "obsolete-transfer": "The example assessment retained an obsolete transfer framework presented as current guidance.",
  "cross-border": "The example assessment retained a cross-border endpoint review signal.",
  dpo: "The example assessment retained a concern about an applicable data-protection contact.",
  complaints: "The example assessment retained a concern about supervisory-authority complaint information.",
  profiling: "The example assessment retained a concern about applicable profiling information.",
  "consent-record": "The visitor clicked Accept, but the retained consent record still denied analytics and advertising.",
};
export const REGULATORY_PREVIEW_FINDINGS: SitePriorityFinding[] = REGULATORY_REVIEW_TOPICS.map((topic, index) => ({
  id: topic.findingIds[0]!, rank: index + 1,
  title: topic.id === "post-refusal" ? "HubSpot and LinkedIn activity after Reject" : topic.title,
  summary: summaries[topic.id]!, status: ["post-refusal", "preconsent-storage", "preconsent-tracking", "privacy-notice", "transport", "refusal-control"].includes(topic.id) ? "Potential gap" : "Partial concern",
  evidence: ["Illustrative presentation input. This example is not a retained scan result."],
  evidenceJson: { fixture: true, topicId: topic.id, findingId: topic.findingIds[0] },
  correctionSteps: ["Review the assessed evidence and correct the underlying issue where confirmed."],
  pages: [{ id: "preview-page", url: "https://example.com/", homepage: true }],
}));
export const ACCESSIBILITY_PREVIEW: SitePriorityFinding = {
  id: "accessibility_priority_group", rank: 2, title: "Low text contrast", summary: "Low-contrast text was detected in the illustrative accessibility result.",
  status: "Observed", priority: "high", evidence: ["Illustrative accessibility result."], evidenceJson: { fixture: true, presentationGroup: "accessibility" },
  correctionSteps: ["Increase the affected text contrast and check readability."], pages: [{ id: "preview-page", url: "https://example.com/", homepage: true }],
};
// Deliberately not imported by production selection or rendering. These need new canonical assessments.
export const CALIFORNIA_COVERAGE_GAPS = [
  ["Unequal opt-out choices", "Retain a typed California choice-symmetry assessment; do not borrow a GDPR banner-layout conclusion."],
  ["Excessive verification for opt-out", "Retain the required fields and verified request purpose; avoid submitting real personal information."],
  ["Notice at collection", "Assess the relevant collection surface and applicable notice coverage; an unlocated excerpt is not absence."],
  ["Sale/sharing disclosure contradiction", "Compare a specific retained California promise with legally relevant, directly comparable behavior."],
  ["Retention disclosures", "Assess California-specific notice coverage and applicable retention disclosures."],
  ["Sensitive-information limitation", "Verify qualifying use and applicable right-to-limit obligations; field labels alone are insufficient."],
  ["Privacy-request methods", "Clearly named routes can now be retained from the existing rendered visit. Assess applicable methods and actual submission; a link alone does not establish functionality."],
  ["Privacy-notice accessibility", "Bind an actual barrier to the privacy notice or rights method; general page contrast does not suffice."],
  ["Minor sale/sharing opt-in", "Require reliable, authorized age/applicability evidence; do not infer age from site branding."],
  ["Service-provider restrictions", "Requires relevant contractual evidence that a public website scan generally cannot establish."],
] as const;

// Design-review roadmap only. These mappings do not grant finding eligibility.
export const CALIFORNIA_REUSE_PLAN = [
  ["Privacy-policy availability", "Already shared", "Reuse the supported policy-discovery finding with California notice obligations and California enforcement context."],
  ["Collection surfaces, purposes and retention", "Reuse retained text and surface evidence", "Assess California notice-at-collection coverage, disclosed purposes and retention information. A GDPR disclosure conclusion does not establish a California gap."],
  ["Recipients and privacy rights", "Reuse retained passages and named routes", "Check California categories, sale/sharing disclosures and applicable rights separately. Named request links are positive coverage evidence; submission remains unassessed."],
  ["Consent-choice quality and privacy accessibility", "Reuse geometry and specific barriers", "Bind the evidence to a California privacy choice or notice. Assess equal choices and usable rights methods; keep general accessibility in Other issues."],
  ["Tracking, embeds, replay and fingerprinting", "Reuse observed requests and recipients", "Relate actual data flows to a specific California disclosure or verified sale/sharing opt-out. Their presence, or activity before consent, does not alone establish a CCPA issue."],
  ["Activity after Reject", "Reuse capture machinery, not the decision", "Use the separately authorized sale/sharing observer. A cookie Reject cannot substitute for a confirmed California sale/sharing opt-out."],
  ["Sensitive-context activity", "Reuse transmitted-data evidence cautiously", "Establish the relevant sensitive information, use and applicable limitation right. Site labels and vendor presence are insufficient."],
  ["Transport security", "Keep technical evidence available", "A specific personal-information exposure can support a separate security review; a generic transport warning should not be relabelled as a CCPA breach."],
] as const;

/** Explicitly illustrative child assessment; never imported by production. */
export function californiaPreviewAssessment(topicId: string): CaliforniaPrivacyReview {
  const assessment: CaliforniaPrivacyReview = {
    contractVersion: "certscore.california-privacy-review.v1", policyVersion: "california-privacy-review.v1",
    scanId: "presentation-fixture", documentUrl: "https://example.com/", capturedAt: "2026-10-16T12:00:02.000Z",
    sourceHash: "0".repeat(64), verificationStatus: "verified", scoreEffect: "none", applicability: "not_determined",
    inspection: null, choiceSurface: "unknown", controls: [], controlsTruncated: false, failedNoticeLinks: [],
    optOutEffectiveness: "not_assessed", noticeAdequacy: "not_assessed", noticeTopics: [], noticeEvidenceRefs: [],
  };
  if (topicId === "california-choice") {
    assessment.choiceSurface = "not_observed_in_inspected_scope";
    assessment.inspection = { contractVersion: "certscore.privacy-choice-inspection.v1", documentUrl: assessment.documentUrl,
      capturedAt: assessment.capturedAt, sourceHash: assessment.sourceHash, scope: "rendered_named_links_and_buttons",
      coverage: "complete", namedChoiceCandidateCount: 0, unnamedControlCount: 0, candidateEnumerationTruncated: false,
      uninspectedFrameCount: 0, uninspectedShadowRootCount: 0, supportedDocumentLanguage: true, representativeDocument: true, documentStable: true };
  }
  if (["california-destination", "california-opt-out-activity"].includes(topicId)) {
    assessment.choiceSurface = "observed";
    assessment.controls = [{ label: "Do Not Sell or Share My Personal Information", kind: "do_not_sell_or_share",
      evidenceRef: "illustrative-choice", destinationUrl: "https://example.com/choices",
      destinationStatus: topicId === "california-destination" ? "http_error" : "not_tested",
      ...(topicId === "california-destination" ? { httpStatus: 404 as const } : {}) }];
  }
  if (topicId === "california-opt-out-activity") {
    assessment.optOutEffectiveness = "bounded_observation";
    assessment.optOutObservation = { verificationStatus: "verified", sha256: "0".repeat(64), sizeBytes: 1000,
      evidence: { contractVersion: "certscore.sale-sharing-opt-out-evidence.v1", policyVersion: "bounded_sale_sharing_opt_out.v1",
        scanId: assessment.scanId, targetUrl: assessment.documentUrl, parentDispatchSha256: "0".repeat(64), documentToken: "illustrative-document",
        startedAt: "2026-10-16T12:00:00.000Z", completedAt: "2026-10-16T12:00:01.500Z", confirmedAt: "2026-10-16T12:00:00.500Z",
        status: "complete", provider: "Illustrative provider", recipeVersion: "illustrative-recipe", actionCount: 2, submitted: true,
        registration: "confirmed", before: { sectionId: 8, sale: 2, sharing: 2 }, after: { sectionId: 8, sale: 1, sharing: 1 },
        observationWindowMs: 500, captureComplete: true, truncated: false, limitations: [],
        requests: [{ hostname: "ads.example.com", vendor: "Illustrative advertising service", purpose: "advertising", httpStatus: 204, msAfterConfirmation: 300 }] } };
  }
  if (topicId === "california-collection-notice-link" || topicId === "california-rights-information-link") {
    assessment.failedNoticeLinks = [{
      kind: topicId === "california-collection-notice-link" ? "notice_at_collection" : "california_notice",
      label: topicId === "california-collection-notice-link" ? "Notice at Collection" : "State Privacy Rights",
      destinationUrl: "https://example.com/notice", evidenceRef: "illustrative-policy-surface", httpStatus: 404,
    }];
  }
  if (topicId === "california-rights-information-link") {
    assessment.inspection = { contractVersion: "certscore.privacy-choice-inspection.v1", documentUrl: assessment.documentUrl,
      capturedAt: assessment.capturedAt, sourceHash: assessment.sourceHash, scope: "rendered_named_links_and_buttons",
      coverage: "limited", namedChoiceCandidateCount: 0, unnamedControlCount: 0, candidateEnumerationTruncated: false,
      uninspectedFrameCount: 1, uninspectedShadowRootCount: 0, supportedDocumentLanguage: true,
      representativeDocument: true, documentStable: true,
      rightsMethods: [{ label: "Submit a Privacy Request", destinationUrl: "https://example.com/request", accessibleNameSource: "text" }],
    };
  }
  return assessment;
}
