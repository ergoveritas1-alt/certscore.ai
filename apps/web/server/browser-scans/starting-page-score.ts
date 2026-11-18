import { createHash } from "node:crypto";
import { consentControlAssessmentSchema, deriveConsentControlAssessment } from "@certscore/contracts";
import { CALIFORNIA_REVIEW_FAMILIES } from "../../../../packages/certscore-contracts/src/california-review-coverage";
import type { BrowserStartingDocument } from "./starting-page";

/** Materialize availability from validated BX01 intake, retaining unknown checks. */
export function deriveBrowserStartingPageScoreAssessment(input: {
  scanId: string;
  browserScanId: string;
  requestedUrl: string;
  completedAt: string;
  document: BrowserStartingDocument;
}) {
  const { scanId, browserScanId, requestedUrl, completedAt, document } = input;
  const { documentId, finalUrl } = document;
  const sourceHash = createHash("sha256").update(JSON.stringify({ scanId, browserScanId, requestedUrl, document })).digest("hex");
  const limitation = "browser_extension_document_only";
  const parent = deriveConsentControlAssessment({
    scan: { scanId, requestedUrl, finalUrl, scanStatus: "completed" },
    document: {
      identityStatus: "matched",
      canonicalDocumentId: documentId,
      observedDocumentIds: [documentId],
      canonicalDocumentToken: documentId,
      observedDocumentTokens: [documentId],
    },
    coverage: { status: "limited", reasonCodes: [limitation] },
    source: { computedAt: completedAt },
  });
  return consentControlAssessmentSchema.parse({
    ...parent,
    californiaPrivacyReview: {
      contractVersion: "certscore.california-privacy-review.v10",
      policyVersion: "california-privacy-review.v10",
      scanId,
      documentUrl: finalUrl,
      capturedAt: completedAt,
      sourceHash,
      verificationStatus: "verified",
      scoreEffect: "none",
      applicability: "not_determined",
      inspection: null,
      choiceSurface: "unknown",
      controls: [],
      controlsTruncated: false,
      optOutEffectiveness: "not_assessed",
      noticeAdequacy: "not_assessed",
      noticeTopics: [],
      noticeEvidenceRefs: [],
      observedScoreBasis: {
        policyVersion: "usable_starting_page_score.v5-browser-extension",
        scanId,
        documentUrl: finalUrl,
        documentToken: documentId,
        sourceHash,
        sourceLane: "browser_extension",
        accessOutcome: "representative_page",
        evidenceRef: "browser_scan_artifacts.page_evidence#documentProof",
      },
      reviewCoverage: {
        contractVersion: "certscore.california-review-coverage.v4",
        postureBasis: "assuming_ccpa_applies",
        runtimeCoverage: "limited",
        policyStatement: "not_identified",
        sourceDocuments: [],
        topics: [],
        families: CALIFORNIA_REVIEW_FAMILIES.map(id => ({
          id, status: "unknown", reason: limitation, evidenceRefs: [], assessmentState: "limited", followUp: "capture",
        })),
        scoreReady: false,
        captureCoverage: { policyTextComplete: false, choiceInventoryComplete: false, collectionInventoryComplete: false },
      },
      collectionNoticeAssessment: {
        contractVersion: "certscore.california-collection-notice-matching.v5",
        sourceBundleSha256: sourceHash,
        inventoryComplete: false,
        points: [],
        limitationKeys: [limitation],
        runtimePurposeAssessment: {
          contractVersion: "certscore.runtime-storage-purpose.v2",
          sourceBundleSha256: sourceHash,
          retainedSources: [],
          items: [],
          inventoryLimited: true,
        },
      },
    },
  });
}
