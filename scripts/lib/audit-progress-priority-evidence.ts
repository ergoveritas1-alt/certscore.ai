import { gpcCmpPairBlockerSchema } from '../../packages/certscore-contracts/src/gpc-cmp-pair-coverage';
/** Audit-only projection of compact facts from a ready persisted generation. */
import { z } from "zod";
import { terminalConsentDecisionBound } from "../../packages/certscore-contracts/src/terminal-consent-decision";
import { choicePathExecutionSchema } from "../../packages/certscore-contracts/src/choice-path-execution";
import { CONSENT_ACTION_CONFIRMATION_POLICY } from "../../packages/certscore-contracts/src/consent-action-evidence-policy";
import { readBoundGpcCmpStateComparison } from "../../packages/certscore-api-contracts/src/gpc-cmp-state-comparison";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const clock = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const actionSchema = z.enum(["accept", "reject"]);
const state = z.enum(["opted_out", "not_opted_out"]);
const terminal = z.object({
  policyVersion: z.enum(["bounded_terminal_consent_decision.v1","bounded_registered_terminal_consent_decision.v1"]),
  action: actionSchema,
  authorizedTargetSha256: hash,
  readStartedAtMs: clock,
  readCompletedAtMs: clock,
  evidence: z.object({
    policyVersion: z.literal(CONSENT_ACTION_CONFIRMATION_POLICY),
    basis: z.literal("verified_state"),
    decision: z.enum(["granted", "denied"]),
    observedStateSha256: hash,
    observedAtMs: clock,
    timestampBasis: z.enum(["instrumented_state_write", "verified_state_observed"]),
  }).strict(),
}).strict();
const capture = z.object({
  policyVersion: z.enum(["bounded_after_action_capture.v1", "bounded_after_action_capture.v2"]),
  action: actionSchema,
  activationStatus: z.literal("completed"),
  actionDispatchedAtMs: clock,
  captureEndedAtMs: clock,
  requestedWindowMs: z.number().int().min(0).max(30_000),
  stopReason: z.literal("window_elapsed"),
  requestsDropped: z.literal(0),
  storageSnapshotRetained: z.literal(true),
}).strict();
const control = z.object({ action: actionSchema, authorizedTargetSha256: hash, observedAtMs: clock }).strict();
const response = z.object({
  contractVersion: z.literal("certscore.gpc-response-assessment.v3"),
  comparison: z.object({
    baselineArtifact: z.object({ sha256: hash }).strict(),
    gpcArtifact: z.object({ sha256: hash }).strict(),
  }).strict(),
  observation: z.object({
    scanId: z.string().min(1).max(200),
    sourceSha256: hash,
    sessionSha256: hash,
    documentUrlSha256: hash,
    status: z.literal("complete"),
    semanticProbe: z.literal("observed"),
    positiveEvidence: z.object({ representativeDocument: z.literal(true) }).strict(),
    delivery: z.object({
      fullContextVerified: z.boolean(),
      httpHeaderRetained: z.literal(true),
      mainNavigatorReadbackRetained: z.literal(true),
    }).strict(),
    requests: z.object({ documentCommittedAtMs: clock, throughMs: clock }).strict(),
    registration: z.object({
      sale: state, sharing: state, cmpGpcSignal: z.enum(["received", "not_received", "unknown"]),
    }).strict(),
  }).strict(),
}).strict();
const registeredCompletion = z.object({
  action: actionSchema, startedAtMs: clock, requiredWindowMs: clock,
  completedAtMs: clock, termination: z.literal("window_elapsed"),
}).strict();
const registeredTiming = z.object({
  actionDispatchedAtMs: clock,
}).strict();
const actionReceipt = z.object({
  contractVersion: z.enum(["certscore.post_accept_report_projection.v1", "certscore.post_refusal_report_projection.v1"]),
  packetSha256: hash,
  execution: choicePathExecutionSchema,
  witness: z.unknown(), capture: z.unknown(), control: z.unknown(),
  registeredCompletion: z.unknown().optional(), registeredTiming: z.unknown().optional(),
}).strict();
const pairReceipt = z.object({ packet: z.unknown(), response: z.unknown() }).strict();
const receipt = z.object({
  version: z.literal("certscore.audit-priority-evidence.v1"),
  accept: z.unknown(), reject: z.unknown(), cmp: z.unknown(),
  coverage: z.tuple([z.enum(["eligible_source","no_completed_click","eligibility_unknown","source_missing"]),z.enum(["eligible_source","no_completed_click","eligibility_unknown","source_missing"]),z.string().min(1).max(64)]).optional(),
  transport: z.enum(["included","size_bound"]).optional(),
}).strict();

