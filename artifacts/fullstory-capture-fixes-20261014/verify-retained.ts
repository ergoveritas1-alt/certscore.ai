import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalEvidenceBundleSchema,consentControlAssessmentSchema,CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT,CONSENT_ACTION_RETENTION_OVERFLOW_EVALUATION_LIMIT} from '../../packages/certscore-contracts/src';
const require=createRequire(import.meta.url);require.cache[require.resolve('server-only')]={exports:{}} as any;
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
async function main(){
 assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 globalThis.fetch=(async()=>{throw Error('No HTTP/model calls during retained verification');}) as typeof fetch;
 const {loadAnonymousPersistedScanReportProjection}=await import('../../apps/web/server/scans/scan-report-projection');
 const {deriveCmpAuditAssessment}=await import('../../apps/web/server/scans/cmp-audit-assessment-projector');
 const {projectCmpAudit}=await import('../../apps/web/lib/scans/cmp-audit-projection');
 const receipts=[];
 for(const scanId of ['f7b36da6-7043-4789-8ca7-093de4d0377f','257741ec-9e2f-40e2-a912-b98fccedaf90','3e99f256-8aae-4abd-a2fb-03060ba64447']){
  const summary=JSON.parse(readFileSync(`artifacts/local-v2-dag-lambda-simulated/${scanId}/summary.json`,'utf8'));
  const events=summary.sqsMessages.filter((x:any)=>x.status==='completed');assert.equal(events.length,1);
  const event=events[0],read=(uri:string)=>{const u=new URL(uri);return readFileSync(`${summary.fakeS3Root}/${u.hostname}${u.pathname}`)};
  const bytes=read(event.artifactPointers.scanArtifactUri);assert.equal(sha(bytes),event.artifactMetadata.scanArtifactUri.sha256);
  const manifestBytes=read(event.artifactPointers.manifestUri);assert.equal(sha(manifestBytes),event.artifactMetadata.manifestUri.sha256);
  const manifest=JSON.parse(manifestBytes.toString()),ref=manifest.auxiliaryArtifacts.find((x:any)=>x.fileName==='ConsentControlGeometryEvidence.json');
  const geometryBytes=read(ref.uri);assert.equal(sha(geometryBytes),ref.sha256);const geometry=JSON.parse(geometryBytes.toString());
  const imageName=geometry.screenshotArtifactRef?.replace(/\\/g,'/').split('/').pop();
  const imageRefs=manifest.auxiliaryArtifacts.filter((x:any)=>x.fileName===imageName);assert.equal(imageRefs.length,1);assert.equal(sha(read(imageRefs[0].uri)),imageRefs[0].sha256);
  const bundle=canonicalEvidenceBundleSchema.parse(JSON.parse(bytes.toString()));
  const before=JSON.stringify(bundle),saved:any=await loadAnonymousPersistedScanReportProjection({scanId});assert.ok(saved);
  const savedHash=sha(JSON.stringify(saved));
  const stored=consentControlAssessmentSchema.parse(saved.runtimeArtifacts.consentControlAssessment??saved.runtimeArtifacts.consent_control_assessment);
  const audit=deriveCmpAuditAssessment(bundle,geometry)!;
  const deltas=audit.rows.filter(row=>stored.cmpAudit!.rows.find(old=>old.id===row.id)?.status!==row.status).map(row=>({id:row.id,before:stored.cmpAudit!.rows.find(old=>old.id===row.id)?.status,after:row.status}));
  assert.ok(deltas.every(delta=>delta.before==='not_assessed'&&delta.after==='incomplete'),'Only explicit neutral coverage diagnostics may differ');
  assert.equal(JSON.stringify(bundle),before);assert.equal(sha(read(event.artifactPointers.scanArtifactUri)),sha(bytes));
  assert.equal(sha(JSON.stringify(await loadAnonymousPersistedScanReportProjection({scanId}))),savedHash);
  if(scanId.startsWith('f7b')){
   assert.equal(bundle.cmpPreferencesEvidence!.action.count,0);assert.equal(bundle.cmpPreferencesEvidence!.inspectionDiagnostic!.optionsResolution,undefined,'Historical Options reasons must not be invented');
   assert.equal(geometry.visualComparison,undefined);assert.equal(geometry.candidates.filter((c:any)=>['accept_all','reject_all'].includes(c.actionType)&&c.decisionStatus==='covered').length,2);
   assert.equal(bundle.postAcceptEvidence!.captureCoverage!.postActionRetention!.policyVersion,'priority_bounded_action_requests.v1');
   assert.equal(bundle.postAcceptEvidence!.captureCoverage!.requestsDroppedAfterAction,88);assert.equal(bundle.postAcceptEvidence!.captureCoverage!.postActionRetention!.omitted.tracking,18);
   assert.equal(bundle.postRefusalEvidence!.captureCoverage!.requestsDroppedAfterAction,0);
   assert.equal(audit.rows.find(row=>row.id==='implementation')!.status,stored.cmpAudit!.rows.find(row=>row.id==='implementation')!.status);
   const projected=projectCmpAudit({scanId,consentControlAssessment:stored,normalizedConcerns:saved.canonicalReportProjection.normalizedConcerns,checklistRows:saved.canonicalReportProjection.checklistRows,unifiedFindings:saved.canonicalReportProjection.globalUnifiedFindings});
   assert.equal(projected.rows.find(row=>row.id==='implementation')!.status,'Review recommended');
   assert.match(projected.rows.find(row=>row.id==='implementation')!.detail!,/22 tracking/);
  }
  receipts.push({scanId,sourceSha256:sha(bytes),bundleManifestGeometryAndImageVerified:true,savedReportUnchanged:true,newObservedChecks:0,statusDeltas:deltas,optionsReasonInvented:false});
 }
 assert.equal(CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT,192);assert.equal(CONSENT_ACTION_RETENTION_OVERFLOW_EVALUATION_LIMIT,256);
 const result={newScans:0,deployments:0,paidCalls:0,limits:{requestRows:192,overflowEvaluations:256,visualDecodeMs:80,preferenceDeadlineMs:17000},omittedRequestsRecovered:false,receipts};
 writeFileSync('artifacts/fullstory-capture-fixes-20261014/retained-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
main().then(()=>process.exit()).catch(error=>{console.error(error);process.exit(1)});
