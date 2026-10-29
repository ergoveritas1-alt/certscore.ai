import { progressEngine } from './audit-progress-engine';
import { namespaceSealed } from './audit-progress-contracts';
/** CertScore.ai audit-only daily reporting. No scoring, inference or product writes. */
import { choicePathExecutionSchema } from "../../packages/certscore-contracts/src/choice-path-execution";
import { evidenceProgress, sealedEvidenceProgress, summarizeQuantities, QUANTITIES } from "./audit-progress-evidence";
import { semanticRegistrationStatus, terminalDecisionStatus } from "./audit-progress-registration";
import type { BotOrigin } from "./audit-bot-origin";
export const PROGRESS_VERSION = "certscore.mac-mini-daily-progress.v5";
export const TIMEZONE = "America/Los_Angeles";
export type Obj = Record<string, any>;
export const obj = (v: any): Obj => v && typeof v === "object" && !Array.isArray(v) ? v : {};
export const arr = (v: any): Obj[] => Array.isArray(v) ? v : [];
export type Metric = { id: string; label: string; group: string; denominator: string; success: string[] };
export const METRICS: Metric[] = [
  {id:"outcome",label:"Scan outcome",group:"Outcomes",denominator:"Cohort scans/attempts; historical exports omit missing attempts",success:["usable_complete","usable_limited"]},
  ...["accept","reject","options","privacyOptOut"].map(id=>({id:`control.${id}`,label:`${id==="privacyOptOut"?"Opt-out":id[0]!.toUpperCase()+id.slice(1)} control presence`,group:"Controls",denominator:"Readable reportable scans, including unavailable first-layer evidence",success:["observed"]})),
  ...["accept","reject"].flatMap(id=>[
    {id:`execution.${id}`,label:`${id} verified execution`,group:"A/R paths",denominator:"Cohort scans/attempts; historical exports omit missing attempts; missing evidence stays not checked",success:["succeeded","succeeded_with_confirmation"]},
    {id:`click.${id}`,label:`${id} click completion`,group:"A/R paths",denominator:"Cohort scans/attempts; historical exports omit missing attempts; not attempted is separate",success:["completed"]},
    {id:`registration.${id}`,label:`${id} registration`,group:"A/R paths",denominator:"Retained completed clicks; initial semantic registration, not terminal operational confirmation",success:["confirmed"]},
    {id:`terminal.${id}`,label:`${id} terminal decision verification`,group:"A/R paths",denominator:"Retained completed clicks; missing terminal witness remains not checked",success:["verified"]}]),
  {id:"privacy_policy",label:"Privacy notice checklist evidence",group:"Policies",denominator:"Readable reportable scans; link evidence does not establish full policy capture",success:["observed"]},
  {id:"policy_fetch",label:"Policy-source fetch",group:"Policies",denominator:"Original source metadata available; unknown is separate from failed",success:["fetched"]},
  {id:"policy_full_text",label:"Full privacy text retained",group:"Policies",denominator:"Original source and local byte receipts available; exported links alone do not qualify",success:["verified_full_text"]},
  {id:"policy_owner",label:"Usable target-owned policy candidate",group:"Policies",denominator:"Producer-declared role and ownership; independent governing-policy review is separate",success:["producer_declared_usable"]},
  ...["controller_contact","processing_purposes","legal_basis","recipients_or_vendor_categories","data_retention","data_subject_rights","international_transfers","dpo_contact","supervisory_authority","automated_decision_making_or_profiling"].map(id=>({id:`topic.${id}`,label:id.replaceAll("_"," "),group:"GDPR transparency",denominator:"Readable reportable scans; canonical retained topic states",success:["observed"]})),
  {id:"gpc_path",label:"GPC observation",group:"GPC",denominator:"Readable reportable scans; GPC absence remains unavailable",success:["complete"]},
  {id:"gpc_delivery",label:"GPC header and navigator retained",group:"GPC",denominator:"Readable reportable scans; GPC absence remains unavailable",success:["verified"]},
  {id:"gpc_finding",label:"Explicit canonical GPC finding",group:"GPC",denominator:"Readable reportable scans; sufficient observation required for no finding",success:["observed"]},
  {id:"accessibility",label:"Accessibility assessment",group:"Accessibility",denominator:"Required accessibility audits on readable reportable scans",success:["completed"]},
  {id:"accessibility.results",label:"Accessibility rule results retained",group:"Accessibility",denominator:"Required audits on readable reports; zero findings is a measured result",success:["rule_results_retained"]},
  {id:"accessibility.review",label:"Accessibility manual-review items",group:"Accessibility",denominator:"Readable reportable scans except explicitly nonrequired audits; missing counts remain unavailable",success:["review_items_present"]},
  {id:"accessibility.examples",label:"Accessibility example retention",group:"Accessibility",denominator:"Readable reportable scans except explicitly nonrequired audits; missing example coverage remains unavailable",success:["all_examples_retained"]},
  {id:"accessibility.coverage",label:"Accessibility result availability",group:"Accessibility",denominator:"Required audits; limited results are separated from unavailable results",success:["completed_with_results","limited_with_results"]},
  {id:"cmp_provider",label:"CMP provider",group:"CMP",denominator:"Readable reportable scans; recognition is not action support",success:[]},
  {id:"cmp_dispatch",label:"CMP inventory worker",group:"CMP",denominator:"Cohort scans/attempts; historical exports omit missing attempts; intentionally omitted is separate",success:["dispatch_recorded"]},
  {id:"publication",label:"Report publication",group:"Publication & evidence",denominator:"Completed captures",success:["verified_ready"]},
  {id:"evidence",label:"Hash-verified public export retained",group:"Publication & evidence",denominator:"Cohort scans/attempts; historical exports omit missing attempts",success:["cached_canonical_export"]},
];
export const TOPIC_ROWS: Record<string,string> = {privacy_notice_availability:"privacy_policy",controller_contact_disclosure:"topic.controller_contact",processing_purposes_disclosure:"topic.processing_purposes",legal_basis_disclosure_observed:"topic.legal_basis",recipients_vendor_categories_disclosure:"topic.recipients_or_vendor_categories",retention_disclosure_observed:"topic.data_retention",data_subject_rights_disclosure:"topic.data_subject_rights",international_transfers_disclosure:"topic.international_transfers",dpo_contact_point_disclosure:"topic.dpo_contact",supervisory_authority_complaint_disclosure:"topic.supervisory_authority",automated_decision_making_profiling_disclosure:"topic.automated_decision_making_or_profiling"};
export const PRIMARY_CHECKLIST_IDS = new Set(Object.keys(TOPIC_ROWS));
export type ProgressRow = { scanId:string; site:string; createdAt:string; region:string; producer:string; profile:string; assessmentVersion:string; projectionVersion:string; originRequestId:string; states:Record<string,string>; defaultSource?:string; metricSources?:Record<string,string>; topInventory?:boolean; originProof?:string; measurements?:Record<string,number>; metricLabels?:Record<string,string>; findings:{id:string;label:string;family:string;top:boolean|null}[]; findingInventory:boolean; reportable:boolean; refs:{file:string;sha256:string;role:string}[] };
export function accessibilityProgress(a:Obj):Record<string,string> {
  const measured=Number.isInteger(a.failedRuleCount)&&a.failedRuleCount>=0;
  const examples=obj(a.exampleCoverage),review=Number.isInteger(a.reviewRuleCount)&&a.reviewRuleCount>=0;
  return {"accessibility.results":measured?"rule_results_retained":"unavailable",
    "accessibility.review":review?a.reviewRuleCount>0?"review_items_present":"none_returned":"unavailable",
    "accessibility.examples":Number.isInteger(examples.omittedNodeCount)&&examples.omittedNodeCount>=0?examples.omittedNodeCount>0?"bounded_examples_omitted":"all_examples_retained":"unavailable",
    "accessibility.coverage":measured?(a.status==="completed"?"completed_with_results":a.status==="limited"?"limited_with_results":"results_with_"+String(a.status??"unknown_status")):["failed","not_testable","limited"].includes(a.status)?a.status==="limited"?"limited_without_results":a.status:"unavailable"};
}
export function mergeVerifiedProgress(archive:ProgressRow,verified:ProgressRow):ProgressRow {
  if(archive.scanId!==verified.scanId||verified.states.evidence!=="generation_matched")throw Error("Generation-matched identical scan required");
  const sealed=namespaceSealed(verified);
  // Preserve both interpretations. Never overwrite even a missing public value.
  return {...archive,states:{...archive.states,...sealed.states},metricSources:{...archive.metricSources,...sealed.metricSources},measurements:{...archive.measurements,...sealed.measurements}};
}
export function cohortDecision(origin:BotOrigin|undefined, inventory:Obj, bundle?:Obj):string {
  const target = String(bundle?.url??inventory.url??"");
  const localTest = /^(?:test|synthetic|fixture|diagnostic|internal|canary|routine_canary)$/.test(String(inventory.traffic_class)) || obj(inventory.lambda_config).localOnly===true || obj(inventory.lambda_config).simulatedLocalLambda===true;
  let testTarget=false;
  try { const u=new URL(target);testTarget=u.pathname.startsWith("/.well-known/certscore-canary/") || /^(?:www\.)?ergoveritas\.com$/i.test(u.hostname)&&/^\/test[123]\.html$/i.test(u.pathname); }catch{}
  if(origin?.isCanary||localTest||testTarget)return "excluded_canary_or_test";
  if(origin?.isMacMini===true&&origin.originalRequestId)return "included";
  return origin?.isMacMini===false?"excluded_other_origin":"origin_unverified";
}
export function extractProgressRow(input:{inventory:Obj;origin:BotOrigin;record?:Obj|null;report?:Obj|null;bundle?:Obj;sourceFacts?:Obj;refs:ProgressRow["refs"];exportState:string}):ProgressRow {
  const {inventory:i,origin,record,report,bundle,sourceFacts}=input, c=obj(record?.canonicalReportProjection), snapshot=obj(record?.snapshot), runtime=obj(record?.runtimeArtifacts);
  const states:Record<string,string>={};for(const metric of METRICS)states[metric.id]="unavailable";
  const noGo=obj(runtime.scan_no_go_assessment??runtime.scanNoGoAssessment??snapshot.scan_no_go_assessment).decision==="no_go" || report?.resultDisposition==="no_go";
  const terminal=origin.publicationRequestStatus==="terminal_failure";
  const rawStatus=String(i.status);
  const reportable=Boolean(record&&!terminal&&!noGo&&["completed","completed_limited"].includes(rawStatus));
  states.outcome=terminal?"publication_failed":["failed","expired","cancelled","canceled"].includes(rawStatus)?"failed_or_expired":noGo?"no_go":record?(report?.scanStatus==="completed_limited"||obj(report?.accessibilityAudit).status==="limited"?"usable_limited":"usable_complete"):["completed","completed_limited"].includes(rawStatus)?"awaiting_publication":"in_progress";
  states.evidence=input.exportState;
  if(["completed","completed_limited"].includes(rawStatus))states.publication=terminal?"terminal_failure":record?"verified_ready":"unavailable_or_unverified";
  else delete states.publication;
  const assessment=obj(snapshot.consentControlAssessment??runtime.consentControlAssessment??snapshot.consent_control_assessment);
  for(const name of ["accept","reject","options","privacyOptOut"]){
    if(!reportable){delete states[`control.${name}`];continue;}
    const value=obj(obj(assessment.controls)[name]).state;
    states[`control.${name}`]=["observed","not_observed","unknown"].includes(value)?value:"unavailable";
  }
  for(const name of ["accept","reject"]){
    const p=obj(runtime[name==="accept"?"postAcceptEvidenceProjection":"postRefusalEvidenceProjection"]), execution=obj(p.execution);
    const facts=obj(obj(sourceFacts?.actions)[name]);
    const valid=choicePathExecutionSchema.safeParse(execution).success;
    states[`execution.${name}`]=valid?execution.status:"unavailable";
    states[`click.${name}`]=valid?(execution.clickCompleted?"completed":execution.status==="not_attempted"||execution.status==="unsupported"?execution.status:"incomplete"):facts.packet==="verified"?(facts.click==="completed"?"completed":facts.click==="not_attempted"?"not_attempted":"unknown"):"unavailable";
    if(states[`click.${name}`]==="completed"){
      states[`registration.${name}`]=semanticRegistrationStatus({registrationStatus:p.registrationStatus??facts.registration}).replace("not_checked","unavailable");
      states[`terminal.${name}`]=terminalDecisionStatus(p,name as "accept"|"reject").replace("not_checked","unavailable");
    }else {delete states[`registration.${name}`];delete states[`terminal.${name}`];}
  }
  const checklist=arr(c.checklistRows);
  for(const [id,key] of Object.entries(TOPIC_ROWS)){
    if(!reportable){delete states[key];continue;}
    const row=checklist.find(row=>row.id===id);
    states[key]=row&&typeof row.evidenceState==="string"?row.evidenceState:"unavailable";
  }
  const sourceFacet=obj(sourceFacts?.facets), gpc=obj(runtime.gpcResponseAssessment), observation=obj(gpc.observation), delivery=obj(observation.delivery);
  if(obj(i.lambda_config).gpcObservationEnabled===true){
    states.gpc_path=observation.status??obj(sourceFacet.gpc_observation).state??"unavailable";
    states.gpc_delivery=delivery.httpHeaderRetained===true&&delivery.mainNavigatorReadbackRetained===true?"verified":obj(sourceFacet.gpc_delivery).state??"unavailable";
  }else{delete states.gpc_path;delete states.gpc_delivery;}
  states.cmp_dispatch=obj(sourceFacet.cmp_dispatch).state??"unavailable";
  if(reportable){
    const support=obj(obj(assessment.cmpAudit).support);states.cmp_provider=typeof support.provider==="string"?support.provider:"unknown";
    states.accessibility=obj(report?.accessibilityAudit).status??"unavailable";
    Object.assign(states,accessibilityProgress(obj(report?.accessibilityAudit)));
    if(obj(report?.accessibilityAudit).required===false)for(const key of Object.keys(states))if(key==="accessibility"||key.startsWith("accessibility."))delete states[key];
  }else{delete states.cmp_provider;delete states.accessibility;delete states.gpc_finding;}
  if(reportable)for(const check of arr(obj(assessment.cmpAudit).rows)){if(typeof check.id==="string"&&/^[a-z_]{1,64}$/.test(check.id))states[`cmp_check.${check.id}`]=typeof check.status==="string"?check.status:"unavailable";}
  const findingInventory=reportable&&Array.isArray(c.globalUnifiedFindings);
  const tops=new Set(Array.isArray(c.topFindingIds)?c.topFindingIds:[]);
  if(!reportable)for(const key of Object.keys(states))if(key.startsWith("accessibility."))delete states[key];
  const findings=findingInventory?arr(c.globalUnifiedFindings).filter(f=>obj(f.surfacingDecision).reportable===true&&obj(f.presentationDecision).status==="surface").map(f=>({id:String(f.unifiedFindingId),label:String(f.title),family:String(obj(f.details).family??obj(f.surfacingDecision).family??"other"),top:tops.has(f.unifiedFindingId)||arr(obj(f.topFindingEligibility).candidateTopFindingIds).some(id=>tops.has(id))})):[];
  if(reportable)states.gpc_finding=findings.some(f=>/gpc/i.test(f.id))?"observed":findingInventory&&states.gpc_path==="complete"?"no_finding_returned":"unknown";
  const supplement=reportable?evidenceProgress(report??{},checklist,PRIMARY_CHECKLIST_IDS):{states:{},measurements:{},metricLabels:{}};
  Object.assign(states,supplement.states);
  if(reportable){const sealed=sealedEvidenceProgress(runtime,i.id,input.refs.find(r=>r.role==="scanArtifactUri")?.sha256);Object.assign(states,sealed.states);Object.assign(supplement.measurements,sealed.measurements);}
  return {scanId:i.id,site:String(i.hostname??"unknown"),createdAt:new Date(i.created_at).toISOString(),region:String(i.scan_from??"unknown"),producer:String(bundle?.scannerBuildProvenance?.gitSha??"unknown"),profile:String(sourceFacts?.profile??"unknown"),assessmentVersion:String(assessment.provenance?.projectorVersion??assessment.artifactVersion??"unknown"),projectionVersion:String(snapshot.report_projection_version??"unknown"),originRequestId:origin.originalRequestId!,states,metricSources:Object.fromEntries(Object.keys(states).map(key=>[key,key.startsWith("click.")&&!choicePathExecutionSchema.safeParse(obj(runtime[key.endsWith("accept")?"postAcceptEvidenceProjection":"postRefusalEvidenceProjection"]).execution).success?"original_packet_fallback":"persisted_projection"])),measurements:supplement.measurements,metricLabels:supplement.metricLabels,findings,findingInventory,reportable,refs:input.refs};
}
const dayFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"});
export function localDay(value:string|number):string {
  const p=dayFormatter.formatToParts(new Date(value));return ["year","month","day"].map(k=>p.find(v=>v.type===k)!.value).join("-");
}
export const nextDay=(day:string)=>new Date(Date.parse(day+"T12:00:00Z")+86400000).toISOString().slice(0,10);
export function midnightUtc(day:string):number {
  let lo=Date.parse(day+"T00:00:00Z")-43200000,hi=lo+172800000;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(localDay(mid)<day)lo=mid+1;else hi=mid;}return lo;
}
export type CoverageWindow = {start:string;end:string;completeInventory?:boolean};
export function inventoryHours(day:string, windows:CoverageWindow[]):number {
  const lo=midnightUtc(day),hi=midnightUtc(nextDay(day));let cursor=lo,total=0;
  for(const w of windows.filter(w=>w.completeInventory!==false).map(w=>({start:Math.max(lo,Date.parse(w.start)),end:Math.min(hi,Date.parse(w.end))})).sort((a,b)=>a.start-b.start)){const start=Math.max(cursor,w.start);if(w.end>start){total+=w.end-start;cursor=w.end;}}return total/3600000;
}
export function coveredDay(day:string, windows:CoverageWindow[]):boolean {
  let cursor=midnightUtc(day);const end=midnightUtc(nextDay(day));
  for(const w of windows.filter(w=>w.completeInventory!==false).map(w=>({start:Date.parse(w.start),end:Date.parse(w.end)})).sort((a,b)=>a.start-b.start)){
    if(w.end<=cursor)continue;if(w.start>cursor)return false;cursor=Math.max(cursor,w.end);if(cursor>=end)return true;
  }return false;
}
export function summarizeDays(rows:ProgressRow[],windows:CoverageWindow[],metricsList=METRICS){
  if(!windows.length||windows.some(w=>!Number.isFinite(Date.parse(w.start))||!Number.isFinite(Date.parse(w.end))||Date.parse(w.start)>=Date.parse(w.end)))throw Error("Valid coverage windows required");
  const seen=new Set<string>();for(const row of rows){if(seen.has(row.scanId))throw Error("Duplicate bot scan ID; reconcile overlap first");seen.add(row.scanId);}
  const first=localDay(Math.min(...windows.map(w=>Date.parse(w.start)))),last=localDay(Math.max(...windows.map(w=>Date.parse(w.end)-1)));
  const result:any[]=[];
  for(let day=first;day<=last;day=nextDay(day)){
    const selected=rows.filter(row=>localDay(row.createdAt)===day),metrics:Record<string,any>={};
    const complete=coveredDay(day,windows);
    for(const metric of metricsList){
      const eligible=selected.filter(row=>row.states[metric.id]!==undefined),counts:Record<string,number>={};
      for(const row of eligible){const value=row.states[metric.id]!;counts[value]=(counts[value]??0)+1;}
      const numerator=metric.success.reduce((n,key)=>n+(counts[key]??0),0),denominator=eligible.length,rate=denominator&&metric.success.length?100*numerator/denominator:null;
      const previous=result.at(-1),before=previous?.metrics[metric.id],stateDeltaPp:Record<string,number|null>={};
      for(const key of new Set([...Object.keys(counts),...Object.keys(before?.counts??{})]))stateDeltaPp[key]=denominator&&before?.denominator?100*(counts[key]??0)/denominator-100*(before.counts[key]??0)/before.denominator:null;
      metrics[metric.id]={counts,stateDeltaPp,numerator,denominator,rate,deltaPp:rate!==null&&before?.rate!=null?rate-before.rate:null,comparison:!previous?"baseline":!complete||!previous.completeDay?"partial_day":!denominator||!before?.denominator?"no_comparable_denominator":"descriptive_day_over_day"};
    }
    result.push({date:day,completeDay:complete,inventoryHours:inventoryHours(day,windows),sampleOnly:!complete,attempts:selected.length,uniqueSites:new Set(selected.map(row=>row.site)).size,reportable:selected.filter(row=>row.reportable).length,regions:[...new Set(selected.map(row=>row.region))],producers:[...new Set(selected.map(row=>row.producer))],profiles:[...new Set(selected.map(row=>row.profile))],metrics,quantities:summarizeQuantities(selected)});
  }
  return progressEngine().aggregate({days:result,metrics:metricsList,quantities:QUANTITIES},rows);
}
