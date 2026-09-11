// Run from the repository root against the original, unmodified local artifacts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalEvidenceBundleSchema} from '../../../../packages/certscore-contracts/src/index';
import {assessGpcObservationCompletion} from '../../../../packages/certscore-scan-core/src/gpc-observation-completion';
import {buildGpcProductionObservation} from '../../../../packages/certscore-scan-core/src/gpc-production-observation';
import {evaluateGpcObservationCompletionGate,type GpcObservationCompletionRow} from '../../../../scripts/lib/gpc-observation-completion-gate';
const root='artifacts/gpc-production-20260911';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function main(){
 const manifest=await read(root+'/acceptance-01/Manifest.json');
 const selected=await read(root+'/acceptance-prep/live-selection.json');
 const results=(await read(root+'/acceptance-01/Results.json')).results;
 const originalRows=await read(root+'/acceptance-01/CompletionRows.json');
 assert.equal(results.length,260); assert.equal(new Set(results.map((r:any)=>r.url)).size,260);
 assert.deepEqual(manifest.urls,selected.selected.map((r:any)=>r.url));
 assert.deepEqual(results.map((r:any)=>r.url),manifest.urls);
 assert.equal(hash(await readFile(root+'/acceptance-prep/live-selection.json')),manifest.selectionSha256);
 assert.equal(hash(await readFile(root+'/EgressProof.json')),manifest.egressSha256);
 for(const source of await read(root+'/acceptance-prep/source-hashes.json')) assert.equal(hash(await readFile(source.path)),source.sha256,source.path);
 const drift=[];
 for(const [file,expected] of Object.entries(manifest.implementationHashes)){
  const actual=hash(await readFile(file)); if(actual!==expected)drift.push({file,before:expected,after:actual});
 }
 assert.deepEqual(drift.map(r=>r.file).sort(),['packages/certscore-scan-core/src/gpc-production-observation.ts','scripts/run-gpc-observation-local.ts']);
 let sessions=0;const rows:GpcObservationCompletionRow[]=[], transitions:any[]=[],pointers:any[]=[];
 async function originalSource(dir:string,name:string){
  const file=dir+'/'+name+'.json';const pointer=await read(dir+'/'+name+'.pointer.json');const bytes=await readFile(file);
  assert.equal(pointer.uri,file);assert.equal(pointer.sizeBytes,bytes.length);assert.equal(pointer.sha256,hash(bytes));
  pointers.push({uri:file,sha256:pointer.sha256,sizeBytes:bytes.length});return{bytes,pointer};
 }
 for(const [index,r] of results.entries()){
  assert.ok(!/ergoverit/i.test(r.url));
  const dir=root+'/acceptance-01/'+r.scanId;const source=await originalSource(dir,'CanonicalEvidenceBundle');
  const bundle=canonicalEvidenceBundleSchema.parse(JSON.parse(source.bytes.toString()));
  assert.equal(bundle.scanId,r.scanId);assert.equal(bundle.url,r.url);
  let session;try{session=await originalSource(dir,'GpcObservationSession');sessions++;}catch(e:any){if(e.code!=='ENOENT')throw e;assert.equal(bundle.gpcObservationSession,undefined);}
  const assessment=assessGpcObservationCompletion({scanId:r.scanId,bundle:source,session});
  assert.deepEqual(assessment,r.assessment);
  const access=bundle.scanNoGoAssessment?.decision==='no_go'||bundle.scanEvidenceLaneAssessment?.outcome==='no_go'?'non_representative':bundle.scanEvidenceLaneAssessment?.lanes.homepageRuntime==='usable'?'representative':'unknown';
  assert.equal(access,r.representativeAccess);
  const row:GpcObservationCompletionRow={scanId:r.scanId,observationScope:'main_document_and_retained_http_requests',manifestEligible:true,representativeAccess:access,cohortSourceVerified:true,canary:false,retainedArtifactVerified:true,mainDocumentBindingVerified:assessment.documentBound,delivery:assessment.delivery,semanticProbe:{...assessment.semanticProbe,ended:assessment.semanticProbe.complete,terminalStatus:assessment.semanticProbe.terminalStatus==='invalid'?'incomplete':assessment.semanticProbe.terminalStatus},requestCapture:{...assessment.requestCapture,ended:assessment.requestCapture.complete},observedFactsDirect:assessment.sourceVerified};
  assert.deepEqual(row,originalRows[index]);rows.push(row);
  const production=buildGpcProductionObservation({scanId:r.scanId,source});
  const expected=structuredClone(r.productionObservation);
  if(access!=='representative'){
   expected.limitationKeys.push('representative_access_not_verified');
   if(expected.status==='complete')expected.status='limited';
  }
  assert.deepEqual(production,expected);
  assert.equal(production.status==='complete',assessment.completed&&access==='representative');
  if(JSON.stringify(production)!==JSON.stringify(r.productionObservation))transitions.push({scanId:r.scanId,access,from:r.productionObservation.status,to:production.status,addedLimitation:'representative_access_not_verified'});
 }
 const gate=evaluateGpcObservationCompletionGate(rows,{minimumRepresentativeRows:200});
 assert.deepEqual(gate,await read(root+'/acceptance-01/CompletionGate.json'));assert.equal(gate.targetAchieved,true);
 const out={version:'certscore.gpc-production-strict-retained-audit.v1',auditedAt:new Date().toISOString(),originalCanonicalPointers:results.length,originalSessionPointers:sessions,allOriginalChecksumsValid:true,allSidecarAssessmentsReplayExactly:true,allAccessClassificationsIndependentlyRecomputed:true,allFinalProductionProjectionsMatchExactExpected:true,unexpectedDifferences:0,sourceHashesVerified:true,unchangedCaptureHashes:true,postFreezeImplementationDrift:drift,expectedTransitions:transitions,gate,retainedPointerListSha256:hash(Buffer.from(JSON.stringify(pointers)))};
 await writeFile(root+'/StrictAudit.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({gate:gate.targetAchieved,complete:gate.completedRepresentativeCount,denominator:gate.representativeDenominator,transitions:transitions.length,sessions,drift:drift.map(r=>r.file)}));
}
void main().catch(e=>{console.error(e);process.exitCode=1});