export const PRIORITY_EVIDENCE_METRICS = [
  ...(["accept","reject","cmp"] as const).map(lane=>({id:`sealed.priority_evidence.${lane}`,label:`${lane==='cmp'?'Paired CMP':lane==='accept'?'Accept terminal':'Reject terminal'} evidence delivery`,group:lane==='cmp'?'GPC details':'A/R verdicts',denominator:'Reportable scans with a priority coverage receipt; missing receipts remain unavailable',success:[]})),
  ...(["accept", "reject"] as const).map(action => ({
    id: `sealed.terminal.audit_${action}`,
    label: `${action === "accept" ? "Accept" : "Reject"} terminal verification · audit extract`,
    group: "A/R verdicts",
    denominator: "Completed clicks with a generation-matched audit receipt",
    success: ["verified"],
  })),
  ...[
    ...["baseline","gpc"].flatMap(side=>["sale","sharing"].map(axis=>["paired_"+side+"_"+axis,(side==="baseline"?"Without GPC":"With GPC")+" paired CMP "+axis+" setting · audit extract"])),
    ["paired_cmp", "Paired GPC/CMP snapshots · audit extract"],
    ["paired_cmp_scope", "Paired CMP scope · audit extract"],
    ["paired_sale_transition", "Paired sale setting · audit extract"],
    ["paired_sharing_transition", "Paired sharing setting · audit extract"],
  ].map(([id, label]) => ({
    id: `sealed.choice_evidence.${id}`, label: label!, group: "GPC details",
    denominator: "Readable reportable scans; independent snapshots bound to the retained GPC comparison",
    success: id === "paired_cmp" ? ["available"] : [],
  })),
];

export function priorityEvidenceStates(value: unknown, scanId: string) {
  const parsed = receipt.safeParse(value);
  const states: Record<string, { value: string; scope: string }> = {};
  if (!parsed.success) return states;
  for (const action of ["accept", "reject"] as const) {
    const entry = actionReceipt.safeParse(unpackAction(parsed.data[action]));
    const expectedProjection = action === "accept" ? "certscore.post_accept_report_projection.v1" : "certscore.post_refusal_report_projection.v1";
    if (!entry.success || entry.data.contractVersion !== expectedProjection || !entry.data.execution.clickCompleted) continue;
    const witness = terminal.safeParse(entry.data.witness);
    const c = capture.safeParse(entry.data.capture);
    const p = control.safeParse(entry.data.control);
    // The persisted report supplies the validated source packet. Recheck the
    // action, control, and timing joins from its compact scalar projection.
    const completion = registeredCompletion.safeParse(entry.data.registeredCompletion);
    const timing = registeredTiming.safeParse(entry.data.registeredTiming);
    const registered = completion.success && timing.success ? {
      action: completion.data.action, dispatchedAtMs: timing.data.actionDispatchedAtMs,
      startedAtMs: completion.data.startedAtMs, requiredWindowMs: completion.data.requiredWindowMs,
      endedAtMs: completion.data.completedAtMs,
    } : undefined;
    const registeredBound = witness.success && witness.data.policyVersion === "bounded_registered_terminal_consent_decision.v1" &&
      entry.data.execution.observationCompleted && entry.data.execution.consentConfirmed &&
      p.success && registered && p.data.observedAtMs <= registered.dispatchedAtMs &&
      witness.data.evidence.decision === (action === "accept" ? "granted" : "denied") &&
      witness.data.readCompletedAtMs >= witness.data.readStartedAtMs &&
      witness.data.evidence.observedAtMs <= witness.data.readCompletedAtMs &&
      terminalConsentDecisionBound(witness.data, undefined, p.data, action, registered);
    const bound = witness.success && witness.data.policyVersion === "bounded_terminal_consent_decision.v1" && c.success && p.success &&
      witness.data.action === action && c.data.action === action && p.data.action === action &&
      witness.data.authorizedTargetSha256 === p.data.authorizedTargetSha256 &&
      witness.data.evidence.decision === (action === "accept" ? "granted" : "denied") &&
      p.data.observedAtMs <= c.data.actionDispatchedAtMs &&
      witness.data.readStartedAtMs >= c.data.actionDispatchedAtMs &&
      witness.data.readCompletedAtMs >= witness.data.readStartedAtMs &&
      witness.data.evidence.observedAtMs >= c.data.actionDispatchedAtMs &&
      witness.data.evidence.observedAtMs <= witness.data.readCompletedAtMs &&
      c.data.captureEndedAtMs >= c.data.actionDispatchedAtMs + c.data.requestedWindowMs &&
      witness.data.readCompletedAtMs <= c.data.actionDispatchedAtMs + c.data.requestedWindowMs;
    states[`sealed.terminal.audit_${action}`] = {
      value: entry.data.witness == null ? "unavailable" : (bound || registeredBound) ? "verified" : "unverified",
      scope: registeredBound ? witness.data.policyVersion : bound ? `${witness.data.policyVersion}/${c.data.policyVersion}` : parsed.data.version,
    };
  }
  const cmp = pairReceipt.safeParse(unpackPair(parsed.data.cmp));
  if (!cmp.success || cmp.data.packet == null) return states;
  const source = response.safeParse(cmp.data.response);
  const packet = source.success ? readBoundGpcCmpStateComparison(cmp.data.packet, source.data, scanId) : undefined;
  const scope = packet?.contractVersion === "certscore.gpc-cmp-state-comparison.v2" ? "main_document" : "full_context";
  const series = packet ? `${packet.contractVersion}/${scope}/section_${packet.sectionId}_v${packet.sectionVersion}` : parsed.data.version;
  states["sealed.choice_evidence.paired_cmp"] = { value: packet ? "available" : "invalid_or_unbound", scope: series };
  if (packet) {
    states["sealed.choice_evidence.paired_cmp_scope"] = { value: scope, scope: series };
    for (const axis of ["sale", "sharing"] as const) {
      for(const side of ["baseline","gpc"] as const) states[`sealed.choice_evidence.paired_${side}_${axis}`] = {value:packet[side][axis],scope:series};
      states[`sealed.choice_evidence.paired_${axis}_transition`] = {
        value: `${packet.baseline[axis]}_to_${packet.gpc[axis]}`, scope: series,
      };
    }
  }
  return states;
}

