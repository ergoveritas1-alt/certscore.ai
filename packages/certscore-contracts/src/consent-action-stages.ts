import type { PostAcceptReportProjection } from "./post-accept-observation";
import type { PostRefusalReportProjection } from "./post-refusal-observation";
import { consentActionOutcome } from "./notification-acknowledgment";
export const CONSENT_ACTION_STAGE_KEYS = ["providerAttributed","controlResolved","clickCompleted","observationCompleted","categoryScopeVerified","decisionVerified"] as const;
export type ConsentActionStageKey = typeof CONSENT_ACTION_STAGE_KEYS[number];
export type ConsentActionStages = {
  policyVersion:"consent_action_stages.v1"; provider:string|null; outcome:ReturnType<typeof consentActionOutcome>;
  measures:Record<ConsentActionStageKey,boolean|null>; diagnosticReasons:string[];
  categoryCheck:"supported"|"no_optional_categories"|"unsupported"|"unknown";
  passiveSignals?:{documentMatchesAction:boolean|null;eventRead:boolean;groupsUpdated:number;consentApplied:number;receiptRequests:number;responses2xx:number;responsesMissing:number;truncated:boolean};
};
/** Diagnostic/benchmark projection only, from a validated source-hash projection.
 * A missing provider is unverified, never proof that a site has no CMP.
 * Unknowns stay in the total and have their own count; no denominator exclusions. */
export function assessConsentActionStages(p:PostAcceptReportProjection|PostRefusalReportProjection):ConsentActionStages {
  const source=/^[a-f0-9]{64}$/.test(p.packetSha256??"");
  const unknown:ConsentActionStages={policyVersion:"consent_action_stages.v1",provider:null,outcome:"unknown",measures:{providerAttributed:null,controlResolved:null,clickCompleted:null,observationCompleted:null,categoryScopeVerified:null,decisionVerified:null},diagnosticReasons:[],categoryCheck:"unknown"};
  if(!source)return unknown;
  const provider=p.actionControlProof?.cmpId??null;
  const reasons=p.confirmationDiagnostics?.reasons??[];
  const group=p.decisionEvidence?.oneTrustGroupEvidence??p.terminalDecisionEvidence?.evidence.oneTrustGroupEvidence;
  return {policyVersion:"consent_action_stages.v1",provider,outcome:consentActionOutcome(p),
    measures:{providerAttributed:provider?true:null,controlResolved:p.actionControlProof?true:p.resolver?.found??null,
      clickCompleted:p.execution?.clickCompleted??null,observationCompleted:p.execution?.observationCompleted??null,
      categoryScopeVerified:group?true:null,decisionVerified:p.execution?.consentConfirmed??null},
    ...(p.passiveCmpDiagnostics?{passiveSignals:{
      documentMatchesAction:p.actionControlProof?.frameIdentitySha256?p.passiveCmpDiagnostics.documentSha256===p.actionControlProof.frameIdentitySha256:null,
      eventRead:p.passiveCmpDiagnostics.eventRead==="read",groupsUpdated:p.passiveCmpDiagnostics.events.filter(e=>e.name==="OneTrustGroupsUpdated").length,
      consentApplied:p.passiveCmpDiagnostics.events.filter(e=>e.name==="OTConsentApplied").length,
      receiptRequests:p.passiveCmpDiagnostics.network.length,responses2xx:p.passiveCmpDiagnostics.network.filter(n=>n.status!==undefined&&n.status>=200&&n.status<300).length,
      responsesMissing:p.passiveCmpDiagnostics.network.filter(n=>n.status===undefined).length,truncated:p.passiveCmpDiagnostics.eventsTruncated||p.passiveCmpDiagnostics.networkTruncated}}:{}),
    diagnosticReasons:[...reasons],
    categoryCheck:reasons.includes("category_no_optional")?"no_optional_categories":(reasons.includes("category_applicability_verified")||reasons.includes("category_exclusion_unneeded"))?"supported":reasons.some(r=>r.startsWith("category_"))?"unsupported":"unknown"};
}
