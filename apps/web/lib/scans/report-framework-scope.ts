import type { ReportReviewFocus } from "@certscore/api-contracts";
import { isRegulatoryFindingRelevant } from "./regulatory-review-catalog";
import { isGdprTransparencyReportRowId } from "./gdpr-transparency-report-contract";
import { resolveReportReviewFocus } from "./report-review-focus";
import {evidenceSectionCounts,evidenceSectionRecap,evidenceHeaderStatus} from "./detailed-evidence-presentation";
import {reportStatusLabel} from "./report-status-presentation";

/** Presentation scope over already-projected evidence. Never changes source
 * assessments, finding eligibility, capture, dual posture scores or workpapers. */
export function reportSectionInFocus(section: string, focus: ReportReviewFocus = "gdpr_eprivacy"): boolean {
  if (section === "gpc" || section === "privacy") return focus === "ccpa_cpra";
  if (section === "gdpr-transparency") return focus === "gdpr_eprivacy";
  return true;
}

export function reportRowInFocus(id: string, focus: ReportReviewFocus): boolean {
  // These rows are shared observed connection facts. The catalog's EU-only
  // transport legal context still scopes narrative findings independently.
  if (["transport_security_https_delivery", "transport_security_tls_certificate", "transport_security_http_redirect", "transport_security_mixed_content", "transport_security_form_transport"].includes(id)) return true;
  if (isGdprTransparencyReportRowId(id)) return reportSectionInFocus("gdpr-transparency", focus);
  return isRegulatoryFindingRelevant(id, focus) &&
    isRegulatoryFindingRelevant(`regulatory_gap__gdpr_eprivacy__${id}`, focus);
}

export function reportPresentationFocus(input: object): ReportReviewFocus {
  const report=input as Record<string,unknown>,scan=(report.scan??{}) as Record<string,unknown>;
  return resolveReportReviewFocus(report.reviewFocus,scan.originCode??scan.scanFrom??scan.scanFromValue);
}

/** Copy only presentation containers; leave the caller's canonical model intact. */
export function scopeReportPresentation<T extends object>(input: T): T {
  const source = input as Record<string, unknown>;
  const focus = reportPresentationFocus(input);
  const output: Record<string, unknown> = { ...source, reviewFocus: focus };
  if (!reportSectionInFocus("gpc", focus)) { delete output.gpcResponse; delete output.gpcLaneStatus; }
  if (!reportSectionInFocus("privacy", focus)) { delete output.privacyAuditEvidence; delete output.californiaPrivacyReview; }
  if (!reportSectionInFocus("gdpr-transparency", focus) && Array.isArray(source.gdprTransparencyRows)) output.gdprTransparencyRows = [];
  for (const field of ["findings", "consentRows", "relatedRows", "trackingExternalRows", "preConsentRuntimeRows", "transportRows"] as const) {
    if (Array.isArray(source[field])) {
      const kept=source[field].filter((row: { id?: string }) => !row.id || reportRowInFocus(row.id, focus));
      output[field]=kept.length===source[field].length?source[field]:kept;
    }
  }
  const details = source.detailedEvidence as { sections?: Array<{ id: string; rows?: Array<{ id: string; status?: string; displayStatus?: string }> }> } | undefined;
  if (details?.sections) output.detailedEvidence = { ...details, sections: details.sections
    .filter(section => reportSectionInFocus(section.id, focus))
    .map(section => {
      if(!section.rows)return section;
      const rows=section.rows.filter(row=>reportRowInFocus(row.id,focus));
      if(rows.length===section.rows.length)return section;
      const statuses=rows.map(row=>({status:reportStatusLabel(row.displayStatus??"")==="Manual check"?"Manual check":row.status??"",
        ...(reportStatusLabel(row.displayStatus??"")==="Review"&&row.status==="Observed"?{priority:"high" as const}:{})}));
      return {...section,rows,counts:evidenceSectionCounts(statuses),recap:evidenceSectionRecap(statuses),displayStatus:evidenceHeaderStatus(statuses)?.label??null};
    }) };
  return output as T;
}