export const CMP_BLOCKER_NOT_PROJECTED='cmp_blocker_not_projected';
export const CMP_DELIVERY_KEY='sealed.priority_evidence.cmp';

export function priorityCoverageStates(value:unknown,scanId:string,cmpBlockerOmitted=false){
 const states:Record<string,{value:string;scope:string}>={};
 if(value==='size_bound'){for(const lane of ['accept','reject','cmp'])states['sealed.priority_evidence.'+lane]={value:'summary_size_bound',scope:'certscore.audit-priority-coverage.v1'};return states;}
 const p=receipt.safeParse(value);
 if(!p.success||!p.data.coverage||!p.data.transport)return states;
 const evidence=priorityEvidenceStates(value,scanId);
 for(const [i,lane] of (['accept','reject','cmp'] as const).entries()){
  const observedSource=p.data.coverage[i]!;
  const source=lane==='cmp'&&cmpBlockerOmitted&&observedSource==='source_missing'&&p.data.cmp===null
   ? CMP_BLOCKER_NOT_PROJECTED
   : lane==='cmp'&&observedSource!=='source_present'&&!gpcCmpPairBlockerSchema.safeParse(observedSource).success
   ? 'source_missing' : observedSource;
  const eligible=source==='eligible_source'||source==='source_present';
  const payload=p.data[lane],present=payload!==null&&payload!==undefined;
  const key=lane==='cmp'?'sealed.choice_evidence.paired_cmp':'sealed.terminal.audit_'+lane;
  const inconsistent=p.data.transport==='size_bound'&&present||!eligible&&present||eligible&&p.data.transport==='included'&&!present;
  const status=inconsistent?'invalid_coverage_receipt':!eligible?source:p.data.transport==='size_bound'?'summary_size_bound':!evidence[key]||evidence[key]!.value==='invalid_or_unbound'?'invalid_or_unbound':'included';
  const scope=status===CMP_BLOCKER_NOT_PROJECTED?'certscore.audit-priority-coverage.v1/cmp-blocker-omitted'
   :lane==='cmp'&&gpcCmpPairBlockerSchema.safeParse(status).success?'certscore.gpc-cmp-pair-blocker.v1':'certscore.audit-priority-coverage.v1';
  states['sealed.priority_evidence.'+lane]={value:status,scope};
 }
 return states;
}

