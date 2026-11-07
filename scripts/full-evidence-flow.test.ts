import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildFullEvidencePackage} from '../apps/web/lib/api-v2/full-evidence-package';
import {verifyFullEvidenceExport,resolveFullEvidenceReferences} from '../apps/web/lib/api-v2/full-evidence-export';
import * as resource from '../apps/web/lib/api-v2/scan-resource';
import {buildDetailedEvidenceExport} from '../apps/web/lib/scans/detailed-evidence-report';
import {buildTimelineReportModel} from '../apps/web/components/scans/report-lab/timeline-report-model';
import {reportRequestScanFixture} from '../apps/web/server/scans/report-forms.fixture';
import {gpcProductFixture} from '../apps/web/lib/scans/test-fixtures/gpc-product';
import {buildUnifiedFindingDisplayPackets} from '../apps/web/lib/scans/unified-findings';
import terminalFixtures from '../apps/web/lib/scans/test-fixtures/retained-terminal-confirmations.json';
import {deriveChoiceConfirmationSummary} from '../apps/web/lib/api-v2/after-action-summary';
import {extractExportRow} from './lib/audit-progress-export';
import {adaptMasterView,compareMasterViews,type Binding,type ViewInput} from './lib/audit-master-values';
import {pairedGpcAudit} from './lib/audit-progress-gpc';
import {priorityEvidenceStates} from './lib/audit-progress-priority-evidence';

const sourceHash='a'.repeat(64),generation='scan-report-projection-v27';
function recordFixture(){
 const record=reportRequestScanFixture();
 record.canonicalReportProjection.globalUnifiedFindings=[];
 record.canonicalReportProjection.ownerUnifiedFindings=[];
 record.snapshot={...record.snapshot,report_projection_source_hash:sourceHash,report_projection_version:generation} as typeof record.snapshot;
 return record;
}
function input(view:ViewInput['view'],doc:any,record:ReturnType<typeof recordFixture>):ViewInput{
 const binding:Binding={scanId:record.scan.id,createdAt:record.scan.createdAt,generation,sourceHash,creatorIdentity:'owned-fixture-origin'};
 const bytes=Buffer.from(JSON.stringify(doc));
 return {view,binding,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),schema:{report:'scan-report-display.local.v1',standard:'pulse-public-v11',full:'certscore.full-evidence.v2',audit:'certscore.mac-mini-daily-progress.v5'}[view]};
}

