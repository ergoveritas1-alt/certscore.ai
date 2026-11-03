import {cmpAuditAvailabilitySchema,cmpAuditAvailabilityWording,cmpAuditRecordedLimitationSchema,
  type CmpAuditAvailability} from "../../../../packages/certscore-api-contracts/src/cmp-audit-availability";
import type {ConsentControlAssessment} from "@certscore/contracts";

/** Descriptive report metadata only. The caller supplies an already validated
 * assessment and the existing report-gate result. No source bytes are fetched
 * or rehashed, and no control/finding eligibility is changed. */
export function buildCmpAuditAvailability(reason:CmpAuditAvailability["reason"],assessment:ConsentControlAssessment|null,scanId:string):CmpAuditAvailability {
  const bound=assessment?.scan.scanId===scanId && !["assessment_missing","assessment_invalid","scan_mismatch"].includes(reason);
  const sourceAssessmentHash=bound && /^fnv1a-[a-f0-9]{8}$/.test(assessment!.provenance.sourceHash)
    ? assessment!.provenance.sourceHash : null;
  const recorded=new Set(sourceAssessmentHash ? [
    ...assessment!.document.reasonCodes,...assessment!.coverage.reasonCodes,
    ...assessment!.limitations.map(l=>l.code),...Object.values(assessment!.controls).flatMap(c=>c.reasonCodes),
  ] : []);
  const reasonCodes=cmpAuditRecordedLimitationSchema.options.filter(code=>recorded.has(code)).slice(0,8);
  return cmpAuditAvailabilitySchema.parse({contractVersion:"certscore.cmp-audit-availability.v1",reason,
    sourceAssessmentHash,reasonCodes,...cmpAuditAvailabilityWording(reason,reasonCodes),scoreEffect:"none",findingEffect:"none"});
}
