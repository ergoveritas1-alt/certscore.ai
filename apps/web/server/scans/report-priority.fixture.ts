import type { CanonicalReportExport } from "./report-export";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

/** Owned canonical-output fixture reproducing the retained four-narrative /
 * one-priority shape. No customer receipt or raw payload is checked in. */
export function priorityChecklistRow(id = "post_reject_tracking_reduction", status = "Review signal"): GdprEprivacyCoverageChecklistItem {
  const summary = "A classified non-essential service request was observed after the Reject click; this does not verify consent registration.";
  return { id, label: "Activity after Reject", status, assessmentStatus: status === "Gap observed" ? "gap_observed" : status === "Review signal" ? "review_signal" : "neutral_signal",
    tone: "review", note: summary, explanation: summary, evidenceState: "observed", evidenceRefs: ["owned:post-reject"],
    criticalEvidence: { pipeline: { projectionStage: "coverage_policy", concernPolicyKey: `gdpr_eprivacy_coverage.${id}.review_signal`, wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${id}`, ws01EvidenceRole: "retained_test_evidence" },
      statusBasis: summary, missingOrIncompleteSourceSignals: [], projectedFindings: [],
      retainedEvidence: { reportControlObserved: true, rejectClickVerified: true, rejectInteractionConfirmed: true, postRejectNonEssentialActivityRetained: true, normalizedConcernKey: "post_reject_click_tracking" } },
  } as GdprEprivacyCoverageChecklistItem;
}

export function priorityReportFixture(): CanonicalReportExport {
  const narratives = ["policy_clarity_risk", "post_reject_click_tracking", "accept_reject_outcomes_indistinguishable", "post_accept_consent_dependent_activity"].map(id => ({
    unifiedFindingId: id, title: id, status: "Partial concern", summary: `${id}: retained qualified narrative.`, severity: "medium",
    presentation: { findingName: id, confidenceScore: "0.55", suggestedFix: "Review the recorded evidence." },
    presentationDecision: { status: "surface" }, surfacingDecision: { reportable: true, decisionState: "review", reportLane: "main" }, scoreEffects: [],
  }));
  return { artifactType: "certscore_canonical_report_export", artifactVersion: "canonical-report-export-v8", reviewFocus: "gdpr_eprivacy", reviewFocusLabel: "GDPR/ePrivacy", reviewScope: "Starting page",
    generatedAt: "2026-10-21T23:20:00Z", notice: "Automated technical risk signals for review, not a determination of legal compliance.", limitations: [],
    score: { value: 80, scope: "starting_page" }, californiaScore: { score: 100 },
    scan: { id: "00000000-0000-4000-8000-000000000001", status: "completed", domainHostname: "example.test", requestedUrl: "https://example.test/", createdAt: "2026-10-21T23:18:00Z", completedAt: "2026-10-21T23:19:00Z", scanFrom: "eu_de", pagesScanned: 1 },
    executiveSummary: { posture: "targeted_review_priority", counts: { technicalLimitation: 0 } },
    projection: { unifiedFindings: narratives, checklist: [priorityChecklistRow()], normalizedConcerns: [], topFindingIds: [], scoreAssessmentInput: { scanId: "00000000-0000-4000-8000-000000000001" } },
    consentControlAssessment: null, gpcResponse: null, accessibilityAudit: null, accessibilityEvidence: null, gdprEprivacyReview: { rows: [], reviewSummary: { coverageText: "Starting-page evidence.", priorityReviewText: "Canonical priorities." }, summaryCounts: {} },
    appendix: { evidenceDossier: { cmp: { provider: null, audit: { rows: [] } }, checklistDetails: [] }, cookieAndTrackerInventory: { presentationStatus: "insufficient_evidence", summary: { inventoryMetrics: [], cookieRows: 0, storageRows: 0 }, rows: [] },
      dataCollectionSurfaces: { assessmentStatus: "insufficient_evidence", coverage: null, summary: { totalForms: 0, totalFields: 0 }, forms: [], limitationKeys: [], pageUrl: null }, gdprTransparency: { rows: [], summary: {} } },
  } as unknown as CanonicalReportExport;
}

export function priorityScanRecord(report: CanonicalReportExport): ScanDetailResponse {
  return { scan: { ...report.scan, scanFromValue: report.scan.scanFrom, scanConfigJson: { normalizedUrl: report.scan.requestedUrl } },
    snapshot: { certscore_overall: report.score.value }, runtimeArtifacts: report.consentControlAssessment ? { consentControlAssessment: report.consentControlAssessment } : null,
    domainBenchmark: null, signals: [], validationFindings: [], trackerVendors: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], events: [], pageEvidence: [],
    canonicalReportProjection: { artifactVersion: report.projection.artifactVersion ?? "persisted-canonical-report-projection-v2", checklistRows: report.projection.checklist,
      evidenceIndex: report.projection.evidenceIndex, collectionSurfaceAssessment: null, derivedContext: {}, globalUnifiedFindings: report.projection.unifiedFindings,
      ownerUnifiedFindings: report.projection.unifiedFindings, normalizedConcerns: report.projection.normalizedConcerns ?? [], topFindingIds: report.projection.topFindingIds ?? [],
      legacyScoreAssessmentInput: report.projection.scoreAssessmentInput ?? { scanId: report.scan.id } },
  } as unknown as ScanDetailResponse;
}
