/** Historical public canonical exports: report what was returned, never re-score. */
import { choicePathExecutionSchema } from "../../packages/certscore-contracts/src/choice-path-execution";
import { evidenceProgress } from "./audit-progress-evidence";
import { semanticRegistrationStatus, terminalDecisionStatus } from "./audit-progress-registration";
import { METRICS, TOPIC_ROWS, PRIMARY_CHECKLIST_IDS, arr, obj, accessibilityProgress, type Obj, type ProgressRow } from "./audit-progress";

export function exportedState(row:Obj|undefined):string {
  if(!row)return "not_checked";
  const state=String(row.evidenceState??row.evidenceLabel??row.status??"").toLowerCase().replaceAll(" ","_");
  return ["observed","not_observed","conflicting","not_applicable"].includes(state)?state:["not_confirmed","not_testable","unknown"].includes(state)?"unknown":"not_checked";
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
  const states:Record<string,string>={};for(const m of METRICS)states[m.id]="not_checked";
  const noGo=report.resultDisposition==="no_go",completed=["completed","completed_limited"].includes(report.scanStatus),reportable=completed&&!noGo;
  states.outcome=noGo?"no_go":report.scanStatus==="completed_limited"?"usable_limited":report.scanStatus==="completed"?"usable_complete":["failed","expired"].includes(report.scanStatus)?"failed_or_expired":"in_progress";
  states.evidence="cached_canonical_export";
  // An export alone does not prove current publication or original worker profile.
  delete states.publication;
  const checklist=arr(obj(report.gdprEprivacyChecklistRows).items),first=obj(obj(report.consentSurfaceEvidence).firstLayerConsentChoices);
  for(const [name,field] of Object.entries({accept:"acceptControlObserved",reject:"rejectControlObserved",options:"managePreferencesControlObserved"})){
    if(!reportable){delete states[`control.${name}`];continue;}
    const canonicalId={accept:"accept_consent_control",reject:"reject_all_path_availability",options:"options_settings_preferences_control"}[name];
    const canonical=checklist.find(r=>r.id===canonicalId);
    metricSources[`control.${name}`]=canonical?"public_canonical_checklist":"public_first_layer_inventory";
    states[`control.${name}`]=canonical?exportedState(canonical):first[field]===true?"observed":first[field]===false&&first.controlInventoryComplete===true?"not_observed":field in first?"unknown":"not_checked";
  }
  if(!reportable)delete states["control.privacyOptOut"];
  for(const [id,key] of Object.entries(TOPIC_ROWS))if(reportable)states[key]=exportedState(checklist.find(r=>r.id===id));else delete states[key];
  for(const name of ["accept","reject"]){
    const observation=obj(report[name==="accept"?"postAcceptObservation":"postRefusalObservation"]),execution=choicePathExecutionSchema.safeParse(observation.execution);
    states[`execution.${name}`]=execution.success?execution.data.status:"not_checked";
    states[`click.${name}`]=execution.success?(execution.data.clickCompleted?"completed":["not_attempted","unsupported"].includes(execution.data.status)?execution.data.status:"incomplete"):"not_checked";
    if(execution.success&&execution.data.clickCompleted){
      states[`registration.${name}`]=semanticRegistrationStatus(observation);
      metricSources[`registration.${name}`]="export_semantic_registration";
      states[`terminal.${name}`]=terminalDecisionStatus(observation,name as "accept"|"reject");
    }else {delete states[`registration.${name}`];delete states[`terminal.${name}`];}
  }
  const gpc=obj(report.gpcResponse),observation=obj(gpc.observation),delivery=obj(observation.delivery);
  if(Object.keys(gpc).length){states.gpc_path=observation.status??"not_checked";states.gpc_delivery=delivery.httpHeaderRetained===true&&delivery.mainNavigatorReadbackRetained===true?"verified":Object.keys(delivery).length?"unverified":"not_checked";}
  else {delete states.gpc_path;delete states.gpc_delivery;}
  const projected=obj(report.projectedFindings),findingInventory=reportable&&Array.isArray(projected.items)&&obj(projected.cap).truncated===false;
  const findings=reportable?arr(projected.items).map(f=>({id:String(f.id),label:String(f.label),family:/accessibility|wcag|contrast/i.test(String(f.id))?"accessibility":"other",top:null})):[];
  if(reportable){
    Object.assign(states,accessibilityProgress(obj(report.accessibilityAudit)));
    states.gpc_finding=findings.some(f=>/gpc/i.test(f.id))?"observed":findingInventory&&observation.status==="complete"?"no_finding_returned":"unknown";
    states.cmp_provider=obj(report.executiveSummary).consentPlatform??"unknown";
    if(report.accessibilityAudit&&obj(report.accessibilityAudit).required!==false)states.accessibility=obj(report.accessibilityAudit).status??"not_checked";else delete states.accessibility;
  }else {delete states.gpc_finding;delete states.cmp_provider;delete states.accessibility;}
  if(!reportable)for(const key of Object.keys(states))if(key.startsWith("accessibility."))delete states[key];
  const supplement=reportable?evidenceProgress(report,checklist,PRIMARY_CHECKLIST_IDS):{states:{},measurements:{},metricLabels:{}};
  Object.assign(states,supplement.states);
  const context=obj(report.calibrationContext),meta=obj(report.meta);
  return {scanId:id,site:String(report.domain??"unknown"),createdAt,region:String(context.scanFrom??"unknown"),producer:"not retained in public export",profile:"not retained in public export",assessmentVersion:String(meta.projectionVersion??"unknown"),projectionVersion:String(meta.reportProjectionVersion??"unknown"),originRequestId:"archive folder provenance; original credential not independently verified",states,metricSources,measurements:supplement.measurements,metricLabels:supplement.metricLabels,findings,findingInventory,reportable,refs:[ref]};
}
