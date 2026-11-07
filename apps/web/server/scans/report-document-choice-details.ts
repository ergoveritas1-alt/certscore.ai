import {apiV2ChoiceConfirmationSummarySchema,apiV2ChoicePathExecutionSchema,apiV2GpcResponseSchema} from '../../../../packages/certscore-api-contracts/src/scan-observation-results';
import type {CanonicalReportExport} from './report-export';

const words=(s:string)=>s.replaceAll('_',' ');
const verified=(v:boolean|null|undefined)=>v===true?'Verified':v===false?'Not verified':'Unknown';
/** Existing customer summaries only. Never substitute these for independent audit witnesses. */
export function documentChoiceDetails(report:CanonicalReportExport):string[][]{
 return (['accept','reject'] as const).flatMap(action=>{
  const raw=action==='accept'?report.postAcceptObservation:report.postRefusalObservation;
  const summary=apiV2ChoiceConfirmationSummarySchema.safeParse(raw&&'confirmation' in raw?raw.confirmation:undefined);
  const execution=apiV2ChoicePathExecutionSchema.safeParse(raw&&'execution' in raw?raw.execution:undefined);
  const s=summary.success?summary.data:undefined,e=execution.success?execution.data:undefined;
  if(!raw)return [];
  return [[action==='accept'?'Accept':'Reject',e?words(e.status):'Unknown',
   s?words(s.initialRegistrationStatus):'Unknown',verified(s?.initialDecisionVerified),verified(s?.terminalDecisionVerified)]];
 });
}

/** Preserve independent retained windows; invalid/missing packets never become zero. */
export function readDocumentGpc(report:CanonicalReportExport){
 const parsed=apiV2GpcResponseSchema.safeParse(report.gpcResponse);
 if(!parsed.success)return undefined;
 const g=parsed.data,o=g.observation;
 if(o&&(o.scanId!==report.scan.id||o.sourceSha256!==g.comparison.gpcArtifact?.sha256))return undefined;
 return g;
}
export function documentGpcDetails(report:CanonicalReportExport):string[][]{
 const g=readDocumentGpc(report);if(!g)return [['Bound GPC detail','Unavailable']];
 const o=g.observation;
 if(g.contractVersion!=='certscore.gpc-response-assessment.v3'||!o||o.status==='unavailable'||o.scanId!==report.scan.id||
   o.sourceSha256!==g.comparison.gpcArtifact?.sha256||!o.sessionSha256||!o.documentUrlSha256||!o.positiveEvidence?.representativeDocument)return [['Bound GPC detail','Unavailable']];
 const rows=[['GPC response assessment',words(g.status)],['Page-request GPC header',o.delivery.httpHeaderRetained?'Retained':'Not retained'],
  ['Main-document navigator GPC',o.delivery.mainNavigatorReadbackRetained?'Retained':'Not retained'],
  ['CMP receipt',words(o.registration.cmpGpcSignal)],['CMP semantic observation',words(o.semanticProbe)],
  ['Full-visit classified requests',String(o.requests.classifiedCount)],
  ['Full-visit advertising collection',o.requests.advertisingCollectionCount===undefined?'Unknown':String(o.requests.advertisingCollectionCount)],
  ['Full-visit request coverage',o.requests.complete?'Complete within retained scope':'Limited'],
  ['Full-visit horizon after document commit',o.requests.documentCommittedAtMs===null||o.requests.throughMs===null?'Unknown':`${o.requests.throughMs-o.requests.documentCommittedAtMs} ms`]];
 if(o.semanticReadiness)rows.push(['CMP readiness reason',words(o.semanticReadiness.reason)],['CMP readiness checkpoint',`${o.semanticReadiness.observedAfterDocumentCommitMs} ms after document commit`]);
 const p=g.activityComparison;
 if(p&&p.scanId===report.scan.id)rows.push(['Matched request-count window',`${p.durationMs} ms after each document commit`],
  ['Paired advertising requests',`${p.activity.advertisingMarketing.baselineRequests} -> ${p.activity.advertisingMarketing.gpcRequests}`],
  ['Paired analytics requests',`${p.activity.analyticsReplay.baselineRequests} -> ${p.activity.analyticsReplay.gpcRequests}`]);
 else rows.push(['Matched request-count window','Unavailable']);
 const c=g.cmpStateComparison;
 if(c&&c.scanId===report.scan.id){const state=(s:string)=>s==='opted_out'?'Opted out':'Not opted out';
  rows.push(['CMP sale snapshots',`${state(c.baseline.sale)} -> ${state(c.gpc.sale)}`],['CMP sharing snapshots',`${state(c.baseline.sharing)} -> ${state(c.gpc.sharing)}`]);
 }else rows.push(['Paired CMP snapshots','Unavailable']);
 return rows;
}
