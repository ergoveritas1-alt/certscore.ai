import { siteIntegrityScoreEffectSchema, siteIntegrityScoreDescription } from "./site-integrity-score-policy";
import { z } from "zod";
import { SITE_INTEGRITY_FINDING_ID, SITE_INTEGRITY_COPY, siteIntegrityProjectionSchema } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export const siteIntegrityReportFindingSchema = z.object({
  findingId: z.literal(SITE_INTEGRITY_FINDING_ID), title: z.string(), description: z.string(),
  scoreEffects: z.array(siteIntegrityScoreEffectSchema).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  summary: z.string(), action: z.string(), evidence: siteIntegrityProjectionSchema,
});
export type SiteIntegrityReportFinding = z.infer<typeof siteIntegrityReportFindingSchema>;
export const siteIntegritySiteReportSchema = z.object({
  findings: z.array(siteIntegrityReportFindingSchema),
  coverage: z.array(z.object({ pageId: z.string(), url: z.string(), homepage: z.boolean(),
    status: z.enum(["captured", "limited", "unavailable"]), sourceHash: z.string().optional(), retainedLinkCount: z.number().int().nonnegative().optional(),
  })),
});
export type SiteIntegritySiteReport = z.infer<typeof siteIntegritySiteReportSchema>;

export function getSiteIntegrityPageFindings(findings: SiteIntegrityReportFinding[]) {
  return [...new Map(findings.map(finding => [finding.evidence.contractVersion === "certscore.site-integrity-projection.v2"
    ? finding.evidence.pageId : `${finding.evidence.scanId}:homepage`, finding])).values()];
}

export function getSiteIntegrityLinkOccurrences(finding: SiteIntegrityReportFinding) {
  return [...new Map(finding.evidence.observation.links.map(link => [link.evidenceRef, link])).values()];
}

/** Count retained link occurrences once per page; destination identity is not retained. */
export function summarizeSiteIntegrityLinks(report: SiteIntegritySiteReport) {
  const findings = getSiteIntegrityPageFindings(report.findings);
  const verifiedZero = report.coverage.length > 0 && report.coverage.every(page => page.status === "captured" && page.retainedLinkCount === 0);
  return {
    count: findings.length ? findings.reduce((sum, finding) => sum + getSiteIntegrityLinkOccurrences(finding).length, 0) : verifiedZero ? 0 : null,
    pages: verifiedZero ? report.coverage.length : findings.length,
    lowerBound: findings.some(finding => finding.evidence.observation.truncated) || report.coverage.some(page => page.status !== "captured"),
  };
}

/** Group only already policy-eligible findings; preserve separate page provenance. */
export function projectSiteIntegritySitePriority(report: SiteIntegritySiteReport) {
  const findings = getSiteIntegrityPageFindings(report.findings);
  const first = findings[0];
  if (!first) return null;
  const pages = findings.flatMap(finding => {
    const projection = finding.evidence;
    const page = report.coverage.find(page => projection.contractVersion === "certscore.site-integrity-projection.v2" ? page.pageId === projection.pageId : page.homepage);
    return page ? [{ id: page.pageId, url: page.url, homepage: page.homepage }] : [];
  });
  const counts = summarizeSiteIntegrityLinks(report);
  const summary = `${counts.lowerBound ? "At least " : ""}${counts.count} hidden outbound link occurrences were retained across ${pages.length} ${pages.length === 1 ? "page" : "pages"}, concealed using off-screen positioning or zero-size styling. Review whether these links were intentionally added.`;
  return { id: first.findingId, title: first.title, summary, status: "Partial concern" as const,
    ...(findings.some(finding => finding.severity === "high") ? { priority: "high" as const } : {}),
    evidence: [siteIntegrityEvidenceDescription(findings), siteIntegrityScoreDescription(findings.flatMap(finding => finding.scoreEffects ?? []))],
    evidenceJson: { siteIntegrity: report }, correctionSteps: [first.action], pages,
  };
}

/** Select an already-projected finding; never interpret raw observations here. */
export function selectSiteIntegrityFinding(findings: UnifiedFindingDisplayPacket[]): SiteIntegrityReportFinding | null {
  const finding = findings.find(row => row.unifiedFindingId === SITE_INTEGRITY_FINDING_ID &&
    row.presentationDecision.status !== "suppress" && row.details?.family === "site_integrity" &&
    row.concernContext?.promotionEligibilities.includes("eligible") &&
    row.concernContext?.externalSurfacingEligibilities.includes("eligible"));
  if (!finding || finding.details?.family !== "site_integrity") return null;
  const evidence = siteIntegrityProjectionSchema.safeParse(finding.details.projection);
  if (!evidence.success) return null;
  return { findingId: SITE_INTEGRITY_FINDING_ID, severity: finding.severity, title: finding.title, description: finding.summary,
    scoreEffects: (finding.scoreEffects ?? []).flatMap(effect => { const parsed = siteIntegrityScoreEffectSchema.safeParse(effect); return parsed.success ? [parsed.data] : []; }),
    summary: SITE_INTEGRITY_COPY.summary, action: SITE_INTEGRITY_COPY.action, evidence: evidence.data };
}

/** A policy-eligible, already unified review finding. No regulatory or score inference. */
export function projectSiteIntegrityPriority(findings: UnifiedFindingDisplayPacket[]) {
  const finding = selectSiteIntegrityFinding(findings);
  if (!finding) return null;
  return {
    id: finding.findingId, title: finding.title, summary: finding.description,
    status: "Partial concern" as const,
    ...(finding.severity === "high" ? { priority: "high" as const } : {}),
    evidence: [siteIntegrityEvidenceDescription([finding]), siteIntegrityScoreDescription(finding.scoreEffects ?? [])],
    evidenceJson: { siteIntegrity: finding.evidence },
    correctionSteps: [finding.action],
  };
}

function siteIntegrityEvidenceDescription(findings: SiteIntegrityReportFinding[]) {
  const links = getSiteIntegrityPageFindings(findings).flatMap(getSiteIntegrityLinkOccurrences);
  const domains = new Map<string, number>();
  for (const link of links) domains.set(link.destinationDomain, (domains.get(link.destinationDomain) ?? 0) + 1);
  const leading = [...domains].sort((a, b) => b[1] - a[1])[0];
  return `${links.length} concealed link occurrences point to ${domains.size} external ${domains.size === 1 ? "domain" : "domains"}.${leading ? ` ${leading[1]} point to ${leading[0]}.` : ""}`;
}

/** Preserve verified capture coverage independently of whether it produced a finding. */
export function projectStartingPageSiteIntegrityReport(value: unknown, findings: UnifiedFindingDisplayPacket[]): SiteIntegritySiteReport | undefined {
  const parsed = siteIntegrityProjectionSchema.safeParse(value);
  if (!parsed.success || parsed.data.contractVersion !== "certscore.site-integrity-projection.v1") return undefined;
  const projection = parsed.data;
  const finding = selectSiteIntegrityFinding(findings);
  return { findings: finding ? [finding] : [], coverage: [{
    pageId: projection.scanId, url: projection.observation.documentUrl, homepage: true,
    status: projection.observation.truncated ? "limited" : "captured",
    sourceHash: projection.sourceHash, retainedLinkCount: projection.observation.links.length,
  }] };
}
