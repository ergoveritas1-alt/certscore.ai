import { CMS_SECURITY_FINDING_ID, cmsSecurityCopy, cmsSecurityProjectionSchema } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

/** Select only policy-eligible, already unified CMS findings. */
export function projectCmsSecurityPriority(findings: UnifiedFindingDisplayPacket[]) {
  const finding = findings.find(row => row.unifiedFindingId === CMS_SECURITY_FINDING_ID &&
    row.presentationDecision.status !== "suppress" && row.details?.family === "cms_security" &&
    row.concernContext?.promotionEligibilities.includes("eligible") && row.concernContext?.externalSurfacingEligibilities.includes("eligible"));
  if (!finding || finding.details?.family !== "cms_security") return null;
  const parsed = cmsSecurityProjectionSchema.safeParse(finding.details.projection);
  if (!parsed.success || !parsed.data.assessment.matches.length) return null;
  const projection = parsed.data, copy = cmsSecurityCopy(projection);
  return { id: CMS_SECURITY_FINDING_ID, title: copy.title, summary: copy.description,
    severity: copy.severity, status: "Partial concern" as const, ...(copy.severity === "high" ? { priority: "high" as const } : {}),
    evidence: projection.assessment.matches.map(row => `${row.record.id}: ${row.record.title}. ${row.record.qualification} Source: ${row.record.sourceUrl}`),
    evidenceJson: { cmsSecurity: projection }, correctionSteps: [copy.action],
  };
}
