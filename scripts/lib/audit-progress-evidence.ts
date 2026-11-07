import { pairedGpcAudit, GPC_PAIR_METRICS, GPC_PAIR_QUANTITIES, GPC_SESSION_METRICS, GPC_SESSION_QUANTITIES, GPC_DETAIL_METRICS, GPC_DETAIL_QUANTITIES } from "./audit-progress-gpc";
import { checklistEvidence, returnedState } from './audit-progress-contracts';
/** Audit-only summaries of returned evidence. Never generates findings or rescoring. */
import type {Metric, ProgressRow} from "./audit-progress";
import {siteIntegrityProjectionSchema} from "../../packages/certscore-contracts/src/site-integrity";
import {cmsSecurityProjectionSchema} from "../../packages/certscore-contracts/src/cms-security";
import {formDestinationProjectionSchema} from "../../packages/certscore-contracts/src/form-destination-trace";
import {apiRuntimeEvidenceGraphProjectionSchema} from "../../packages/certscore-api-contracts/src/runtime-evidence-graph";
type Obj=Record<string,any>;
const obj=(v:any):Obj=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const count=(v:any):number|undefined=>Number.isSafeInteger(v)&&v>=0?v:undefined;
const state=returnedState;
const denominator="Readable reportable scans; missing historical fields stay not checked";
export const EVIDENCE_METRICS:Metric[]=[
  ...GPC_PAIR_METRICS, ...GPC_SESSION_METRICS, ...GPC_DETAIL_METRICS,
  ...["accept","reject"].flatMap(action=>[
    {id:`detail.${action}.verdict`,label:`${action} returned verdict`,group:"A/R verdicts",denominator,success:[]},
    {id:`detail.${action}.projectable`,label:`${action} evidence projectable`,group:"A/R verdicts",denominator,success:["projectable"]},
    {id:`detail.${action}.reason`,label:`${action} indeterminate reason`,group:"A/R verdicts",denominator,success:[]},
    {id:`detail.${action}.stop`,label:`${action} after-click stop reason`,group:"A/R verdicts",denominator,success:[]},
  ]),
  ...["response","semantic_probe","acknowledgment","sale","sharing","activity_comparison"].map(id=>({id:`detail.gpc.${id}`,label:`GPC ${id.replaceAll("_"," ")}`,group:"GPC details",denominator,success:[]})),
  ...["count","before","after"].map(id=>({id:`detail.forms.${id}`,label:`Forms ${id==="count"?"count coverage":id==="before"?"before consent capture":"after Accept capture retained"}`,group:"Forms",denominator,success:id==="count"?["captured"]:id==="after"?["retained"]:["complete"]})),
  {id:"detail.storage.classification",label:"Pre-consent storage classification",group:"Storage classification",denominator,success:[]},
  ...["cookies","vendors","requests","findings","policy"].map(id=>({id:`detail.inventory.${id}`,label:`${id} returned inventory cap`,group:"Inventory coverage",denominator,success:["not_truncated"]})),
  {id:"detail.navigation.host",label:"Navigation landed on different host",group:"Navigation",denominator,success:["different_host"]},
  ...["site_integrity","technology","form_destinations","relationships"].map(id=>({id:`detail.sealed.${id}`,label:`Retained ${id.replaceAll("_"," ")} projection`,group:"Detailed capture availability",denominator:"Readable reportable scans; requires sealed generation-matched projection and original bundle binding",success:[]})),
];
export const QUANTITIES=[
  {id:"sealed.opt_out.decision_remaining_ms",label:"Time remaining at conditional opt-out decision",unit:"ms",path:"verified conditionalOptOutDecision.remainingTimeMs"},
  {id:"sealed.opt_out.dispatch_elapsed_ms",label:"Conditional opt-out dispatch time from coordinator start",unit:"ms",path:"verified conditionalOptOutDecision.decidedAtMs"},
  ...GPC_PAIR_QUANTITIES, ...GPC_SESSION_QUANTITIES, ...GPC_DETAIL_QUANTITIES,
  {id:"storage.unclassified",label:"Unclassified pre-consent storage records",unit:"records",path:"executiveSummary.preConsentStorageAssessment.unclassifiedCount"},
  {id:"storage.proven_writes",label:"Timestamped pre-consent cookie writes",unit:"writes",path:"storageEvidenceSummary.provenTimestampedPreConsentCookieWriteCount"},
  {id:"storage.snapshot_only",label:"Late/initial cookie snapshot records",unit:"records",path:"storageEvidenceSummary.lateOrInitialSnapshotCookieCount"},
  {id:"inventory.vendors",label:"Recognized vendor inventory",unit:"vendors",path:"trackerFootprintBreakdown.vendors"},
  {id:"inventory.cookies",label:"Distinct cookie inventory",unit:"cookies",path:"storageEvidenceSummary.distinctCookieCount"},
  {id:"inventory.unclassified_requests",label:"Unclassified external requests returned",unit:"requests",path:"unclassifiedExternalRequests.cap.total"},
  {id:"forms.observed",label:"Forms observed",unit:"forms",path:"formsSummary.totalObserved"},
  {id:"accessibility.failed_rules",label:"Accessibility failed rules",unit:"rules",path:"accessibilityAudit.failedRuleCount"},
  {id:"accessibility.affected_nodes",label:"Accessibility affected nodes",unit:"nodes",path:"accessibilityAudit.affectedNodeCount"},
  {id:"accessibility.review_rules",label:"Accessibility manual-review rules",unit:"rules",path:"accessibilityAudit.reviewRuleCount"},
  ...["accept","reject"].flatMap(action=>[
    {id:`${action}.requests`,label:`${action} after-click requests`,unit:"requests",path:`${action==="accept"?"postAcceptObservation":"postRefusalObservation"}.afterAction.requestCount`},
    {id:`${action}.storage_writes`,label:`${action} after-click storage writes`,unit:"writes",path:`${action==="accept"?"postAcceptObservation":"postRefusalObservation"}.afterAction.storageWriteCount`},
  ]),
  ...[
    ["site.links_inspected","Site-integrity links inspected","links"],
    ["site.link_evidence","Site-integrity link evidence retained","links"],
    ["technology.detections","Technology detections returned","detections"],
    ["technology.matches","Technology advisory matches returned","matches"],
    ["graph.nodes","Relationship graph node reference count","nodes"],
    ["graph.edges","Relationship graph edge reference count","edges"],
    ["form.events","Form-destination trace events","events"],
  ].map(([id,label,unit])=>({id:id!,label:label!,unit:unit!,path:"sealed_projection_only"})),
];
const CHECK_GROUPS:Record<string,string>={
  consent_surface_observed:"Consent & CMP",cmp_framework_signal_observed:"Consent & CMP",consent_optional_defaults_on:"Consent & CMP",
  consent_choice_quality:"Consent & CMP",preference_withdrawal_control:"Consent & CMP",accessibility_consent_controls:"Accessibility",
  public_collection_surfaces:"Forms",
  cookie_notice_policy_availability:"Policies",outdated_transfer_framework_reference:"Policies",post_reject_tracking_reduction:"After Reject",
};
export function checklistGroup(id:string){return id.startsWith("transport_security_")?"Connection security":CHECK_GROUPS[id]??"Tracking & embeds";}
export function evidenceProgress(report:Obj,checklist:Obj[],covered:ReadonlySet<string>){
  const states:Record<string,string>={},measurements:Record<string,number>={},metricLabels:Record<string,string>={};
  for(const m of EVIDENCE_METRICS)states[m.id]="unavailable";
  // Preserve returned customer status. A transport concern can have evidenceState
  // observed while status is Gap observed: it must not become a positive check.
  for(const r of checklist){
    if(typeof r.id!=="string"||!/^[a-z0-9_]{1,100}$/.test(r.id))continue;
    const key=`checklist.${r.id}`;states[key]=checklistEvidence(r);
    states[`verdict.${r.id}`]=state(r.status);metricLabels[`verdict.${r.id}`]=`${r.label??r.id} · returned verdict`;
    metricLabels[key]=typeof r.label==="string"?r.label.slice(0,180):r.id.replaceAll("_"," ");
  }
  for(const action of ["accept","reject"]){
    const o=obj(report[action==="accept"?"postAcceptObservation":"postRefusalObservation"]);
    states[`detail.${action}.verdict`]=state(o.verdict);
    states[`detail.${action}.reason`]=state(o.indeterminateReason);
    if(o.evidenceDisposition==="confirmed"&&o.indeterminateReason==null)states[`detail.${action}.reason`]="not_indeterminate";
    states[`detail.${action}.stop`]=state(obj(o.afterAction).stopReason);
    if(typeof o.productionProjectable==="boolean")states[`detail.${action}.projectable`]=o.productionProjectable?"projectable":"not_projectable";
  }
  const g=obj(report.gpcResponse),observation=obj(g.observation),registration=obj(observation.registration),ack=obj(observation.acknowledgment);
  states["detail.gpc.response"]=state(g.status);
  states["detail.gpc.semantic_probe"]=state(observation.semanticProbe);
  states["detail.gpc.acknowledgment"]=ack.observed===true?"observed":ack.observed===false&&ack.captureComplete===true?"not_observed":Object.keys(ack).length?"unknown":"unavailable";
  for(const k of ["sale","sharing"])states[`detail.gpc.${k}`]=state(registration[k]);
  states["detail.gpc.activity_comparison"]=state(obj(g.activityComparison).status);
  const forms=obj(report.formsSummary);
  states["detail.forms.count"]=state(forms.countStatus);states["detail.forms.before"]=state(forms.preConsentCapture);states["detail.forms.after"]=state(forms.afterAcceptCapture);
  states["detail.storage.classification"]=state(obj(obj(report.executiveSummary).preConsentStorageAssessment).status);
  for(const [id,key]of Object.entries({cookies:"cookieStorageInventory",vendors:"trackerVendorInventory",requests:"requestEvidenceInventory",findings:"projectedFindings",policy:"policySurfaceCoverage"})){
    const cap=obj(obj(report[key]).cap);if(typeof cap.truncated==="boolean"){const items=obj(report[key]).items;const inconsistent=Array.isArray(items)&&Number.isInteger(cap.total)&&cap.total<items.length;states[`detail.inventory.${id}`]=inconsistent?"inconsistent_cap":cap.truncated?"truncated":"not_truncated";}
  }
  const host=obj(obj(report.coverageDiagnostics).navigationSummary).landedOnDifferentHost;
  if(typeof host==="boolean")states["detail.navigation.host"]=host?"different_host":"same_host";
  for(const q of QUANTITIES){const n=count(q.path.split(".").reduce((v:any,k)=>obj(v)[k],report));if(n!==undefined&&!(q.id.startsWith("accessibility.")&&obj(report.accessibilityAudit).required===false))measurements[q.id]=n;}
  const paired = pairedGpcAudit(report); Object.assign(states, paired.states); Object.assign(measurements, paired.measurements);
  return {states,measurements,metricLabels};
}
export function evidenceMetricRegistry(rows:ProgressRow[]):Metric[]{
  const labels=new Map<string,string>();for(const row of rows)for(const [id,label]of Object.entries(row.metricLabels??{}))labels.set(id,label);
  return [...EVIDENCE_METRICS,...[...labels].sort(([a],[b])=>a.localeCompare(b)).map(([id,label])=>({id,label,group:checklistGroup(id.replace(/^(checklist|verdict)\./,"")),denominator,success:[]}))];
}
/** Already-persisted projections only. Reference counts do not verify deferred bytes. */
export function sealedEvidenceProgress(runtime:Obj,scanId:string,bundleHash:string|undefined){
  const states:Record<string,string>={},measurements:Record<string,number>={};
  const specs=[
    ["site_integrity","siteIntegrity",siteIntegrityProjectionSchema],
    ["technology","cmsSecurity",cmsSecurityProjectionSchema],
    ["form_destinations","formDestinations",formDestinationProjectionSchema],
    ["relationships","runtimeEvidenceGraphProjection",apiRuntimeEvidenceGraphProjectionSchema],
  ] as const;
  for(const [id,key,schema]of specs){
    const metric=`detail.sealed.${id}`,raw=runtime[key];states[metric]="unavailable";
    if(raw===undefined||raw===null)continue;
    const parsed=schema.safeParse(raw),p=parsed.success?parsed.data as Obj:null;
    if(!p||p.scanId!==scanId||!bundleHash||!/^[a-f0-9]{64}$/.test(bundleHash)||(id==="relationships"?p.sourceBundle?.sha256:p.sourceHash)!==bundleHash){states[metric]="unverified_projection";continue;}
    if(id==="site_integrity"){
      states[metric]=p.observation.truncated?"verified_bounded_capture":"verified_capture";
      measurements["site.links_inspected"]=p.observation.inspectedLinks;measurements["site.link_evidence"]=p.observation.links.length;
    }else if(id==="technology"){
      states[metric]="verified_projection";measurements["technology.detections"]=p.assessment.detections.length;measurements["technology.matches"]=p.assessment.matches.length;
    }else if(id==="form_destinations"){
      states[metric]=p.trace.coverage.truncated?"verified_bounded_trace":"verified_trace";measurements["form.events"]=p.trace.events.length;
    }else{
      states[metric]=p.details?"deferred_reference_metadata":p.graphs.length?"inline_projection":p.status==="unavailable"?"unavailable":"no_inline_graphs";
      if(p.details){measurements["graph.nodes"]=p.details.nodeCount;measurements["graph.edges"]=p.details.edgeCount;}
      else if(p.graphs.length){measurements["graph.nodes"]=p.graphs.reduce((n:number,g:Obj)=>n+g.nodes.length,0);measurements["graph.edges"]=p.graphs.reduce((n:number,g:Obj)=>n+g.edges.length,0);}
    }
  }
  return {states,measurements};
}
export function summarizeQuantities(rows:ProgressRow[]){
  return Object.fromEntries(QUANTITIES.map(q=>{
    const values=rows.filter(r=>r.reportable).map(r=>r.measurements?.[q.id]).filter((n):n is number=>count(n)!==undefined).sort((a,b)=>a-b),n=values.length;
    return [q.id,{measured:n,eligible:rows.filter(r=>r.reportable).length,total:n?values.reduce((a,b)=>a+b,0):null,median:n?(values[Math.floor((n-1)/2)]!+values[Math.ceil((n-1)/2)]!)/2:null}];
  }));
}
export function quantityCsv(days:any[]):string{
  const quote=(v:any)=>'"'+String(v??"").replaceAll('"','""')+'"';
  const lines=["date,quantity,unit,measured,eligible,median,total"];
  for(const day of days)for(const q of QUANTITIES){const v=day.quantities[q.id];lines.push([day.date,q.id,q.unit,v.measured,v.eligible,v.median,v.total].map(quote).join(","));}
  return lines.join("\n")+"\n";
}
export { COVERAGE_MAP } from "./audit-progress-coverage";

/** Register every verified canonical checklist ID even when an older audit/export omitted it. */
export function retainedEvidenceMetricRegistry(rows:ProgressRow[]):Metric[]{
 return evidenceMetricRegistry(rows.map(row=>({...row,metricLabels:row.retainedMetricLabels??{}}))).filter(m=>/^(checklist|verdict)\./.test(m.id));
}
