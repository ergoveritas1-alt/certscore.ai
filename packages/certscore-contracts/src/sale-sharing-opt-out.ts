import {REDHAT_OPT_OUT_POLICY,REDHAT_OPT_OUT_RECIPE,REDHAT_OPT_OUT_TARGET,REDHAT_OPT_OUT_DOCUMENT,redHatOptOutAuthorizationSchema,redHatOptOutProofSchema,redHatTerminalChoiceConfirmed,optOutExecutionAssessmentSchema} from './redhat-opt-out';
export * from './redhat-opt-out';
import {captureFailureDiagnosticSchema} from "./capture-failure-diagnostic";
import { EXPLICIT_OPT_OUT_CONTROL_POLICY, explicitOptOutEntranceName } from "./explicit-opt-out-control";
import { z } from "zod";
import {saleSharingCanaryAuthorizationSchema} from "./sale-sharing-canary";
export * from "./sale-sharing-canary";
import {SALE_SHARING_REDIRECT_POLICY,saleSharingApexWwwCounterpart,saleSharingRedirectAuthorizationSchema,saleSharingRedirectProofSchema,SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorizationSchema,saleSharingExactRouteProofSchema,saleSharingExactRouteMatches} from "./sale-sharing-redirect";
export * from "./sale-sharing-redirect";
export const SALE_SHARING_OPT_OUT_POLICY = "bounded_sale_sharing_opt_out.v1" as const;
export const SALE_SHARING_OPT_OUT_WORKER_BUDGET_MS = 5_000;
export const SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS = 3_000;
// Preserve observation and five-second worker caps; reserve 500 ms for return.
export const SALE_SHARING_OPT_OUT_ARTIFACT_BUDGET_MS = 4_500;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const target = z.string().url().max(2000).refine(value => { const u=new URL(value); return !u.username && !u.password && !u.hash && (u.protocol==="https:" || (u.protocol==="http:" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname))); });
export const saleSharingOptOutDispatchSchema = z.object({
  controlPolicy:z.literal(EXPLICIT_OPT_OUT_CONTROL_POLICY).optional(),
  policyVersion: z.enum([SALE_SHARING_OPT_OUT_POLICY,SALE_SHARING_REDIRECT_POLICY,SALE_SHARING_EXACT_ROUTE_POLICY,REDHAT_OPT_OUT_POLICY]), enabled: z.literal(true),
  scanId: z.string().min(1).max(160), exactTargetUrl: target,
  redirectAuthorization:saleSharingRedirectAuthorizationSchema.optional(),
  exactRouteAuthorization:saleSharingExactRouteAuthorizationSchema.optional(),
  canaryAuthorization:saleSharingCanaryAuthorizationSchema.optional(),
  redHatAuthorization:redHatOptOutAuthorizationSchema.optional(),
  rolloutSource:z.object({version:z.literal("reviewed_opt_out_source.v1"),sourceSha256:hash,observationId:z.string().min(1).max(200),documentUrl:target,documentToken:z.string().min(1).max(300)}).strict().optional(),
}).strict().superRefine((row,ctx)=>{
  if(row.rolloutSource && (![SALE_SHARING_EXACT_ROUTE_POLICY,SALE_SHARING_REDIRECT_POLICY].includes(row.policyVersion as never) || row.canaryAuthorization))ctx.addIssue({code:"custom",message:"Production route source requires isolated reviewed v3 scope."});
  if(row.policyVersion===REDHAT_OPT_OUT_POLICY){
    if(row.exactTargetUrl!==REDHAT_OPT_OUT_TARGET||!row.redHatAuthorization||row.controlPolicy||row.canaryAuthorization||row.redirectAuthorization||row.exactRouteAuthorization)ctx.addIssue({code:'custom',message:'Red Hat requires its exact source authorization and isolated policy.'});
    return;
  }
  if(row.redHatAuthorization)ctx.addIssue({code:'custom',message:'Historical dispatch cannot acquire Red Hat reload authority.'});
  if(row.controlPolicy && (row.policyVersion!==SALE_SHARING_OPT_OUT_POLICY||row.canaryAuthorization))ctx.addIssue({code:"custom",message:"Bound control policy requires direct v1 scope."});
  if(row.canaryAuthorization&&(row.policyVersion!==SALE_SHARING_EXACT_ROUTE_POLICY||row.scanId!==row.canaryAuthorization.scanId||row.exactTargetUrl!==row.canaryAuthorization.targetUrl))ctx.addIssue({code:"custom",message:"Canary must bind its exact v3 dispatch."});
  if(row.policyVersion===SALE_SHARING_EXACT_ROUTE_POLICY){
    if(row.redirectAuthorization||!saleSharingExactRouteMatches(row.exactTargetUrl,row.exactRouteAuthorization))ctx.addIssue({code:"custom",message:"Exact route must match its approved source-specific ordered grant."});
    return;
  }
  if(row.exactRouteAuthorization!==undefined)ctx.addIssue({code:"custom",message:"Legacy dispatch cannot acquire exact-route authority."});
  if(row.policyVersion===SALE_SHARING_REDIRECT_POLICY
    ? !row.redirectAuthorization || row.redirectAuthorization.alternateTargetUrl!==saleSharingApexWwwCounterpart(row.exactTargetUrl)
    : row.redirectAuthorization!==undefined)ctx.addIssue({code:"custom",message:"Redirect authorization must bind the exact approved apex/www counterpart under v2 only."});
});
export type SaleSharingOptOutDispatch = z.infer<typeof saleSharingOptOutDispatchSchema>;
const decision = z.object({sectionId:z.union([z.literal(7),z.literal(8)]),sale:z.union([z.literal(1),z.literal(2)]),sharing:z.union([z.literal(1),z.literal(2)])}).strict();
export const SALE_SHARING_OPT_OUT_MILESTONES = ["usable_document", "recipe_selected", "control_actionable", "submitted", "confirmed", "observation_completed"] as const;
const elapsedMs = z.number().int().min(0).max(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS);
/** Fixed-size operational facts only; absence never establishes missing controls. */
export const saleSharingTimingSchema = z.object({
  version:z.literal("sale_sharing_timing.v1"),captureMs:elapsedMs,
  launchMs:elapsedMs.optional(),contextMs:elapsedMs.optional(),navigationMs:elapsedMs.optional(),
  commitMs:elapsedMs.optional(),readinessMs:elapsedMs.optional(),entranceMs:elapsedMs.optional(),
  entrance:z.enum(["native_settings","anchor_settings","explicit","visible_dialog"]).optional(),
  readiness:z.object({
    reason:z.enum(["parsed_recipe","domcontentloaded","script_recipe","cutoff","probe_budget","incomplete","document_changed"]),
    checks:z.number().int().min(0).max(2),probeMs:elapsedMs,
    matched:z.number().int().min(0).max(2).nullable(),gpp:z.boolean().nullable(),
  }).strict().optional(),
}).strict().superRefine((row,ctx)=>{
  const values=[row.launchMs,row.contextMs,row.navigationMs,row.commitMs,row.readinessMs,row.entranceMs].filter((v):v is number=>v!==undefined);
  if(values.some((v,i)=>i>0&&v<values[i-1]!))ctx.addIssue({code:"custom",message:"Timing offsets must be monotonic."});
});
/** Operational checkpoints only; never evidence of choice effectiveness. */
export const saleSharingOptOutDiagnosticsSchema = z.object({
  version: z.literal("sale_sharing_execution_diagnostics.v1"),
  timing:saleSharingTimingSchema.optional(),
  boundControlReadiness:z.object({
    version:z.literal("explicit_opt_out_readiness.v1"),
    reason:z.enum(["ready","cutoff","probe_budget","check_limit","document_changed","ambiguous_recipe"]),
    trigger:z.enum(["initial","mutation","document_state","domcontentloaded","cutoff","pagehide"]),
    checks:z.number().int().min(0).max(32),probeMs:elapsedMs,elapsedMs,
    remainingCaptureMs:elapsedMs,
    documentReadyState:z.enum(["loading","interactive","complete"]),
    matchedRecipes:z.number().int().min(0).max(2).nullable(),
  }).strict().optional(),
  milestones: z.array(z.object({stage:z.enum(SALE_SHARING_OPT_OUT_MILESTONES),elapsedMs:z.number().int().min(0).max(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS)}).strict()).max(6),
  decisionReads: z.array(z.object({phase:z.enum(["before","after","terminal"]),status:z.enum(["observed","unavailable","timeout","invalid","duplicate","failed"]),elapsedMs:z.number().int().min(0).max(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS)}).strict()).max(3),
  navigation: z.object({
    version:z.literal("sale_sharing_navigation.v1"),
    responseStatus:z.number().int().min(100).max(599).optional(),
    targetState:z.enum(["unobserved","exact","different"]),
    readiness:z.enum(["unobserved","parsed_recipe","domcontentloaded"]),
    blockedNavigation:z.enum(["none","main_frame","subframe"]),
    failure:z.enum(["none","http_error","response_missing","target_mismatch","network_failure","deadline","cancelled","document_changed","other"]),
  }).strict().optional(),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.milestones.map(m=>m.stage)).size!==row.milestones.length ||
    row.milestones.some((m,i)=>i>0 && (m.elapsedMs<row.milestones[i-1]!.elapsedMs || SALE_SHARING_OPT_OUT_MILESTONES.indexOf(m.stage)<=SALE_SHARING_OPT_OUT_MILESTONES.indexOf(row.milestones[i-1]!.stage))) ||
    new Set(row.decisionReads.map(r=>r.phase)).size!==row.decisionReads.length)
    ctx.addIssue({code:"custom",message:"Execution checkpoints must be unique and ordered."});
});
export const saleSharingOptOutEvidenceSchema = z.object({
  contractVersion:z.enum(["certscore.sale-sharing-opt-out-evidence.v1","certscore.sale-sharing-opt-out-evidence.v2","certscore.sale-sharing-opt-out-evidence.v3","certscore.sale-sharing-opt-out-evidence.v4"]),policyVersion:z.enum([SALE_SHARING_OPT_OUT_POLICY,SALE_SHARING_REDIRECT_POLICY,SALE_SHARING_EXACT_ROUTE_POLICY,REDHAT_OPT_OUT_POLICY]),
  scanId:z.string().min(1).max(160),parentDispatchSha256:hash,targetUrl:target,documentToken:z.string().min(1).max(200).nullable(),
  redirectAuthorization:saleSharingRedirectAuthorizationSchema.optional(),
  exactRouteAuthorization:saleSharingExactRouteAuthorizationSchema.optional(),
  actionTargetUrl:target.nullable().optional(),tlsValidated:z.boolean().optional(),
  redirectProof:saleSharingRedirectProofSchema.nullable().optional(),
  exactRouteProof:saleSharingExactRouteProofSchema.nullable().optional(),
  startedAt:z.string().datetime(),completedAt:z.string().datetime(),status:z.enum(["complete","limited","unsupported"]),
  recipeVersion:z.string().min(1).max(100).nullable(),provider:z.string().max(100).nullable(),
  controlPolicy:z.literal(EXPLICIT_OPT_OUT_CONTROL_POLICY).optional(),
  entranceControl:z.object({
    tagName:z.enum(["button","a"]),selector:z.enum(["button.ot-sdk-show-settings","a.ot-sdk-show-settings","button#onetrust-pc-btn-handler"]),
    accessibleLabel:z.string().min(1).max(300),visibleText:z.string().max(300),
    labelSource:z.enum(["aria_labelledby","aria_label","visible_text"]),href:z.literal("#").optional(),
    observedAtMs:z.number().int().min(0).max(SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS),
  }).strict().optional(),
  actionCount:z.number().int().min(0).max(2),submitted:z.boolean(),
  registration:z.enum(["confirmed","unconfirmed","not_attempted"]),confirmedAt:z.string().datetime().nullable(),
  before:decision.nullable(),after:decision.nullable(),
  observationWindowMs:z.number().int().min(0).max(500),captureComplete:z.boolean(),truncated:z.boolean(),
  requests:z.array(z.object({hostname:z.string().min(1).max(255).regex(/^[a-z0-9.-]+$/i), vendor:z.string().min(1).max(160),purpose:z.enum(["advertising","marketing"]), httpStatus:z.number().int().min(200).max(599), msAfterConfirmation:z.number().int().min(250).max(750),
    collectionEvidence:z.object({contractVersion:z.literal("canonical_advertising_collection.v1"),endpointSha256:hash,
      registryVersion:z.string().min(1).max(200),ruleIds:z.array(z.string().min(1).max(200)).min(1).max(16)}).strict().optional()}).strict()).max(32),
  redHatChoice:redHatOptOutProofSchema.optional(),
  executionDiagnostic:captureFailureDiagnosticSchema.optional(),
  executionDiagnostics:saleSharingOptOutDiagnosticsSchema.optional(),
  limitations:z.array(z.string().min(1).max(100)).max(12),
}).strict().superRefine((p,ctx)=>{
  if(p.contractVersion==='certscore.sale-sharing-opt-out-evidence.v4'){
    if(p.policyVersion!==REDHAT_OPT_OUT_POLICY||p.targetUrl!==REDHAT_OPT_OUT_TARGET||!p.redHatChoice||p.controlPolicy||p.entranceControl||p.redirectAuthorization||p.redirectProof||p.exactRouteAuthorization||p.exactRouteProof||p.actionTargetUrl!==(p.redHatChoice?.initialDocumentSha256?REDHAT_OPT_OUT_DOCUMENT:null)||p.tlsValidated!==Boolean(p.redHatChoice?.initialDocumentSha256)||p.provider!=='TrustArc'||p.recipeVersion!==REDHAT_OPT_OUT_RECIPE)ctx.addIssue({code:'custom',message:'v4 requires its exact Red Hat proof and recipe.'});
    if(p.status==='complete'||p.registration==='confirmed'||p.before||p.after||p.confirmedAt||p.captureComplete||p.observationWindowMs!==0||p.requests.length||p.actionCount>1||p.truncated)ctx.addIssue({code:'custom',message:'CMP category confirmation cannot establish semantic sale/sharing state or post-confirmation collection.'});
    const r=p.redHatChoice;
    if(r&&(p.documentToken!==r.initialDocumentSha256||p.submitted&&(p.actionCount!==1||r.clickAtMs===null||!r.control)||!p.submitted&&p.registration!=='not_attempted'||p.submitted&&p.registration!=='unconfirmed'||Date.parse(p.completedAt)-Date.parse(p.startedAt)<r.captureFinishedMs))ctx.addIssue({code:'custom',message:'Action and source proof must agree with packet outcome.'});
    if(Date.parse(p.completedAt)<Date.parse(p.startedAt))ctx.addIssue({code:'custom',message:'Invalid observation interval.'});
    return;
  }
  if(p.redHatChoice||p.policyVersion===REDHAT_OPT_OUT_POLICY)ctx.addIssue({code:'custom',message:'Historical evidence cannot acquire Red Hat proof.'});
  if(p.controlPolicy && p.policyVersion!==SALE_SHARING_OPT_OUT_POLICY)ctx.addIssue({code:"custom",message:"Bound controls require direct v1 evidence."});
  if(p.executionDiagnostics?.boundControlReadiness&&!p.controlPolicy)ctx.addIssue({code:"custom",message:"Bound-control readiness requires its explicit control policy."});
  if(p.entranceControl){
    const e=p.entranceControl,base=explicitOptOutEntranceName(e.accessibleLabel);
    if(!p.controlPolicy||!p.documentToken||!base||e.visibleText.trim()&&explicitOptOutEntranceName(e.visibleText)!==base||
      !(e.selector===`${e.tagName}.ot-sdk-show-settings`||e.tagName==="button"&&e.selector==="button#onetrust-pc-btn-handler")||(e.tagName==="a"?e.href!=="#":e.href!==undefined))
      ctx.addIssue({code:"custom",message:"Entrance names and route must agree on the bound explicit choice."});
  }
  const v2=p.contractVersion==="certscore.sale-sharing-opt-out-evidence.v2";
  const v3=p.contractVersion==="certscore.sale-sharing-opt-out-evidence.v3";
  if(v3){
    if(p.policyVersion!==SALE_SHARING_EXACT_ROUTE_POLICY||!saleSharingExactRouteMatches(p.targetUrl,p.exactRouteAuthorization)||p.redirectAuthorization!==undefined||p.redirectProof!==undefined||p.actionTargetUrl===undefined||p.exactRouteProof===undefined||p.tlsValidated===undefined)
      ctx.addIssue({code:"custom",message:"v3 evidence requires its exact route grant and typed transport outcome."});
    const hops=p.exactRouteProof?.hops,targets=p.exactRouteAuthorization?.targets;
    if(hops){
      const ids=[hops[0]?.sourceRequestId,...hops.map(h=>h.targetRequestId)];
      if(!hops.length||!targets||hops.length!==targets.length||new Set(ids).size!==ids.length||hops.some((h,i)=>h.fromUrl!==(i===0?p.targetUrl:targets[i-1])||h.toUrl!==targets[i]||(i>0&&h.sourceRequestId!==hops[i-1]!.targetRequestId)))
        ctx.addIssue({code:"custom",message:"Exact route proof must preserve every ordered hop and request ancestry."});
    }
    if(p.actionTargetUrl&&(!p.tlsValidated||(p.actionTargetUrl===p.targetUrl?!!hops:!hops||p.actionTargetUrl!==targets?.at(-1))))
      ctx.addIssue({code:"custom",message:"Only the original direct document or the fully proven route destination can be an action target."});
    if((p.documentToken||p.actionCount>0||p.submitted||p.before||p.after||p.status==="complete")&&!p.actionTargetUrl)ctx.addIssue({code:"custom",message:"Action observations require a bound final target."});
  }else if(p.exactRouteAuthorization!==undefined||p.exactRouteProof!==undefined)ctx.addIssue({code:"custom",message:"Historical evidence cannot acquire exact-route authority."});
  if(v2){
    if(p.policyVersion!==SALE_SHARING_REDIRECT_POLICY||!p.redirectAuthorization||p.redirectAuthorization.alternateTargetUrl!==saleSharingApexWwwCounterpart(p.targetUrl)||p.actionTargetUrl===undefined||p.redirectProof===undefined||p.tlsValidated===undefined)
      ctx.addIssue({code:"custom",message:"v2 evidence requires its original exact-target redirect grant and typed outcome."});
    const proof=p.redirectProof;
    if(proof&&(proof.fromUrl!==p.targetUrl||proof.toUrl!==p.redirectAuthorization?.alternateTargetUrl||proof.sourceRequestId===proof.targetRequestId))ctx.addIssue({code:"custom",message:"Redirect proof must bind the original request to its one exact counterpart."});
    if(p.actionTargetUrl&&(p.actionTargetUrl!==p.targetUrl&&p.actionTargetUrl!==p.redirectAuthorization?.alternateTargetUrl||!p.tlsValidated||p.actionTargetUrl===p.targetUrl&&proof||p.actionTargetUrl!==p.targetUrl&&!proof))ctx.addIssue({code:"custom",message:"Action target requires matching transport and redirect proof."});
    if((p.documentToken||p.actionCount>0||p.submitted||p.before||p.after||p.status==="complete")&&!p.actionTargetUrl)ctx.addIssue({code:"custom",message:"Action observations require a bound final target."});
  }else if(!v3&&(p.policyVersion!==SALE_SHARING_OPT_OUT_POLICY||p.redirectAuthorization!==undefined||p.actionTargetUrl!==undefined||p.redirectProof!==undefined||p.tlsValidated!==undefined))ctx.addIssue({code:"custom",message:"Historical v1 evidence cannot acquire redirect authority."});
  const confirmed=p.registration==="confirmed";
  if(confirmed && (!p.submitted || !p.documentToken || !p.recipeVersion || !p.provider || !p.confirmedAt || !p.before || !p.after || p.before.sectionId!==p.after.sectionId || p.after.sale!==1 || p.after.sharing!==1 || (p.before.sale!==2 && p.before.sharing!==2)))ctx.addIssue({code:"custom",message:"Registered sale/sharing opt-out requires a bound semantic transition."});
  if(!confirmed && (p.confirmedAt || p.requests.length || p.captureComplete))ctx.addIssue({code:"custom",message:"Unconfirmed decisions cannot establish post-opt-out activity."});
  if(p.status==="complete" && (Date.parse(p.completedAt)-Date.parse(p.startedAt)>SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS || !p.confirmedAt || Date.parse(p.completedAt)-Date.parse(p.confirmedAt)<750))ctx.addIssue({code:"custom",message:"Observation must complete within its budget and after the full anchored window."});
  if(p.status==="complete" && (!confirmed || !p.captureComplete || p.observationWindowMs!==500 || p.truncated || p.limitations.length))ctx.addIssue({code:"custom",message:"Complete observation requires confirmed decision and completed bounded capture."});
  if(p.requests.some(row=>row.collectionEvidence && row.httpStatus >= 400))ctx.addIssue({code:"custom",message:"Scorable collection requires a successful retained response."});
  if(p.submitted && (p.actionCount<1 || p.registration==="not_attempted"))ctx.addIssue({code:"custom",message:"Submission must retain its decision outcome."});
  if(p.confirmedAt && (Date.parse(p.confirmedAt)<Date.parse(p.startedAt) || Date.parse(p.confirmedAt)>Date.parse(p.completedAt)))ctx.addIssue({code:"custom",message:"Decision timestamp outside observation."});
  if(Date.parse(p.completedAt)<Date.parse(p.startedAt))ctx.addIssue({code:"custom",message:"Invalid observation interval."});
});
export type SaleSharingOptOutEvidence=z.infer<typeof saleSharingOptOutEvidenceSchema>;
export function saleSharingOptOutActionTarget(packet:SaleSharingOptOutEvidence):string|null {
  return packet.contractVersion!=="certscore.sale-sharing-opt-out-evidence.v1"?packet.actionTargetUrl??null:packet.targetUrl;
}
export function saleSharingOptOutBindsDocument(packet:SaleSharingOptOutEvidence,documentUrl:string):boolean {
  return packet.targetUrl===documentUrl||packet.contractVersion!=="certscore.sale-sharing-opt-out-evidence.v1"&&saleSharingOptOutActionTarget(packet)===documentUrl;
}
export function saleSharingOptOutMatchesDispatch(packet:SaleSharingOptOutEvidence,dispatch:SaleSharingOptOutDispatch):boolean {
  return packet.controlPolicy===dispatch.controlPolicy&&packet.scanId===dispatch.scanId&&packet.targetUrl===dispatch.exactTargetUrl&&packet.policyVersion===dispatch.policyVersion&&
    packet.redirectAuthorization?.alternateTargetUrl===dispatch.redirectAuthorization?.alternateTargetUrl&&
    JSON.stringify(packet.exactRouteAuthorization)===JSON.stringify(dispatch.exactRouteAuthorization)&&
    JSON.stringify(packet.redHatChoice?.source)===JSON.stringify(dispatch.redHatAuthorization);
}
export const verifiedSaleSharingOptOutSchema=z.object({
  evidence:saleSharingOptOutEvidenceSchema,sha256:hash,sizeBytes:z.number().int().positive().max(32000),verificationStatus:z.literal("verified"),
}).strict();
export type VerifiedSaleSharingOptOut=z.infer<typeof verifiedSaleSharingOptOutSchema>;

