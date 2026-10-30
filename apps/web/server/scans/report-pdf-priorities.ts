import type { CanonicalReportExport } from "./report-export";
import { projectReportPriorityFindings } from "../../lib/scans/report-priority-projection";
import { getReportableGdprEprivacyCoverageItems } from "../../lib/scans/gdpr-eprivacy-reportable-rows";
import { hydrateChecklistPolicyEvidence } from "../../lib/scans/checklist-evidence-index";
import { buildRegulatoryAssessmentHighlights } from "../../lib/scans/regulatory-assessment-highlights";
import type { SitePriorityFinding } from "../../lib/scans/full-site-priority-review";
import { mergeHomepagePriorityFindings } from "../../lib/scans/report-priority-merge";
import { readCaliforniaPrivacyReviewFromConsent } from "@certscore/contracts";

/** Replays the web's projection and focus selection over the exported canonical
 * checklist/packets. Historical exports need no new capture or schema rewrite. */
export function pdfPriorityReview(report: CanonicalReportExport) {
  const rows = report.projection.checklist ?? [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error("Duplicate canonical PDF checklist identity.");
    seen.add(row.id);
  }
  const eligible = getReportableGdprEprivacyCoverageItems(hydrateChecklistPolicyEvidence(rows, report.projection.evidenceIndex ?? undefined), {
    consentControlAssessment: report.consentControlAssessment ?? undefined,
  });
  const homepage = projectReportPriorityFindings(eligible, report.projection.unifiedFindings);
  const url = report.scan.requestedUrl ?? report.consentControlAssessment?.scan.requestedUrl;
  const candidates: Array<SitePriorityFinding | typeof homepage[number]> = report.fullSite
    ? mergeHomepagePriorityFindings(report.fullSite.score?.priorityReview, homepage.map(finding => ({ ...finding, pages: url ? [{ id: report.scan.id, url, homepage: true }] : [] })))
    : homepage;
  const california = readCaliforniaPrivacyReviewFromConsent(report.consentControlAssessment);
  return buildRegulatoryAssessmentHighlights<SitePriorityFinding | typeof homepage[number]>(candidates, report.reviewFocus ?? "gdpr_eprivacy",
    report.fullSite ? { kind: "site", scannedPages: report.scan.pagesScanned ?? null } : { kind: "page" }, {},
    url ? { scanId: report.scan.id, documentUrl: url, sourceHash: california?.sourceHash } : undefined,
    report.californiaScore?.reviewCoverage);
}

/** Identity joins for legacy narrative packets; these never determine eligibility. */
export const PDF_FINDING_ROW_IDS: Record<string, string> = {
  preconsent_tracking: "pre_consent_third_party_tracking", session_replay_observed: "session_replay_fingerprinting_review",
  post_refusal_non_essential_activity: "post_reject_tracking_reduction", post_reject_click_tracking: "post_reject_tracking_reduction",
};
export function pdfPrioritySourceIds(finding: { id: string; evidenceJson: Record<string, unknown> }) {
  const rowId = finding.evidenceJson.checklistItemId;
  return [finding.id, ...(typeof rowId === "string" ? [rowId, ...Object.entries(PDF_FINDING_ROW_IDS).filter(([, row]) => row === rowId).map(([id]) => id)] : [])];
}
