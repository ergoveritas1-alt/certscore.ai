import { californiaVisitStages, gpcVisitStages, visitStagesSchema } from "../../apps/web/lib/scans/california-visit-stages";
export {STAGE_METRICS} from "./audit-stage-metrics";
export function auditStageStates(report: Record<string, any>, scanId: string) {
  const states: Record<string,string> = {};
  if (!scanId) return states;
  const receipt = visitStagesSchema.safeParse(report.californiaVisitStages).data;
  const runtime = report.runtimeArtifacts;
  const retained = runtime && report.scan?.id === scanId ? californiaVisitStages(scanId,runtime) : null;
  const gpc = retained?.gpc ?? gpcVisitStages(scanId,report.gpcResponse);
  const packet = report.postRefusalObservation?.confirmation?.sourcePacketSha256;
  const reject = retained?.reject ?? (receipt?.scanId === scanId && report.postRefusalObservation?.execution?.clickCompleted === true &&
    receipt.reject?.sourceSha256 === packet ? receipt.reject : null);
  for (const [path,visit] of Object.entries({reject,gpc})) {
    visit?.recipients.forEach((n,i) => { if (n !== null) states[`detail.${path}.stage${i+1}`] = n > 0 ? "observed" : "not_observed_in_retained_evidence"; });
  }
  if(gpc && 'classifiedPresence' in gpc && gpc.classifiedPresence)states['detail.gpc.stage1']='observed';
  if(reject?.classifiedPresence)states['detail.reject.stage1']='observed';
  // The historical public export can prove presence without retaining enough
  // information to assign a collection stage to any particular recipient.
  if(report.scanId===scanId && report.postRefusalObservation?.execution?.clickCompleted===true &&
      Array.isArray(report.projectedFindings?.items) && report.projectedFindings.items.some((f: {id?:string})=>f?.id==='post_reject_click_tracking'))
    states['detail.reject.stage1']='observed';
  return states;
}
