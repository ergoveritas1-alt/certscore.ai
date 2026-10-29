import { checklistEvidence, returnedState, publicSource } from './audit-progress-contracts';
/** Historical public canonical exports: report what was returned, never re-score. */
import { choicePathExecutionSchema } from "../../packages/certscore-contracts/src/choice-path-execution";
import { evidenceProgress, QUANTITIES } from "./audit-progress-evidence";
import { semanticRegistrationStatus, terminalDecisionStatus } from "./audit-progress-registration";
import { METRICS, TOPIC_ROWS, PRIMARY_CHECKLIST_IDS, arr, obj, accessibilityProgress, type Obj, type ProgressRow } from "./audit-progress";

export function exportedState(row:Obj|undefined):string {
  return checklistEvidence(row);
}
export function exportIsTest(report:Obj):boolean {
  const host=String(report.domain??"").toLowerCase().replace(/^www\./,"");
  if(host==="ergoveritas.com"||host==="localhost"||host.endsWith(".test")||host.endsWith(".invalid"))return true;
  const c=obj(report.calibrationContext);
  return c.isCanary===true||c.isSynthetic===true||["canary","synthetic","fixture","diagnostic","test"].includes(c.trafficClass);
}
export function extractExportRow(report:Obj,ref:ProgressRow["refs"][number]):ProgressRow {
  const id=report.scanId;
  if(!/^[a-f0-9-]{36}$/i.test(id)||report.scan_id&&report.scan_id!==id)throw Error("Export identity mismatch");
  const createdAt=new Date(obj(report.timestamps).createdAt).toISOString();
  const metricSources:Record<string,string>={};
  const states:Record<string,string>={};for(const m of METRICS)states[m.id]="unavailable";
  const noGo=report.resultDisposition==="no_go",completed=["completed","completed_limited"].includes(report.scanStatus),reportable=completed&&!noGo;
  states.outcome=noGo?"no_go":report.scanStatus==="completed_limited"?"usable_limited":report.scanStatus==="completed"?"usable_complete":["failed","expired"].includes(report.scanStatus)?"failed_or_expired":"in_progress";
  states.evidence="cached_canonical_export";
  // An export alone does not prove current publication or original worker profile.
  delete states.publication;
  const checklist=arr(obj(report.gdprEprivacyChecklistRows).items),first=obj(obj(report.consentSurfaceEvidence).firstLayerConsentChoices);
  for(const [name,field] of Object.entries({accept:"acceptControlObserved",reject:"rejectControlObserved",options:"managePreferencesControlObserved"})){
    if(!reportable){delete states[`control.${name}`];continue;}
    const captured=first.capturedBeforeInteraction===true&&first.layerInspected==="first_layer";
    states[`control.${name}`]=first[field]===true&&captured?"observed":first[field]===false&&first.controlInventoryComplete===true&&captured?"not_observed":field in first?"unknown":"unavailable";
  }
  if(!reportable)delete states["control.privacyOptOut"];
  for(const [id,key] of Object.entries(TOPIC_ROWS))if(reportable)states[key]=exportedState(checklist.find(r=>r.id===id));else delete states[key];
  for(const name of ["accept","reject"]){
    const observation=obj(report[name==="accept"?"postAcceptObservation":"postRefusalObservation"]),execution=choicePathExecutionSchema.safeParse(observation.execution);
    states[`execution.${name}`]=execution.success?execution.data.status:observation.execution===undefined?"unavailable":"unsupported_schema";
    states[`click.${name}`]=execution.success?(execution.data.clickCompleted?"completed":["not_attempted","unsupported"].includes(execution.data.status)?execution.data.status:"incomplete"):observation.execution===undefined?"unavailable":"unsupported_schema";
    if(execution.success&&execution.data.clickCompleted){
      states[`registration.${name}`]=semanticRegistrationStatus(observation)==="not_checked"?"unavailable":semanticRegistrationStatus(observation);
      metricSources[`registration.${name}`]="export_semantic_registration";
      states[`terminal.${name}`]=terminalDecisionStatus(observation,name as "accept"|"reject")==="not_checked"?"unavailable":terminalDecisionStatus(observation,name as "accept"|"reject");
    }else {delete states[`registration.${name}`];delete states[`terminal.${name}`];}
  }
  const gpc=obj(report.gpcResponse),observation=obj(gpc.observation),delivery=obj(observation.delivery);
  if(reportable){states.gpc_path=observation.status??"unavailable";states.gpc_delivery=delivery.httpHeaderRetained===true&&delivery.mainNavigatorReadbackRetained===true?"verified":Object.keys(delivery).length?"unverified":"unavailable";}
  else {delete states.gpc_path;delete states.gpc_delivery;}
  const projected=obj(report.projectedFindings),findingInventory=reportable&&Array.isArray(projected.items)&&obj(projected.cap).truncated===false && (!Number.isInteger(obj(projected.cap).total)||obj(projected.cap).total===projected.items.length) && (!Number.isInteger(obj(projected.cap).returned)||obj(projected.cap).returned===projected.items.length);
  const findings=reportable?arr(projected.items).map(f=>({id:String(f.id),label:String(f.label),family:/accessibility|wcag|contrast/i.test(String(f.id))?"accessibility":"other",top:null})):[];
  if(reportable){
    Object.assign(states,accessibilityProgress(obj(report.accessibilityAudit)));
    states.gpc_finding=findings.some(f=>/gpc/i.test(f.id))?"observed":findingInventory&&observation.status==="complete"?"no_finding_returned":"unknown";
    states.cmp_provider=returnedState(obj(report.executiveSummary).consentPlatform);
    if(report.accessibilityAudit&&obj(report.accessibilityAudit).required!==false)states.accessibility=obj(report.accessibilityAudit).status??"not_checked";else if(obj(report.accessibilityAudit).required===false) for(const key of Object.keys(states))if(key==="accessibility"||key.startsWith("accessibility."))delete states[key];
  }else {delete states.gpc_finding;delete states.cmp_provider;delete states.accessibility;}
  if(!reportable)for(const key of Object.keys(states))if(key.startsWith("accessibility."))delete states[key];
  const supplement=reportable?evidenceProgress(report,checklist,PRIMARY_CHECKLIST_IDS):{states:{},measurements:{},metricLabels:{}};
  Object.assign(states,supplement.states);
  const context=obj(report.calibrationContext),meta=obj(report.meta);
  const source=publicSource(report);
  for(const key of Object.keys(states)){
    let scope='';
    if(/^(execution|click|registration|terminal|detail\.(accept|reject))\./.test(key)){const action=key.includes('reject')?'postRefusalObservation':'postAcceptObservation';const o=obj(report[action]);scope='/'+String(o.contractVersion??'legacy')+'/'+String(o.execution?.policyVersion??'unavailable')+'/'+String(o.assessmentVersion??o.policyVersion??'legacy');}
    if(key.includes('gpc'))scope='/'+String(gpc.contractVersion??'unavailable')+'/'+String(observation.contractVersion??'unavailable');
    if(key.startsWith('accessibility'))scope='/'+String(report.accessibilityAudit?.engine??'unknown')+'/'+String(report.accessibilityAudit?.engineVersion??'unknown')+'/'+String(report.accessibilityAudit?.scope??'unknown');
    metricSources[key]=source+scope;
  }
  for(const {id:q} of QUANTITIES)metricSources[q]=source+(q.startsWith('accessibility.')?'/'+String(report.accessibilityAudit?.engine??'unknown')+'/'+String(report.accessibilityAudit?.engineVersion??'unknown')+'/'+String(report.accessibilityAudit?.scope??'unknown'):'');
  for(const key of Object.keys(metricSources))if(metricSources[key]===source)delete metricSources[key];
  metricSources.findings=source+'/'+String(meta.canonicalResolverVersion??'unknown');
  return {scanId:id,site:String(report.domain??"unknown"),createdAt,region:String(context.scanFrom??"unknown"),producer:"not retained in public export",profile:"not retained in public export",assessmentVersion:String(meta.projectionVersion??"unknown"),projectionVersion:String(meta.reportProjectionVersion??"unknown"),originRequestId:"archive folder provenance; original credential not independently verified",states,defaultSource:source,metricSources,measurements:supplement.measurements,metricLabels:supplement.metricLabels,findings,findingInventory,topInventory:false,reportable,refs:[ref]};
}
