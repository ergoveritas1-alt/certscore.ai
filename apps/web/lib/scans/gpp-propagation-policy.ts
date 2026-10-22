import {gpcResponseAssessmentSchema} from "@certscore/contracts";
export const GPP_PROPAGATION_POLICY_VERSION="california-gpp-propagation.v1" as const;
export const GPP_PROPAGATION_POLICY_KEY="california.gpp_propagation.inconsistent" as const;
export const GPP_PROPAGATION_FINDING_ID="gpp_propagation_inconsistency" as const;
export const GPP_PROPAGATION_POINTS=5 as const;

/** Separate signaling-risk family. Does not establish sale/sharing, ignore
 * declared restrictions, or add recipients to the choice-enforcement family. */
export function deriveGppPropagationPolicy(value:unknown) {
 const parsed=gpcResponseAssessmentSchema.safeParse(value);
 const a=parsed.success && parsed.data.contractVersion==="certscore.gpc-response-assessment.v3"?parsed.data:null;
 const o=a?.observation;
 const verified=Boolean(o && o.status!=="unavailable" && o.scanId && o.sourceSha256 && o.sessionSha256 && o.documentUrlSha256 &&
  o.sourceSha256===a?.comparison.gpcArtifact?.sha256 && o.delivery.httpHeaderRetained && o.delivery.mainNavigatorReadbackRetained &&
  o.positiveEvidence?.representativeDocument);
 const rows=verified?o!.requests.gppPropagation?.rows??[]:[];
 return {policyVersion:GPP_PROPAGATION_POLICY_VERSION,policyKey:GPP_PROPAGATION_POLICY_KEY,
  deductionPoints:rows.length?GPP_PROPAGATION_POINTS:0,scoreEffect:rows.length?"deduction" as const:"none" as const,
  evidenceIds:rows.map(row=>row.evidenceId),rows,
  recipients:verified?o!.requests.advertisingCollectionRecipients?.rows.filter(row=>rows.some(r=>r.evidenceId===row.evidenceId))??[]:[]};
}