// Fixed scalar field lists serve both the SQL transport and its strict reader.
// Null fields are omitted during reconstruction; the typed validators decide availability.
const legacyActionFields=[
  'contractVersion','packetSha256',
  'execution.policyVersion','execution.status','execution.clickCompleted','execution.observationCompleted','execution.consentConfirmed',
  'terminalDecisionEvidence.policyVersion','terminalDecisionEvidence.action','terminalDecisionEvidence.authorizedTargetSha256',
  'terminalDecisionEvidence.readStartedAtMs','terminalDecisionEvidence.readCompletedAtMs',
  'terminalDecisionEvidence.evidence.policyVersion','terminalDecisionEvidence.evidence.basis','terminalDecisionEvidence.evidence.decision',
  'terminalDecisionEvidence.evidence.observedStateSha256','terminalDecisionEvidence.evidence.observedAtMs','terminalDecisionEvidence.evidence.timestampBasis',
  'afterActionCapture.policyVersion','afterActionCapture.action','afterActionCapture.activationStatus','afterActionCapture.actionDispatchedAtMs',
  'afterActionCapture.captureEndedAtMs','afterActionCapture.requestedWindowMs','afterActionCapture.stopReason',
  'afterActionCapture.requestsDropped','afterActionCapture.storageSnapshotRetained',
  'actionControlProof.action','actionControlProof.authorizedTargetSha256','actionControlProof.observedAtMs',
];
export const actionFields=[
  ...legacyActionFields,
  ...['action','startedAtMs','requiredWindowMs','completedAtMs','termination'].map(key=>'registeredObservationCompletion.'+key),
  'retainedActionTiming.actionDispatchedAtMs',
];
export const cmpFields=[
  'contractVersion','scope','scanId','sectionId','sectionVersion','sourceHashes.baseline','sourceHashes.gpc',
  ...['baseline','gpc'].flatMap(side=>['sale','sharing','received','observedAfterDocumentCommitMs'].map(k=>side+'.'+k)),
  'scoreEffect','causedByGpc','legalInterpretation',
];
export const gpcFields=[
  'contractVersion','comparison.baselineArtifact.sha256','comparison.gpcArtifact.sha256',
  ...['scanId','sourceSha256','sessionSha256','documentUrlSha256','status','semanticProbe',
  'positiveEvidence.representativeDocument','delivery.fullContextVerified','delivery.httpHeaderRetained','delivery.mainNavigatorReadbackRetained',
  'requests.documentCommittedAtMs','requests.throughMs','registration.sale','registration.sharing','registration.cmpGpcSignal'].map(k=>'observation.'+k),
];
function unpack(value:unknown,fields:string[]):Record<string,any>|undefined{
 if(!Array.isArray(value)||value.length!==fields.length||!value.every(x=>x===null||typeof x==='boolean'||
    typeof x==='number'||typeof x==='string'&&Buffer.byteLength(x)<=254))return undefined;
 const result:Record<string,any>={};
 for(const [i,field] of fields.entries()){
  if(value[i]===null)continue;
  const keys=field.split('.');let current=result;
  for(const key of keys.slice(0,-1))current=current[key]??={};
  current[keys.at(-1)!]=value[i];
 }
 return result;
}
function unpackAction(value:unknown){
 if(!Array.isArray(value))return value;
 const record=unpack(value,value.length===legacyActionFields.length?legacyActionFields:actionFields);if(!record)return undefined;
 return {contractVersion:record.contractVersion,packetSha256:record.packetSha256,execution:record.execution,
  witness:record.terminalDecisionEvidence,capture:record.afterActionCapture,control:record.actionControlProof,
  registeredCompletion:record.registeredObservationCompletion,registeredTiming:record.retainedActionTiming};
}
function unpackPair(value:unknown){
 if(!Array.isArray(value))return value;
 if(value.length!==2)return undefined;
 const packet=unpack(value[0],cmpFields),response=unpack(value[1],gpcFields);
 return packet&&response?{packet,response}:undefined;
}
const path=(root:string,...keys:string[])=>`(${root}#>'{${keys.join(',')}}')`;
const runtimePath=(...keys:string[])=>path('p.report_projection_payload','runtimeArtifacts',...keys);
const tuple=(root:string,keys:string[])=>`(select jsonb_agg(case when jsonb_typeof(v) not in ('array','object') and octet_length(v::text)<=256 then v end order by n)
 from unnest(string_to_array('${keys.join('|')}','|')) with ordinality f(k,n),lateral (select ${root}#>string_to_array(k,'.') v) x)`;
