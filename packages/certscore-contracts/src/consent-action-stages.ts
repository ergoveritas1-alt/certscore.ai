import type { PostAcceptReportProjection } from "./post-accept-observation";
import type { PostRefusalReportProjection } from "./post-refusal-observation";
import { consentActionOutcome } from "./notification-acknowledgment";
import { terminalConsentDecisionBound } from "./terminal-consent-decision";
export const CONSENT_ACTION_STAGE_KEYS = ["providerAttributed","controlResolved","clickCompleted","observationCompleted","categoryScopeVerified","decisionVerified"] as const;
export type ConsentActionStageKey = typeof CONSENT_ACTION_STAGE_KEYS[number];
export const CONSENT_ACTION_EVIDENCE_STAGE_KEYS = ["consentSurfaceObserved", "controlIdentified", "actionAttempted", "initialChoiceRegistrationSupported", "terminalChoiceStateVerified", "notificationAcknowledged"] as const;
export type ConsentActionEvidenceStages = Record<typeof CONSENT_ACTION_EVIDENCE_STAGE_KEYS[number], boolean | null> & {
  cmpIdentity: "verified" | "unverified" | "unknown";
  registrationStatus: string | null;
  initialDiagnosticReasons: string[] | null;
  terminalDiagnosticReasons: string[] | null;
};
export type ConsentActionStages = {
  policyVersion:"consent_action_stages.v1"; provider:string|null; outcome:ReturnType<typeof consentActionOutcome>;
  measures:Record<ConsentActionStageKey,boolean|null>; diagnosticReasons:string[];
  categoryCheck:"supported"|"no_optional_categories"|"unsupported"|"unknown";
  evidenceStages: ConsentActionEvidenceStages;
  passiveSignals?:{documentMatchesAction:boolean|null;eventRead:boolean;groupsUpdated:number;consentApplied:number;receiptRequests:number;responses2xx:number;responsesMissing:number;truncated:boolean};
};

/** This is an internal evidence inventory, not a new confirmation policy. No
 * current packet represents positively unsupported CMP identity: an unsupported
 * action/receipt must not be reinterpreted as unsupported or absent identity. */
function evidenceStages(p: PostAcceptReportProjection | PostRefusalReportProjection, source: boolean): ConsentActionEvidenceStages {
  const unknown: ConsentActionEvidenceStages = {
    consentSurfaceObserved: null, cmpIdentity: "unknown", controlIdentified: null,
    actionAttempted: null, initialChoiceRegistrationSupported: null,
    terminalChoiceStateVerified: null, notificationAcknowledged: null,
    registrationStatus: null, initialDiagnosticReasons: null, terminalDiagnosticReasons: null,
  };
  if (!source) return unknown;
  const proof = p.actionControlProof;
  const action = proof?.action;
  const initial = p.decisionEvidence;
  const registeredAt = "acceptanceRegisteredAtMs" in p ? p.acceptanceRegisteredAtMs
    : "refusalRegisteredAtMs" in p ? p.refusalRegisteredAtMs : undefined;
  const exercised = "acceptanceExercised" in p ? p.acceptanceExercised
    : "refusalExercised" in p ? p.refusalExercised : undefined;
  const click = p.interactionDiagnostics?.click.outcome;
  const terminal = p.terminalDecisionEvidence;
  const diagnostics = p.confirmationDiagnostics;
  return {
    // A failed search cannot establish absence of the surface or of a control.
    consentSurfaceObserved: proof || p.resolver?.found ? true : null,
    cmpIdentity: proof?.cmpId ? "verified" : "unverified",
    controlIdentified: proof || p.resolver?.found ? true : null,
    actionAttempted: click ? click !== "not_attempted" : p.execution?.clickCompleted ? true : null,
    initialChoiceRegistrationSupported: p.registrationStatus === "confirmed"
      ? !!action && exercised === true && registeredAt !== undefined && initial?.basis === "verified_state" &&
        initial.decision === (action === "accept" ? "granted" : "denied")
      : p.registrationStatus === "unconfirmed" ? false : null,
    // A missing terminal read is unknown, not a negative choice or an initial registration.
    terminalChoiceStateVerified: terminal && action
      ? terminal.evidence.basis === "verified_state" && terminal.evidence.decision === (action === "accept" ? "granted" : "denied") &&
        terminalConsentDecisionBound(terminal, p.afterActionCapture, proof, action) === true
      : null,
    notificationAcknowledged: "notificationAcknowledgment" in p && p.notificationAcknowledgment ? true : null,
    registrationStatus: p.registrationStatus ?? null,
    initialDiagnosticReasons: diagnostics && "initialReasons" in diagnostics ? [...diagnostics.initialReasons] : null,
    terminalDiagnosticReasons: diagnostics && "terminalReasons" in diagnostics ? [...diagnostics.terminalReasons] : null,
  };
}
/** Diagnostic/benchmark projection only, from a validated source-hash projection.
 * A missing provider is unverified, never proof that a site has no CMP.
 * Unknowns stay in the total and have their own count; no denominator exclusions. */
export function assessConsentActionStages(p:PostAcceptReportProjection|PostRefusalReportProjection):ConsentActionStages {
  const source=/^[a-f0-9]{64}$/.test(p.packetSha256??"");
  const unknown:ConsentActionStages={policyVersion:"consent_action_stages.v1",provider:null,outcome:"unknown",measures:{providerAttributed:null,controlResolved:null,clickCompleted:null,observationCompleted:null,categoryScopeVerified:null,decisionVerified:null},diagnosticReasons:[],categoryCheck:"unknown",evidenceStages:evidenceStages(p,false)};
  if(!source)return unknown;
  const provider=p.actionControlProof?.cmpId??null;
  const reasons=p.confirmationDiagnostics?.reasons??[];
  const group=p.decisionEvidence?.oneTrustGroupEvidence??p.terminalDecisionEvidence?.evidence.oneTrustGroupEvidence;
  return {policyVersion:"consent_action_stages.v1",provider,outcome:consentActionOutcome(p),
    evidenceStages:evidenceStages(p,true),
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