export const optOutPreActionStopSchema=z.enum(["navigation_failed","navigation_budget_exhausted","document_binding_budget_exhausted"]);
export const saleSharingOptOutLaneOutcomeSchema=z.object({diagnostic:captureFailureDiagnosticSchema.optional(),status:z.enum(["joined","limited"]),startedAt:z.string().datetime(),completedAt:z.string().datetime(),limitationCode:z.enum(["opt_out_budget_exhausted","opt_out_worker_failed","opt_out_inspection_cancelled"]).optional(),preActionStop:optOutPreActionStopSchema.optional()}).strict();
export type SaleSharingOptOutLaneOutcome=z.infer<typeof saleSharingOptOutLaneOutcomeSchema>;

/** Outcome facts retained by the GPP packet, including in the compact audit view. */
export function legacyOptOutExecutionOutcome(packet: Pick<SaleSharingOptOutEvidence,
  "submitted" | "registration" | "status" | "captureComplete" | "observationWindowMs">) {
  const confirmed=packet.registration==="confirmed";
  return {
    actionCompleted:packet.submitted,
    choiceConfirmation:confirmed?"confirmed_initial":packet.submitted?"unconfirmed":"not_attempted",
    confirmationBasis:"gpp_sale_sharing",
    postConfirmationObservation:packet.status==="complete"&&packet.captureComplete?"complete":confirmed?"limited":"not_measured",
    observationWindowMs:packet.observationWindowMs,
  } as const;
}

/** Derived only after the original packet checksum and target binding are verified. */
export function deriveOptOutExecutionAssessment(packet:SaleSharingOptOutEvidence,packetSha256:string){
  const legacy=legacyOptOutExecutionOutcome(packet);
  const proof=packet.redHatChoice,terminal=proof?.reads.find(r=>r.phase==='terminal');
  const confirmed=proof?packet.submitted&&redHatTerminalChoiceConfirmed(proof):packet.registration==='confirmed';
  const readAt=confirmed?(proof?terminal!.atMs:Date.parse(packet.confirmedAt!)-Date.parse(packet.startedAt)):null;
  return optOutExecutionAssessmentSchema.parse({version:'opt_out_execution_assessment.v1',scanId:packet.scanId,packetSha256,
    ...legacy,
    ...(proof?{confirmationBasis:'cmp_explicit_choice',choiceConfirmation:confirmed?'confirmed_terminal':packet.submitted?'unconfirmed':'not_attempted'}:{}),
    confirmationReadAtMs:readAt!==null&&readAt>=0&&readAt<=SALE_SHARING_OPT_OUT_CAPTURE_BUDGET_MS?readAt:null});
}