const terminalSql=(key:string)=>{
 const root=runtimePath(key);
 return `case when ${path(root,'execution','clickCompleted')}='true'::jsonb then ${tuple(root,actionFields)} end`;
};
const cmp=runtimePath('gpcCmpStateComparison');
const sourceStateSql=(key:string)=>{const root=runtimePath(key);return `case when jsonb_typeof(${root})='object' then case ${path(root,'execution','clickCompleted')} when 'true'::jsonb then 'eligible_source' when 'false'::jsonb then 'no_completed_click' else 'eligibility_unknown' end else 'source_missing' end`;};
export function priorityEvidenceSql(includeCmpBlocker=false) {
 const missingCmp=includeCmpBlocker
  ? `coalesce(left(${runtimePath()}->>'gpcCmpPairBlocker',64),'source_missing')`
  : "'source_missing'";
 return `jsonb_build_object('version','certscore.audit-priority-evidence.v1',
 'accept',${terminalSql('postAcceptEvidenceProjection')},'reject',${terminalSql('postRefusalEvidenceProjection')},
 'cmp',case when jsonb_typeof(${cmp})='object' then jsonb_build_array(${tuple(cmp,cmpFields)},${tuple(runtimePath('gpcResponseAssessment'),gpcFields)}) end,
 'coverage',jsonb_build_array(${sourceStateSql('postAcceptEvidenceProjection')},${sourceStateSql('postRefusalEvidenceProjection')},case when jsonb_typeof(${cmp})='object' then 'source_present' else ${missingCmp} end),'transport','included')`;
}
export const PRIORITY_EVIDENCE_SQL=priorityEvidenceSql();
const get=(v:any,p:string)=>p.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,v);
const compact=(v:any,keys:string[])=>keys.map(k=>{const x=get(v,k);return ['string','number','boolean'].includes(typeof x)&&Buffer.byteLength(JSON.stringify(x))<=256?x:null;});
const sourceState=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v)?v.execution?.clickCompleted===true?'eligible_source':v.execution?.clickCompleted===false?'no_completed_click':'eligibility_unknown':'source_missing';
export function priorityEvidenceFromRecord(record:any){
 const r=record.runtimeArtifacts??{},accept=r.postAcceptEvidenceProjection,reject=r.postRefusalEvidenceProjection,pair=r.gpcCmpStateComparison;
 const hasPair=pair&&typeof pair==='object'&&!Array.isArray(pair);
 return {version:'certscore.audit-priority-evidence.v1',accept:accept?.execution?.clickCompleted===true?compact(accept,actionFields):null,reject:reject?.execution?.clickCompleted===true?compact(reject,actionFields):null,cmp:hasPair?[compact(pair,cmpFields),compact(r.gpcResponseAssessment,gpcFields)]:null,coverage:[sourceState(accept),sourceState(reject),hasPair?'source_present':gpcCmpPairBlockerSchema.safeParse(r.gpcCmpPairBlocker).data??'source_missing'],transport:'included'};
}
/** PostgreSQL jsonb textual spacing is larger than JSON.stringify; budget for both transports. */
export function jsonbBytes(value:any):number{
 const encode=(v:any):string=>Array.isArray(v)?'['+v.map(encode).join(', ')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+': '+encode(x)).join(', ')+'}':JSON.stringify(v)??'null';
 return Buffer.byteLength(encode(value));
}
export function withBoundedPriority(base:any,record:any){
 const priority=priorityEvidenceFromRecord(record),full={...base,priorityEvidence:priority};
 if(jsonbBytes(full)<=8192)return full;
 const bounded={...base,priorityEvidence:{...priority,accept:null,reject:null,cmp:null,transport:'size_bound'}};
 if(jsonbBytes(base)>8192)return {version:base.version,availability:'size_bound'};
 if(jsonbBytes(bounded)<=8192)return bounded;
 const hint={...base,priorityEvidence:'size_bound'};return jsonbBytes(hint)<=8192?hint:base; // Never evict a fitting core for optional diagnostics.
}

export function hasPriorityCoverage(value:unknown):boolean{
 if(value==='size_bound')return true;
 const p=receipt.safeParse(value);return p.success&&!!p.data.coverage&&!!p.data.transport;
}
