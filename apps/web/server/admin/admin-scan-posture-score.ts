import { californiaPrivacyReviewSchema } from "@certscore/contracts";
import { gpcResponseAssessmentSchema } from "@certscore/contracts";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { deriveCaliforniaGpcResponsePolicy } from "../../lib/scans/california-gpc-response-policy";
import { deriveGppPropagationPolicy, GPP_PROPAGATION_FINDING_ID } from "../../lib/scans/gpp-propagation-policy";
import { readAfterRejectScoringAssessment, AFTER_REJECT_SCORING_POLICY } from "../../lib/scans/after-reject-scoring-contract";
import { deriveGdprEprivacyDeductionBreakdown } from "../../lib/scans/regulatory-coverage-score";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import { isReadableScanReportProjectionReady, type ScanReportProjectionReadiness } from "../scans/scan-report-projection-contract";

type ScoreSnapshot=ScanReportProjectionReadiness & {admin_canonical_score_input?:unknown};
export type AdminScoringEntityCounts={gpc:number|null;reject:number|null;gpp:number|null};

function publishedInput(scanId:string,snapshot:ScoreSnapshot|null|undefined,noGo:boolean) {
  if(noGo || !isReadableScanReportProjectionReady(snapshot))return null;
  const raw=snapshot?.admin_canonical_score_input;
  if(!raw || typeof raw!=="object" || Array.isArray(raw))return null;
  const input=raw as Record<string,unknown>;
  return input.scanId===scanId && input.projectionScanId===scanId && Array.isArray(input.checklistRows) && Array.isArray(input.unifiedFindings)
    ? input as Record<string,unknown>&{checklistRows:GdprEprivacyCoverageChecklistItem[];unifiedFindings:UnifiedFindingDisplayPacket[]}:null;
}

/** Read the published assessment and findings with the same scorer as reports
 * and APIs. No report hydration, evidence inference or publication on list reads. */
export function projectAdminCaliforniaScore(scanId:string, snapshot:ScoreSnapshot|null|undefined, noGo:boolean) {
  const unavailable={score:null,policyVersion:null};
  const input=publishedInput(scanId,snapshot,noGo);
  if(!input)return unavailable;
  const parsed=californiaPrivacyReviewSchema.safeParse(input.assessment);
  if(!parsed.success || parsed.data.scanId!==scanId)return unavailable;
  try {
    const score=deriveCaliforniaRegulatoryScore({assessment:parsed.data,
      checklistRows:input.checklistRows as GdprEprivacyCoverageChecklistItem[],
      unifiedFindings:input.unifiedFindings as UnifiedFindingDisplayPacket[]});
    return {score:score.score,policyVersion:score.policyVersion};
  } catch {return unavailable;}
}

/** Count canonical entities qualifying for the applied deduction, not request
 * volume, cookie count, all vendor presence or an inverse of the point schedule. */
export function projectAdminScoringEntityCounts(scanId:string,snapshot:ScoreSnapshot|null|undefined,noGo:boolean):AdminScoringEntityCounts {
  const counts:AdminScoringEntityCounts={gpc:null,reject:null,gpp:null};
  const input=publishedInput(scanId,snapshot,noGo);
  if(!input)return counts;
  try {
    const gpc=gpcResponseAssessmentSchema.safeParse(input.gpcAssessment);
    if(gpc.success && gpc.data.contractVersion==="certscore.gpc-response-assessment.v3" && gpc.data.observation.scanId===scanId) {
      const policy=deriveCaliforniaGpcResponsePolicy(gpc.data);
      if(policy.scoreEffect==="deduction") {
        const assessment=californiaPrivacyReviewSchema.safeParse(input.assessment);
        const score=assessment.success && assessment.data.scanId===scanId ? deriveCaliforniaRegulatoryScore({assessment:assessment.data,
          checklistRows:input.checklistRows,unifiedFindings:input.unifiedFindings}):null;
        if(score?.score!==null && score?.deductions.some(row=>row.findingId==="gpc_response")) {
          const ids=new Set(policy.recipientIds??[]);
          counts.gpc=(ids.size>0 || policy.reasonCode==="verified_gpc_choice_contradiction")?ids.size:null;
        }
      } else if(gpc.data.observation.status==="complete")counts.gpc=0;
    }
  } catch { /* Unverifiable pass evidence remains unavailable. */ }
  try {
    const gpc=gpcResponseAssessmentSchema.safeParse(input.gpcAssessment);
    if(gpc.success && gpc.data.contractVersion==="certscore.gpc-response-assessment.v3" && gpc.data.observation.scanId===scanId &&
      gpc.data.observation.requests.gppPropagation) {
      const policy=deriveGppPropagationPolicy(gpc.data);
      if(policy.scoreEffect==="deduction") {
        const assessment=californiaPrivacyReviewSchema.safeParse(input.assessment);
        const score=assessment.success && assessment.data.scanId===scanId ? deriveCaliforniaRegulatoryScore({assessment:assessment.data,
          checklistRows:input.checklistRows,unifiedFindings:input.unifiedFindings}):null;
        if(score?.score!==null && score?.deductions.some(row=>row.findingId===GPP_PROPAGATION_FINDING_ID &&
          row.policyKey===policy.policyKey && row.points===policy.deductionPoints)) counts.gpp=new Set(policy.recipients.map(row=>row.entityId)).size;
      } else if(gpc.data.observation.status==="complete" &&
        gpc.data.observation.sourceSha256===gpc.data.comparison.gpcArtifact?.sha256 &&
        gpc.data.observation.positiveEvidence?.representativeDocument) counts.gpp=0;
    }
  } catch { /* Missing or unverifiable propagation evidence remains unavailable. */ }
  try {
    const row=input.checklistRows.find(row=>row.id==="post_reject_tracking_reduction");
    const retained=row?.criticalEvidence?.retainedEvidence;
    const assessment=readAfterRejectScoringAssessment(retained?.afterRejectScoringAssessment);
    if(assessment?.policyVersion===AFTER_REJECT_SCORING_POLICY && assessment.sourcePacketSha256 &&
      assessment.sourcePacketSha256===input.rejectSourceHash &&
      (retained?.sourcePacketSha256===undefined || retained.sourcePacketSha256===input.rejectSourceHash) &&
      !assessment.reasons.includes("source_proof_incomplete")) {
      const deducted=deriveGdprEprivacyDeductionBreakdown(input.checklistRows).some(family=>family.family==="post_refusal_enforcement" && family.deductionPoints>0);
      if(deducted && assessment.deductionPoints>0) {
        const ids=new Set(assessment.entityEvidence?.entities.map(entity=>entity.entityId)??[]);
        counts.reject=(ids.size>0 || assessment.reasons.includes("verified_contradiction"))?ids.size:null;
      } else if(assessment.deductionPoints===0)counts.reject=0;
    }
  } catch { /* Missing/limited Reject evidence must not become a zero. */ }
  return counts;
}
