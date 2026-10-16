import { californiaPrivacyReviewFindingIds, californiaPrivacyReviewCopy } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { SitePriorityFinding } from "./full-site-priority-review";

/** Consume policy-eligible persisted unified outputs, never lane labels or workpaper evidence. */
export function projectCaliforniaRegulatoryPriorities(findings: UnifiedFindingDisplayPacket[]): Omit<SitePriorityFinding, "pages" | "rank">[] {
  const eligible = findings.filter(finding => finding.presentationDecision.status === "surface" && finding.surfacingDecision?.reportable &&
    finding.concernContext?.promotionEligibilities.includes("eligible") &&
    finding.concernContext?.externalSurfacingEligibilities.includes("eligible"));
  const result: Omit<SitePriorityFinding, "pages" | "rank">[] = [];
  for (const finding of eligible) {
    if (finding.details?.family !== "california_privacy_review" || !californiaPrivacyReviewFindingIds(finding.details.projection).includes(finding.unifiedFindingId)) continue;
    const projection = finding.details.projection;
    const copy = californiaPrivacyReviewCopy(finding.unifiedFindingId);
    result.push({ id: finding.unifiedFindingId, title: copy.title, summary: copy.description,
      status: "Partial concern", evidence: [
        ...projection.controls.map(row => `${row.label}: ${row.destinationStatus}${row.httpStatus ? ` ${row.httpStatus}` : ""}`),
        ...(projection.optOutObservation?.evidence.requests ?? []).map(row => `${row.vendor} (${row.hostname}): HTTP ${row.httpStatus}, ${row.msAfterConfirmation} ms after recorded opt-out`),
      ],
      evidenceJson: { findingId: finding.unifiedFindingId, californiaPrivacyReview: projection },
      correctionSteps: [copy.action] });
  }
  return result;
}