test('real producers flow through the actual download route, every page and the four audit adapters',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('External fetch is forbidden in this test');});
 // Pure producers are the actual imported functions; only external I/O is replaced.
 const mocks:Record<string,string>={
  state:'export const state={producers:null,record:null,loads:0,models:0};',
  package:"import {state} from 'flow-state';export const buildFullEvidencePackage=(...a)=>state.producers.buildFullEvidencePackage(...a);",
  resource:"import {state} from 'flow-state';export const deriveApiV2GpcResponse=(...a)=>state.producers.resource.deriveApiV2GpcResponse(...a);export const API_V2_SCAN_ID_PATTERN=/^[a-f0-9-]{36}$/;export const apiV2JsonResponse=(...a)=>state.producers.resource.apiV2JsonResponse(...a);export const buildApiV2Error=(...a)=>state.producers.resource.buildApiV2Error(...a);",
  details:"import {state} from 'flow-state';export const buildDetailedEvidenceExport=(...a)=>state.producers.buildDetailedEvidenceExport(...a);",
  model:"import {state} from 'flow-state';export async function buildVerifiedTimelineReportModel(record){state.models++;return state.producers.buildTimelineReportModel(record);}",
  access:"import {state} from 'flow-state';export class ReportEvidenceAccessError extends Error{};export async function loadAuthorizedReportEvidence(){state.loads++;return state.record;}",
  keys:"export function parseBearerToken(){return null;}export function validateCertScoreBearerToken(){throw Error('Unexpected credential read');}",
  throttle:'export async function enforceApiV2ScanReadThrottle(){return null;}',
  projection:"export function loadPersistedScanReportProjection(){throw Error('Unexpected DB read');}export function loadAnonymousPersistedScanReportProjection(){throw Error('Unexpected DB read');}",
  ticket:"export function issueReportDownloadTicket(){throw Error('Unexpected ticket');}export function verifyReportDownloadTicket(){return null;}",
  fullsite:"export function loadFullSiteReport(){throw Error('Unexpected full-site read');}",
  export:"export function buildCanonicalReportExport(){throw Error('Unexpected tracking path');}",
  workpaper:"export function buildTrackingWorkpaper(){throw Error('Unexpected tracking path');}export function renderTrackingWorkpaperCsv(){throw Error('Unexpected CSV');}",
 };
 const suffixes:Record<string,string>={'/full-evidence-package':'package','/scan-resource':'resource','/detailed-evidence-report':'details','/verified-timeline-report-model':'model','/report-evidence-access':'access','/integrations/api-keys':'keys','/api-v2-read-throttle':'throttle','/scan-report-projection':'projection','/report-download-ticket':'ticket','/full-site-report':'fullsite','/report-export':'export','/tracking-workpaper':'workpaper'};
 const output=await build({stdin:{contents:"export {GET} from './apps/web/app/api/v2/scans/[scanId]/report-evidence/route.ts';export {state} from 'flow-state';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline-io',setup(api){
  api.onResolve({filter:/.*/},a=>{const key=a.path==='flow-state'?'state':Object.entries(suffixes).find(([s])=>a.path.endsWith(s))?.[1];return key?{path:key,namespace:'offline'}:undefined;});
  api.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:mocks[a.path],loader:'js'}));
 }}]});
 const dir=await mkdtemp(join(tmpdir(),'certscore-flow-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'route.mjs');await writeFile(file,output.outputFiles[0]!.text);
 const {GET,state}=await import(pathToFileURL(file).href);
 state.producers={buildFullEvidencePackage,resource,buildDetailedEvidenceExport,buildTimelineReportModel};state.record=recordFixture();
 const before=JSON.stringify(state.record),scanId=state.record.scan.id;
 const get=(query:string)=>GET(new Request(`https://certscore.ai/api/v2/scans/${scanId}/report-evidence?${query}`),{params:Promise.resolve({scanId})});
 const response=await get('format=download&reviewFocus=ccpa_cpra');assert.equal(response.status,200);
 assert.match(response.headers.get('Cache-Control')!,/no-store/);assert.match(response.headers.get('Content-Disposition')!,/attachment/);
 const full=await response.json();verifyFullEvidenceExport(full);assert.doesNotMatch(JSON.stringify(full),/PRIVATE_VALUE/);
 const entries:any[]=[];let cursor:string|null=null,pages=0,firstSnapshot='';
 do{const reply=await get('reviewFocus=ccpa_cpra'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(reply.status,200);const page=await reply.json();
  if(!pages)firstSnapshot=page.snapshot;assert.equal(page.snapshot,firstSnapshot);entries.push(...page.entries);cursor=page.pagination.nextCursor;pages++;
 }while(cursor);
 assert.ok(pages>1,'Exercise a real multi-page package');let rebuilt:any;
 for(const e of entries){if(e.path===''){rebuilt=e.value;continue;}const parts=e.path.slice(1).split('/').map((p:string)=>p.replaceAll('~1','/').replaceAll('~0','~'));let at=rebuilt;for(const k of parts.slice(0,-1))at=at[k];const key=parts.at(-1)!;at[key]=e.stringPart===undefined?e.value:e.stringPart===0?e.value:at[key]+e.value;}
 assert.deepEqual(rebuilt,full);verifyFullEvidenceExport(rebuilt);
 const standard=full.standardEvidence,row=extractExportRow(standard,{file:'fixture-only',sha256:input('standard',standard,state.record).sha256,role:'hash_verified_bot_archive_export'});
 const report=resolveFullEvidenceReferences(full,full.reportViews.gdpr_eprivacy);
 const views=[input('standard',standard,state.record),input('report',report,state.record),input('full',full,state.record),input('audit',row,state.record)].map(adaptMasterView);
 for(let i=0;i<views.length;i++)for(let j=i+1;j<views.length;j++){
  const compared=compareMasterViews(views[i]!,views[j]!);assert.ok(compared.every(c=>c.status!=='mismatch'),views[i]!.view+'/'+views[j]!.view);
  assert.equal(compared.find(c=>c.legacyId==='collection.forms.observed_count')!.status,'match');
 }
 assert.equal(JSON.stringify(state.record),before);assert.equal(state.loads,pages+1);assert.equal(state.models,pages+1);
 const section=await get('format=download&section=forms');assert.equal(section.status,200);assert.equal((await section.json()).exportContent.scope,'report_display_content');
 const bad=await get('reviewFocus=gdpr_eprivacy&cursor=v1.'+firstSnapshot+'.1');assert.equal(bad.status,409);
});

test('retained terminal decisions preserve public summaries and independently bound audit witnesses as separate evidence',()=>{
 for(const fixture of terminalFixtures){
  const action=fixture.action as 'accept'|'reject',record=recordFixture();
  record.runtimeArtifacts![action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection']=fixture.projection;
  const report=buildTimelineReportModel(record);assert.ok('findings' in report);
  const full=buildFullEvidencePackage(record,report);verifyFullEvidenceExport(full);
  const summary=full.standardEvidence[action==='accept'?'postAcceptObservation':'postRefusalObservation'].confirmation;
  assert.ok(summary);
  const expected=deriveChoiceConfirmationSummary(fixture.projection,action);assert.ok(expected);assert.deepEqual(summary,expected);assert.equal(summary.terminalDecisionVerified,true);assert.equal(summary.initialDecisionVerified,false);assert.equal(summary.initialRegistrationStatus,'unconfirmed');
  const row=extractExportRow(full.standardEvidence,{file:'retained-fixture',sha256:'b'.repeat(64),role:'hash_verified_bot_archive_export'});
  // The public summary intentionally omits the independently recheckable witness.
  assert.equal(row.states['terminal.'+action],'unavailable');assert.equal(row.states['registration.'+action],'unconfirmed');
  const p=fixture.projection as any,pick=(obj:any,keys:string[])=>Object.fromEntries(keys.map(k=>[k,obj[k]]));
  const compact={version:'certscore.audit-priority-evidence.v1',accept:null,reject:null,cmp:null,[action]:{
   contractVersion:p.contractVersion,packetSha256:p.packetSha256,execution:p.execution,witness:{
    ...pick(p.terminalDecisionEvidence,['policyVersion','action','authorizedTargetSha256','readStartedAtMs','readCompletedAtMs']),
    evidence:pick(p.terminalDecisionEvidence.evidence,['policyVersion','basis','decision','observedStateSha256','observedAtMs','timestampBasis']),
   },
   capture:pick(p.afterActionCapture,['policyVersion','action','activationStatus','actionDispatchedAtMs','captureEndedAtMs','requestedWindowMs','stopReason','requestsDropped','storageSnapshotRetained']),
   control:pick(p.actionControlProof,['action','authorizedTargetSha256','observedAtMs']),
  }};
  assert.equal(priorityEvidenceStates(compact,record.scan.id)['sealed.terminal.audit_'+action]?.value,'verified');
  const conflict=structuredClone(compact) as any;conflict[action].control.authorizedTargetSha256='0'.repeat(64);
  assert.equal(priorityEvidenceStates(conflict,record.scan.id)['sealed.terminal.audit_'+action]?.value,'unverified');
  assert.ok(compareMasterViews(adaptMasterView(input('standard',full.standardEvidence,record)),adaptMasterView(input('full',full,record))).every(r=>r.status!=='mismatch'));
 }
});

test('canonical paired GPC/CMP evidence flows into both exports and audit with its original source/window qualification',()=>{
 const record=recordFixture(),f=gpcProductFixture({scanId:record.scan.id,priorCmpState:true});
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:f.assessment,gpcActivityComparison:f.activityComparison,gpcCmpStateComparison:f.cmpStateComparison},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 record.canonicalReportProjection.globalUnifiedFindings=findings;record.canonicalReportProjection.ownerUnifiedFindings=findings;
 const report=buildTimelineReportModel(record);assert.ok('findings' in report);assert.ok(report.gpcResponse);
 const full=buildFullEvidencePackage(record,report);verifyFullEvidenceExport(full);
 const standard=full.standardEvidence,ca=resolveFullEvidenceReferences(full,full.reportViews.ccpa_cpra);
 assert.ok(standard.gpcResponse?.cmpStateComparison);assert.deepEqual(ca.gpcResponse.cmpStateComparison,standard.gpcResponse.cmpStateComparison);
 const original=pairedGpcAudit(standard),exported=pairedGpcAudit({...ca,scanId:record.scan.id});assert.deepEqual(exported,original);
 assert.equal(original.states['detail.gpc.paired_cmp'],'available');assert.notEqual(original.states['detail.gpc.paired_sale_transition'],'unavailable');
 const views=[adaptMasterView(input('standard',standard,record)),adaptMasterView(input('report',ca,record)),adaptMasterView(input('full',full,record))];
 for(const other of views.slice(1))assert.ok(compareMasterViews(views[0]!,other).every(r=>r.status!=='mismatch'));
});
