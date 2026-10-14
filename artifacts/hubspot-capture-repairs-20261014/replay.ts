import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {canonicalEvidenceBundleSchema} from '../../packages/certscore-contracts/src';
const require=createRequire(import.meta.url);require.cache[require.resolve('server-only')]={exports:{}} as any;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const out='artifacts/hubspot-capture-repairs-20261014';
async function main(){
 assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 globalThis.fetch=(async()=>{throw Error('No HTTP or model calls during retained replay');}) as typeof fetch;
 const {loadAnonymousPersistedScanReportProjection}=await import('../../apps/web/server/scans/scan-report-projection');
 const {deriveMaterializedConsentControlAssessment}=await import('../../apps/web/server/scans/consent-control-assessment-projector');
 const {withCanonicalConsentAssessmentSnapshot}=await import('../../apps/web/server/scans/scan-report-consent-projection');
 const {buildNormalizedConcerns}=await import('../../apps/web/lib/scans/normalized-concerns');
 const {projectCmpAudit}=await import('../../apps/web/lib/scans/cmp-audit-projection');
 const {buildTimelineReportModel}=await import('../../apps/web/components/scans/report-lab/timeline-report-model');
 const {getPersistedCanonicalReportProjection}=await import('../../apps/web/server/scans/persisted-canonical-report-projection');
 const {buildDetailedEvidenceExport}=await import('../../apps/web/lib/scans/detailed-evidence-report');
 const receipts=[];
 for(const scanId of ['92533fe5-31f7-41d6-88b4-a300899a3399','f7b36da6-7043-4789-8ca7-093de4d0377f']){
  const dir=`artifacts/local-v2-dag-lambda-simulated/${scanId}`;
  const summary=JSON.parse(readFileSync(`${dir}/summary.json`,'utf8'));
  const terminal=summary.sqsMessages.filter((row:any)=>row.status==='completed');assert.equal(terminal.length,1);
  const event=terminal[0],read=(uri:string)=>{const u=new URL(uri);return readFileSync(`${summary.fakeS3Root}/${u.hostname}${u.pathname}`);};
  const bytes=read(event.artifactPointers.scanArtifactUri),manifestBytes=read(event.artifactPointers.manifestUri);
  assert.equal(sha(bytes),event.artifactMetadata.scanArtifactUri.sha256);assert.equal(sha(manifestBytes),event.artifactMetadata.manifestUri.sha256);
  const manifest=JSON.parse(manifestBytes.toString()),ref=manifest.auxiliaryArtifacts.find((ref:any)=>ref.fileName==='ConsentControlGeometryEvidence.json');assert.ok(ref);
  const geometryBytes=read(ref.uri);assert.equal(sha(geometryBytes),ref.sha256);
  if(scanId.startsWith('92533')){
   const screenshotRef=manifest.auxiliaryArtifacts.find((ref:any)=>ref.fileName==='screenshot-pre-consent-geometry-proof.png');assert.ok(screenshotRef);
   const screenshotBytes=read(screenshotRef.uri);assert.equal(sha(screenshotBytes),screenshotRef.sha256);
   const pixelCheck=JSON.parse(readFileSync(`${out}/retained-pixel-check.json`,'utf8'));
   assert.equal(pixelCheck.originalScreenshotSha256,screenshotRef.sha256);assert.equal(pixelCheck.comparison.screenshotSha256,screenshotRef.sha256);
  }
  const bundle=canonicalEvidenceBundleSchema.parse(JSON.parse(bytes.toString())),geometry=JSON.parse(geometryBytes.toString());
  const saved=await loadAnonymousPersistedScanReportProjection({scanId});assert.ok(saved);
  const persistedHash=sha(JSON.stringify(saved)),old=buildTimelineReportModel(saved),canonical=getPersistedCanonicalReportProjection(saved)!;
  const assessment=deriveMaterializedConsentControlAssessment({bundle,consentControlGeometryEvidence:geometry,scanId,finalUrl:bundle.url,requestedUrl:bundle.url,noGo:false});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:withCanonicalConsentAssessmentSnapshot({},assessment),reviewFindingCandidates:[],validationFindings:[]});
  assert.ok(concerns.filter(c=>c.originKey.startsWith('consent.cmp_audit.')).every(c=>!c.scoreEffects?.length));
  const cmpAudit=projectCmpAudit({scanId,consentControlAssessment:assessment,normalizedConcerns:concerns,checklistRows:canonical.checklistRows,unifiedFindings:canonical.ownerUnifiedFindings});
  const report={...old,cmpAudit},prepared={...report,...buildDetailedEvidenceExport(report)};
  assert.deepEqual(report.findings,old.findings);assert.deepEqual(report.accessibilityAudit,old.accessibilityAudit);
  assert.equal(sha(JSON.stringify(await loadAnonymousPersistedScanReportProjection({scanId}))),persistedHash,'No saved record was rewritten');
  if(scanId.startsWith('92533')){
   for(const id of ['consent_record','implementation','duration'])assert.equal(cmpAudit.rows.find(row=>row.id===id)!.status,'Incomplete');
   assert.match(cmpAudit.rows.find(row=>row.id==='implementation')!.detail!,/Accept: the control did not become actionable/);
   assert.match(cmpAudit.rows.find(row=>row.id==='implementation')!.detail!,/Reject: the banner did not become ready/);
   assert.match(cmpAudit.rows.find(row=>row.id==='prominence')!.detail!,/capture eligibility/);
   assert.ok(cmpAudit.limitationGroups?.some(group=>group.criterionIds.includes('implementation') && group.criterionIds.length===3));
  }else assert.equal(cmpAudit.rows.find(row=>row.id==='implementation')!.status,old.cmpAudit!.rows.find(row=>row.id==='implementation')!.status,'FullStory Review retained');
  writeFileSync(`${out}/${scanId}-canonical-preview.json`,JSON.stringify(prepared,null,2)+'\n');
  receipts.push({scanId,originalBundleSha256:sha(bytes),geometrySha256:sha(geometryBytes),originalManifestSha256:sha(manifestBytes),savedReportUnchanged:true,
   canonicalProjectionScoreNeutral:true,counts:Object.fromEntries([...new Set(cmpAudit.rows.map(row=>row.status))].map(status=>[status,cmpAudit.rows.filter(row=>row.status===status).length])),
   rows:cmpAudit.rows.map(({id,status,detail,limitation})=>({id,status,detail,limitation})),limitationGroups:cmpAudit.limitationGroups});
 }
 writeFileSync(`${out}/retained-verification.json`,JSON.stringify({publicScans:0,deployments:0,paidCalls:0,historicalWrites:0,receipts},null,2)+'\n');
 console.log(JSON.stringify(receipts.map(({scanId,counts,limitationGroups})=>({scanId,counts,limitationGroups})),null,2));
}
main().then(()=>process.exit()).catch(error=>{console.error(error);process.exit(1)});
