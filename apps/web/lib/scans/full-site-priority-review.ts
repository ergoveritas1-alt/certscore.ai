import { projectAccessibilityPriorities } from "./accessibility-priority";
import { comparePriorityReviewFindings } from "./priority-review-order";
import { projectFormDestinationPriority } from "./form-destination-report";
import { projectCmsSecurityPriority } from "./cms-security-report";
import { projectSiteIntegrityPriority, projectSiteIntegritySitePriority, type SiteIntegritySiteReport } from "./site-integrity-report";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { z } from "zod";
import { readChecklistRemediation } from "./checklist-remediation";
import { buildChecklistConcernTopFindings, selectCanonicalHighPriorityFindings } from "./checklist-concern-top-findings";
import type { CertScoreFinding } from "./finding-registry";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

export const sitePriorityFindingSchema = z.object({
  priority: z.literal("high").optional(),
  id: z.string(), rank: z.number(), title: z.string(), summary: z.string(),
  status: z.enum(["Potential gap", "Partial concern", "Not confirmed", "Observed"]),
  evidence: z.array(z.string()), evidenceJson: z.record(z.unknown()),
  correctionSteps: z.array(z.string()),
  pages: z.array(z.object({ id: z.string(), url: z.string(), homepage: z.boolean() })),
  observations: z.array(z.object({ id: z.string(), title: z.string(), summary: z.string(), pages: z.array(z.object({ id: z.string(), url: z.string(), homepage: z.boolean() })) })).optional(),
});
export type SitePriorityFinding = z.infer<typeof sitePriorityFindingSchema>;
export type PriorityPage = { id: string; url: string; homepage: boolean; findingIds: string[] };

/** Presentation of canonical checklist and policy-eligible unified findings only; never promote inventory labels. */
export function buildSitePriorityReview(rows: GdprEprivacyCoverageChecklistItem[], pages: PriorityPage[], executive: CertScoreFinding[] = [], unified: UnifiedFindingDisplayPacket[] = [], siteIntegrity?: SiteIntegritySiteReport): SitePriorityFinding[] {
  const priorities: SitePriorityFinding[] = selectCanonicalHighPriorityFindings([...buildChecklistConcernTopFindings(rows), ...executive.filter(finding => finding.section !== "Accessibility"), ...projectAccessibilityPriorities(unified)]).map((finding, index) => {
    const policy = finding.evidenceDetails?.policyEvidenceDetails;
    const rowId = policy?.rowId;
    const grouped = Array.isArray(policy?.groupedRuntimeSignals) ? policy.groupedRuntimeSignals : [];
    const rowIds = [String(rowId ?? finding.id), ...grouped.flatMap(item => item && typeof item === "object" && "id" in item && typeof item.id === "string" ? [item.id] : [])];
    const evidenceRows = rows.filter(item => rowIds.includes(item.id));
    const axeRows = finding.evidenceDetails?.accessibilityEvidence?.axeEvidence;
    const accessibilityPages = finding.section === "Accessibility" && Array.isArray(axeRows)
      ? axeRows.flatMap(row => row && typeof row === "object" && "pageUrl" in row && typeof row.pageUrl === "string" ? [row.pageUrl] : []) : [];
    const affected = pages.filter(page => page.findingIds.some(id => rowIds.includes(id)) || accessibilityPages.includes(page.url));
    const primary = policy?.primaryRuntimeSignal;
    const components = primary && typeof primary === "object" ? [primary, ...grouped] : [];
    const observations = components.flatMap(component => {
      if (!component || typeof component !== "object") return [];
      const part = component as Record<string, unknown>;
      if (typeof part.id !== "string" || typeof part.label !== "string" || typeof part.shortSummary !== "string") return [];
      return [{ id: part.id, title: part.label, summary: part.shortSummary,
        pages: pages.filter(page => page.findingIds.includes(part.id as string)).map(({ id, url, homepage }) => ({ id, url, homepage })) }];
    });
    const embedSources = evidenceRows.find(row => row.id === "third_party_iframe_pre_consent")?.criticalEvidence.retainedEvidence.embeddedFrameSources;
    const embedCount = Array.isArray(embedSources) ? new Set(embedSources.filter(value => typeof value === "string" && value.length > 0)).size : 0;
    const summary = finding.id === "regulatory_gap__gdpr_eprivacy__third_party_iframe_pre_consent" && embedCount
      ? `At least ${embedCount} distinct third-party ${embedCount === 1 ? "embed was" : "embeds were"} retained before a recorded consent action across ${affected.length} ${affected.length === 1 ? "page" : "pages"}. This establishes pre-consent embedded-service activity, not tracking classification by itself.`
      : finding.shortSummary;
    const correctionSteps = [...new Set(evidenceRows.flatMap(row => readChecklistRemediation(row.criticalEvidence.retainedEvidence?.remediation)?.steps ?? []))];
    return {
      id: finding.id, rank: index + 1, title: finding.label,
      ...(finding.section === "Accessibility" ? { priority: "high" as const } : {}),
      summary,
      status: finding.section === "Accessibility" ? "Observed" : (evidenceRows.length > 0 && !evidenceRows.some(row => row.assessmentStatus === "gap_observed") && evidenceRows.some(row => row.assessmentStatus === "review_signal")) || policy?.regulatoryConcernKind === "partial_rating" || finding.id === "acceptance_signal_contradicts_action" ? "Partial concern" : "Potential gap",
      evidence: finding.evidencePreview,
      evidenceJson: { findingId: finding.id, evidenceRefs: finding.evidenceRefs, ...(finding.section === "Accessibility" ? { evidenceDetails: finding.evidenceDetails } : {}), criticalEvidence: evidenceRows.map(row => ({ rowId: row.id, ...row.criticalEvidence })), pages: affected, observations },
      correctionSteps: correctionSteps.length ? correctionSteps : [finding.remediation],
      ...(observations.length ? { observations } : {}),
      pages: affected.map(({ id, url, homepage }) => ({ id, url, homepage })),
    };
  });
  const formDestination = projectFormDestinationPriority(unified);
  if (formDestination) priorities.unshift({ ...formDestination, rank: 1, pages: pages.filter(page => page.homepage).map(({ id, url, homepage }) => ({ id, url, homepage })) });
  const cms = projectCmsSecurityPriority(unified);
  if (cms) priorities.unshift({ ...cms, rank: 1,
    pages: pages.filter(page => page.homepage).map(({ id, url, homepage }) => ({ id, url, homepage })) });
  const integrity = siteIntegrity ? projectSiteIntegritySitePriority(siteIntegrity) : projectSiteIntegrityPriority(unified);
  if (integrity && !priorities.some(row => row.id === integrity.id)) priorities.push({
    ...integrity, rank: priorities.length + 1,
    pages: "pages" in integrity ? integrity.pages : pages.filter(page => page.homepage).map(({ id, url, homepage }) => ({ id, url, homepage })),
  });
  return priorities.sort(comparePriorityReviewFindings).map((finding, index) => ({ ...finding, rank: index + 1 }));
}
