import { z } from "zod";
import { buildChecklistConcernTopFindings, selectCanonicalHighPriorityFindings } from "./checklist-concern-top-findings";
import type { CertScoreFinding } from "./finding-registry";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

export const sitePriorityFindingSchema = z.object({
  id: z.string(), rank: z.number(), title: z.string(), summary: z.string(),
  status: z.enum(["Potential gap", "Partial concern", "Not confirmed", "Observed"]),
  evidence: z.array(z.string()), evidenceJson: z.record(z.unknown()),
  correctionSteps: z.array(z.string()),
  pages: z.array(z.object({ id: z.string(), url: z.string(), homepage: z.boolean() })),
});
export type SitePriorityFinding = z.infer<typeof sitePriorityFindingSchema>;
export type PriorityPage = { id: string; url: string; homepage: boolean; findingIds: string[] };

/** Presentation of canonical checklist findings only; never promote inventory labels. */
export function buildSitePriorityReview(rows: GdprEprivacyCoverageChecklistItem[], pages: PriorityPage[], executive: CertScoreFinding[] = []): SitePriorityFinding[] {
  return selectCanonicalHighPriorityFindings([...buildChecklistConcernTopFindings(rows), ...executive]).map((finding, index) => {
    const policy = finding.evidenceDetails?.policyEvidenceDetails;
    const rowId = policy?.rowId;
    const grouped = Array.isArray(policy?.groupedRuntimeSignals) ? policy.groupedRuntimeSignals : [];
    const rowIds = [String(rowId ?? finding.id), ...grouped.flatMap(item => item && typeof item === "object" && "id" in item && typeof item.id === "string" ? [item.id] : [])];
    const evidenceRows = rows.filter(item => rowIds.includes(item.id));
    const affected = pages.filter(page => page.findingIds.some(id => rowIds.includes(id)));
    return {
      id: finding.id, rank: index + 1, title: finding.label,
      summary: finding.shortSummary,
      status: policy?.regulatoryConcernKind === "partial_rating" || finding.id === "acceptance_signal_contradicts_action" ? "Partial concern" : "Potential gap",
      evidence: finding.evidencePreview,
      evidenceJson: { findingId: finding.id, evidenceRefs: finding.evidenceRefs, criticalEvidence: evidenceRows.map(row => ({ rowId: row.id, ...row.criticalEvidence })), pages: affected },
      correctionSteps: [finding.remediation],
      pages: affected.map(({ id, url, homepage }) => ({ id, url, homepage })),
    };
  });
}
