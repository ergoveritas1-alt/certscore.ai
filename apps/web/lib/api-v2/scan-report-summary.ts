import { collectionSurfaceAssessmentSchema, postAcceptReportProjectionSchema } from "@certscore/contracts";
import { scanFormsSummarySchema, scanScoreExplanationSchema } from "@certscore/api-contracts";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "../../server/scans/persisted-canonical-report-projection";
import { deriveCanonicalOverallScoreExplanationForReport, CANONICAL_OVERALL_SCORE_VERSION } from "../../server/scans/canonical-overall-score";
import { projectPostAcceptForms } from "../scans/post-accept-form-projection";
import { isAfterActionReportEligible, retainedConsentAssessment } from "../scans/after-action-report-eligibility";
import { buildChecklistConcernTopFindings } from "../scans/checklist-concern-top-findings";
import { projectScanReportNoGo } from "../scans/scan-report-disposition";

/** Summarizes canonical persisted outputs only; never recovers missing observations or findings. */
export function projectScanFormsSummary(scan: ScanDetailResponse) {
  if (scan.scan.status !== "completed" || projectScanReportNoGo(scan)) return null;
  const canonical = getPersistedCanonicalReportProjection(scan);
  if (!canonical) return null;
  const parsedAssessment = collectionSurfaceAssessmentSchema.safeParse(canonical.collectionSurfaceAssessment);
  const assessment = parsedAssessment.success && parsedAssessment.data.scanId === scan.scan.id ? parsedAssessment.data : null;
  const preConsentCapture = !assessment || assessment.assessmentStatus === "not_testable" ? "unavailable"
    : assessment.assessmentStatus === "limited" ? "limited" : "complete";
  const preConsentObserved = preConsentCapture === "unavailable" ? null : assessment!.forms.length;
  const runtime = scan.runtimeArtifacts;
  const packet = postAcceptReportProjectionSchema.safeParse(runtime?.postAcceptEvidenceProjection ?? runtime?.post_accept_evidence_projection);
  const afterAccept = projectPostAcceptForms(scan);
  const retained = isAfterActionReportEligible(retainedConsentAssessment(scan), "accept") && packet.success &&
    Boolean(packet.data.formSnapshotCapture || packet.data.formCapture);
  const afterAcceptObserved = retained ? afterAccept.rows.length : null;
  if (preConsentObserved === null && afterAcceptObserved === null) return null;
  return scanFormsSummarySchema.parse({ contractVersion: "certscore.forms-summary.v1",
    scope: "starting_page_reportable_observations", totalObserved: (preConsentObserved ?? 0) + (afterAcceptObserved ?? 0),
    preConsentObserved, afterAcceptObserved, preConsentCapture,
    afterAcceptCapture: !retained ? "unavailable" : afterAccept.limited ? "limited" : "retained" });
}

export function projectScanScoreExplanation(scan: ScanDetailResponse, score: number | null) {
  if (score === null || scan.scan.status !== "completed" || projectScanReportNoGo(scan) ||
    scan.snapshot?.score_version !== CANONICAL_OVERALL_SCORE_VERSION) return null;
  const canonical = getPersistedCanonicalReportProjection(scan);
  if (!canonical) return null;
  const explanation = deriveCanonicalOverallScoreExplanationForReport({ scanRecord: scan,
    checklistRows: canonical.checklistRows, unifiedFindings: canonical.globalUnifiedFindings });
  // Never reinterpret a historical score with a different current policy.
  if (!explanation || explanation.score !== score) return null;
  const checklistFindings = buildChecklistConcernTopFindings(canonical.checklistRows);
  const parsed = scanScoreExplanationSchema.safeParse({ ...explanation, contractVersion: "certscore.score-explanation.v1",
    scope: "starting_page_canonical_score", deductions: explanation.deductions.map(family => ({ ...family,
      rules: family.rules.map(rule => ({ ...rule, findingIds: [
        ...checklistFindings.filter(finding => finding.id === `regulatory_gap__gdpr_eprivacy__${rule.ruleId}`).map(finding => finding.id),
        ...canonical.ownerUnifiedFindings.filter(finding => finding.unifiedFindingId === rule.ruleId ||
          (rule.ruleId === "post_reject_tracking_reduction" && rule.decisionVerification === "unconfirmed" && finding.unifiedFindingId === "post_reject_click_tracking"))
          .map(finding => finding.unifiedFindingId),
      ].slice(0, 4) })),
    })) });
  return parsed.success ? parsed.data : null;
}
