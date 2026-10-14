import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalEvidenceBundleSchema} from '../../packages/certscore-contracts/src/index';
import {assertPublicTestContactAllowed} from '../../packages/certscore-scan-core/src/public-test-contact-holds';
const require=createRequire(import.meta.url);require.cache[require.resolve('server-only')]={exports:{}} as any;
const dir='artifacts/hubspot-fresh-verification-20261014';
const round=process.argv[2];assert.ok(round && /^[a-z0-9_-]+$/.test(round));

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function verify(scanId:string,target:string){
 const root=`artifacts/local-v2-dag-lambda-simulated/${scanId}`;
 const summary=JSON.parse(readFileSync(`${root}/summary.json`,'utf8'));
 assert.equal(summary.resultStatus,'completed');
 const terminal=summary.sqsMessages.filter((x:any)=>x.status==='completed');assert.equal(terminal.length,1);
 const uri=new URL(terminal[0].artifactPointers.scanArtifactUri);
 const bytes=readFileSync(`${summary.fakeS3Root}/${uri.hostname}${uri.pathname}`);
 assert.equal(sha(bytes),terminal[0].artifactMetadata.scanArtifactUri.sha256);
 const bundle=canonicalEvidenceBundleSchema.parse(JSON.parse(bytes.toString()));assert.equal(bundle.scanId,scanId);
 const {loadAnonymousPersistedScanReportProjection}=await import('../../apps/web/server/scans/scan-report-projection');
 const {projectScanReportNoGo}=await import('../../apps/web/lib/scans/scan-report-disposition');
 const {buildTimelineReportModel}=await import('../../apps/web/components/scans/report-lab/timeline-report-model');
 const {buildDetailedEvidenceExport}=await import('../../apps/web/lib/scans/detailed-evidence-report');
 const scan=await loadAnonymousPersistedScanReportProjection({scanId});assert.ok(scan);assert.equal(scan.scan.status,'completed');
 const report=buildTimelineReportModel(scan);
 if(report.resultDisposition==='no_go'){const receipt={url:target,scanId,reportUrl:`http://localhost:3000/scan/${scanId}`,status:'completed',noGo:true,noGoAssessment:report.noGo,elapsedMs:summary.elapsedMs,sourceVerified:true,score:report.score,modules:bundle.modulesRun.map(m=>({module:m.moduleName,status:m.status,errors:m.errors}))};writeFileSync(`${dir}/${round}/${scanId}/receipt.json`,JSON.stringify(receipt,null,2));return receipt;}
 const exported=buildDetailedEvidenceExport(report);
 writeFileSync(`${dir}/${round}/${scanId}/export.json`,JSON.stringify(exported,null,2));
 const prefs=bundle.cmpPreferencesEvidence;
 const cmp=(report as any).cmpAudit;
 if(cmp){
  assert.deepEqual(exported.cmpAudit.rows.map(x=>[x.id,x.status]),cmp.rows.map((x:any)=>[x.id,x.status]));
  const services=exported.cmpAudit.rows.find(x=>x.id==='services')?.supportingEvidence?.inventory?.services;
  if(services?.length)assert.ok(services.every(x=>[...(prefs?.serviceNames??[]),...(bundle.cmpBasicEvidence?.serviceNames??[]),...(prefs?.controls.filter(c=>c.kind==='service').map(c=>c.label)??[])].includes(x.name)));
 }
 const audit=bundle.accessibilityAudit;
 if(audit){
  assert.equal(audit.engineVersion,'4.11.3');
  if(audit.exampleCoverage){assert.equal(audit.exampleCoverage.version,'breadth_before_detail.v1');assert.equal(audit.exampleCoverage.retainedNodeCount,[...audit.violations,...audit.reviewItems].reduce((n,r)=>n+r.representativeNodes.length,0));}
  assert.equal((report as any).accessibilityAudit?.affectedNodeCount,audit.rulesEvaluated.length?audit.violations.reduce((n,r)=>n+r.nodeCount,0):null);
  assert.deepEqual((report as any).accessibilityAudit?.exampleCoverage,audit.exampleCoverage);
 }
 const safety=[] as any[];
 for(const lane of ['consent_proof','runtime_evidence','gpc_observation']){
  const p=`${root}/lanes/${lane}/LocalV2DagLambdaManifest.json`;
  if(existsSync(p)){const manifest=JSON.parse(readFileSync(p,'utf8'));safety.push({lane,review:manifest.screenshotSafetyReview});}
 }
 for(const screenshot of bundle.screenshots){
  if(screenshot.retentionStatus==='withheld')assert.equal(existsSync(screenshot.path),false);
  if(screenshot.retentionStatus==='available')assert.ok(existsSync(screenshot.path));
 }
 const gp=`${root}/lanes/consent_proof/ConsentControlGeometryEvidence.json`;
 let visual:any;
 if(existsSync(gp)){
  const g=JSON.parse(readFileSync(gp,'utf8')),v=g.visualComparison;
  if(v){
   const image=bundle.screenshots.find(s=>s.path.split('/').pop()===v.screenshotArtifactRef.split('/').pop());
   visual={comparison:v,retentionStatus:image?.retentionStatus,geometryInspection:g.controlInspection,summary:g.summary};
   if(image?.retentionStatus==='available'){assert.equal(sha(readFileSync(image.path)),v.screenshotSha256);assert.equal(image.documentIdentity?.token,v.documentToken);}
  }
 }
 const noGo=Boolean(projectScanReportNoGo(scan));
 const receipt={url:target,scanId,reportUrl:`http://localhost:3000/scan/${scanId}#evidence`,status:'completed',noGo,
  elapsedMs:summary.elapsedMs,requestedUrl:bundle.url,normalizedUrl:bundle.normalizedUrl,sourceVerified:true,
  prefs:{status:prefs?.status,platform:prefs?.support?.provider,support:prefs?.support,services:prefs?.serviceNames,categories:prefs?.categories,declarations:prefs?.declarations?.length,limitations:prefs?.limitations},
  cmpRows:cmp?.rows.map((x:any)=>({id:x.id,status:x.status,detail:x.detail,supportingEvidence:x.supportingEvidence})),
  accessibility:audit,visual,safety,postAccept:summary.postAccept,postReject:summary.postRefusal,
  moduleRuns:bundle.modulesRun,score:(report as any).score,reportKeys:Object.keys(report),runtimeCoverage:bundle.runtimeCoverage,
  screenshots:bundle.screenshots.map(s=>({artifactId:s.artifactId,retentionStatus:s.retentionStatus,reason:s.displayWithheldReason})),
  runtime:{cookies:bundle.cookieEvents.length,requests:bundle.networkEvents.length,vendors:bundle.normalizedVendorObservations.length},
  workAllocation:bundle.modulesRun.flatMap(m=>m.timingBreakdown??[]).filter(t=>/^(runtime detail allocation|evidence work priority|required accessibility audit)$/.test(t.label))};
 writeFileSync(`${dir}/${round}/${scanId}/receipt.json`,JSON.stringify(receipt,null,2));
 return receipt;
}
async function main(){
 assert.equal(existsSync(`${dir}/local-admission-owner-approval.json`),true,'Pending human approval: do not bypass the local quota');
 const approval=JSON.parse(readFileSync(`${dir}/local-admission-owner-approval.json`,'utf8'));assert.equal(approval.approved,true);assert.equal(approval.maxAdmissions,1);
 const {query}=await import('../../packages/db/src/postgres');
 const selectionFile=`${dir}/${round}-selection.json`;
 const targets=JSON.parse(readFileSync(selectionFile,'utf8')).selected;
 assert.ok(targets.length>0 && targets.length===1);
 const results:any[]=[];mkdirSync(`${dir}/${round}`,{recursive:true});
 for(const target of targets){
  assertPublicTestContactAllowed(target.scanUrl??target.url,'owner-authorized targeted CMP verification');
  const submissionFile=`${dir}/${round}/${new URL(target.url).hostname}.submission.json`;
  assert.equal(existsSync(submissionFile),false,'Never duplicate an admission request');
  const request={domain:target.scanUrl??target.url,forceNewScan:true,localV2RunViaLambda:true,localV2ScanProfile:'full',scanFrom:'eu-de',requestId:randomUUID()};
  const quotaPath='apps/web/server/pulse/anonymous-scan-quota.ts',original=readFileSync(quotaPath,'utf8');
  assert.ok(original.startsWith('export const ANONYMOUS_SCAN_DAILY_LIMIT = 20;'));
  const usage=await query<{count:string}>(`select coalesce(max(scan_count),0)::text as count from anonymous_scan_daily_quotas where window_date=(now() at time zone 'utc')::date`,[],{readOnly:true});
  const temporaryLimit=Math.max(20,Number(usage.rows[0]!.count)+1);assert.ok(temporaryLimit<=40,'One owner-approved local admission after usage 39');
  const temporary=original.replace('export const ANONYMOUS_SCAN_DAILY_LIMIT = 20;',`export const ANONYMOUS_SCAN_DAILY_LIMIT = ${temporaryLimit};`);
  writeFileSync(submissionFile,JSON.stringify({request,state:'submitting',ownerAuthorization:'Owner explicitly approved one fresh local HubSpot scan and one local quota exception; restore 20 immediately after admission, no deployment.',localQuotaAllowance:temporaryLimit,originalQuotaSha256:sha(Buffer.from(original))},null,2));
  let response:Response|undefined,body:any;
  try{
   writeFileSync(quotaPath,temporary);
   const ready=await fetch('http://localhost:3000/api/full-scan',{method:'GET',signal:AbortSignal.timeout(60000)});assert.equal(ready.status,405);
   response=await fetch('http://localhost:3000/api/full-scan',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
   body=await response.json();writeFileSync(submissionFile,JSON.stringify({request,httpStatus:response.status,body,localQuotaAllowance:temporaryLimit,originalQuotaSha256:sha(Buffer.from(original))},null,2));
  }finally{
   assert.equal(readFileSync(quotaPath,'utf8'),temporary,'Do not overwrite concurrent quota edits');writeFileSync(quotaPath,original);
   writeFileSync(`${dir}/${round}/${new URL(target.url).hostname}.quota-restored.json`,JSON.stringify({requestId:request.requestId,scanId:body?.scanId,restoredTo:20,originalSha256:sha(Buffer.from(original)),restoredSha256:sha(readFileSync(quotaPath)),at:new Date().toISOString()},null,2));
  }
  if(response!.status!==202 || !body.scanId)throw Error(`Admission failed ${response!.status}: ${JSON.stringify(body)}`);
  const scanId=body.scanId;mkdirSync(`${dir}/${round}/${scanId}`,{recursive:true});console.log(JSON.stringify({event:'accepted',scanId,url:target.url}));
  let status:any;
  for(let i=0;i<60;i++){await sleep(5000);const response=await fetch(`http://localhost:3000/api/scan-status/${scanId}?includeFindings=0`,{signal:AbortSignal.timeout(20000)});const payload=await response.json() as any;status=payload.scan;if(status?.status==='failed'||(['completed','completed_limited'].includes(status?.status)&&payload.reportReadiness?.status==='ready'))break;}
  let receipt:any;try{assert.equal(status.status,'completed');receipt=await verify(scanId,target.url);}catch(error){receipt={url:target.url,scanId,status:status?.status??'unknown',verificationError:String(error),noGo:status?.status==='failed'};}
  results.push(receipt);writeFileSync(`${dir}/${round}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({event:'terminal',scanId,status:receipt.status,error:receipt.verificationError,cmp:receipt.cmpRows?.map((r:any)=>[r.id,r.status]),prefs:receipt.prefs,a11y:receipt.accessibility?.status}));
 }
}
main().then(()=>process.exit()).catch(e=>{console.error(e);process.exit(1)});
