import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalEvidenceBundleSchema,consentControlAssessmentSchema} from '../../packages/certscore-contracts/src';
const require=createRequire(import.meta.url);require.cache[require.resolve('server-only')]={exports:{}} as any;
const root='artifacts/hubspot-fresh-verification-20261014';
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
async function main(){
 assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 globalThis.fetch=(async()=>{throw Error('No HTTP/model calls during retained verification');}) as typeof fetch;
 const {loadAnonymousPersistedScanReportProjection}=await import('../../apps/web/server/scans/scan-report-projection');
 const {deriveMaterializedConsentControlAssessment}=await import('../../apps/web/server/scans/consent-control-assessment-projector');
 const results=JSON.parse(readFileSync(`${root}/targeted/results.json`,'utf8'));assert.equal(results.length,1);
 const receipts=[];
 for(const row of results){
  assert.equal(row.status,'completed');assert.equal(row.verificationError,undefined);
  const summary=JSON.parse(readFileSync(`artifacts/local-v2-dag-lambda-simulated/${row.scanId}/summary.json`,'utf8'));
  const terminal=summary.sqsMessages.filter((x:any)=>x.status==='completed');assert.equal(terminal.length,1);
  const event=terminal[0],read=(uri:string)=>{const u=new URL(uri);return readFileSync(`${summary.fakeS3Root}/${u.hostname}${u.pathname}`)};
  const raw=read(event.artifactPointers.scanArtifactUri);assert.equal(sha(raw),event.artifactMetadata.scanArtifactUri.sha256);
  const manifestBytes=read(event.artifactPointers.manifestUri);assert.equal(sha(manifestBytes),event.artifactMetadata.manifestUri.sha256);
  const manifest=JSON.parse(manifestBytes.toString());const geometryRef=manifest.auxiliaryArtifacts.find((x:any)=>x.fileName==='ConsentControlGeometryEvidence.json');
  let geometry:any;if(geometryRef){const bytes=read(geometryRef.uri);assert.equal(sha(bytes),geometryRef.sha256);geometry=JSON.parse(bytes.toString());}
  const bundle=canonicalEvidenceBundleSchema.parse(JSON.parse(raw.toString()));
  const saved:any=await loadAnonymousPersistedScanReportProjection({scanId:row.scanId});assert.ok(saved);
  const savedHash=sha(JSON.stringify(saved.canonicalReportProjection));
  const stored=consentControlAssessmentSchema.parse(saved.runtimeArtifacts.consentControlAssessment??saved.runtimeArtifacts.consent_control_assessment);
  const replay=deriveMaterializedConsentControlAssessment({bundle,consentControlGeometryEvidence:geometry,scanId:row.scanId,finalUrl:bundle.url,requestedUrl:bundle.url,noGo:false});
  assert.deepEqual(JSON.parse(JSON.stringify(replay.cmpAudit)),JSON.parse(JSON.stringify(stored.cmpAudit)),'Fresh persisted CMP assessment equals canonical replay');
  const restore=JSON.parse(readFileSync(`${root}/targeted/${new URL(row.url).hostname}.quota-restored.json`,'utf8'));
  assert.equal(restore.restoredTo,20);assert.equal(restore.originalSha256,restore.restoredSha256);
  assert.equal(sha(JSON.stringify((await loadAnonymousPersistedScanReportProjection({scanId:row.scanId}))!.canonicalReportProjection)),savedHash);
  if(row.url==='https://gatech.edu'){
   assert.equal(bundle.cmpPreferencesEvidence?.configuredConsentCookies?.[0]?.name,'cookie_compliance');
   assert.equal(row.cmpRows.find((x:any)=>x.id==='consent_record').status,'Observed');
   assert.equal(row.cmpRows.find((x:any)=>x.id==='duration').status,'Observed');
  }
  receipts.push({url:row.url,scanId:row.scanId,elapsedMs:row.elapsedMs,originalBundleAndManifestVerified:true,geometryVerified:Boolean(geometry),canonicalCmpReplayMatchesPersisted:true,reportExportParity:true,quotaRestored:true,
   counts:Object.fromEntries([...new Set<string>(row.cmpRows.map((x:any)=>x.status))].map(s=>[s,row.cmpRows.filter((x:any)=>x.status===s).length])),
   preference:{support:bundle.cmpPreferencesEvidence?.support,diagnostic:bundle.cmpPreferencesEvidence?.inspectionDiagnostic,checkpoints:bundle.cmpPreferencesEvidence?.checkpoints,categories:bundle.cmpPreferencesEvidence?.controls,services:bundle.cmpPreferencesEvidence?.serviceNames},prominence:{status:row.cmpRows.find((x:any)=>x.id==='prominence')?.status,measured:Boolean(geometry?.visualComparison),captureSkewMs:geometry?.visualComparison?.captureSkewMs},actionDetails:{accept:bundle.postAcceptEvidence?.acceptanceRegistration,reject:bundle.postRefusalEvidence?.refusalRegistration},actions:['postAcceptEvidence','postRefusalEvidence'].map(key=>({action:key,click:(bundle as any)[key]?.interactionDiagnostics?.click.outcome,limitations:(bundle as any)[key]?.limitations})),
   reportUrl:`http://localhost:3000/scan/${row.scanId}#cmp-details`});
 }
 assert.equal(readFileSync('apps/web/server/pulse/anonymous-scan-quota.ts','utf8').split('\n')[0],'export const ANONYMOUS_SCAN_DAILY_LIMIT = 20;');
 writeFileSync(`${root}/fresh-verification-summary.json`,JSON.stringify({newScans:1,extraRescans:0,deployments:0,quotaRestoredTo:20,receipts},null,2)+'\n');
 console.log(JSON.stringify(receipts,null,2));
}
main().then(()=>process.exit()).catch(e=>{console.error(e);process.exit(1)});
