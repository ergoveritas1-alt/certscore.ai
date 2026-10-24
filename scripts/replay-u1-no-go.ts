/** Offline retained-evidence regression. Never launches scans or writes reports. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {canonicalEvidenceBundleSchema} from '@certscore/contracts';
import {mergeLocalV2DagLambdaEvidenceLaneBundles} from '../apps/v2-dag-lambda/src/handler';
import {hasRepresentativeRuntimeEvidence} from '../apps/v2-dag-lambda/src/runtime-representative-evidence';
import {resolveScanReportScore} from '../apps/web/lib/scans/scan-report-disposition';
const root=path.resolve(process.argv[2]!);const input=path.resolve(process.argv[3]!);const out=path.resolve(process.argv[4]!);
assert.ok(root&&input&&out&&out!==root&&out!==input);mkdirSync(out,{recursive:true});
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const ids=['4170c762-890b-4b29-9e17-ae5b4bf4abb8','a32fb82a-4f3e-40f6-bf29-86bd644bcee5','76f124da-c939-462e-8ca1-1fc52cb8e5dc'];
const receipts=read(path.join(root,'evidence-retrieval-receipts.json'));const cases=[];
for(const id of ids){
 const bytes=readFileSync(path.join(root,'scans',id,'evidence/0/CanonicalEvidenceBundle.json'));const receipt=receipts.find((r:any)=>r.scanId===id&&r.kind==='scanArtifactUri'&&r.eventIndex===0);
 assert.equal(sha(bytes),receipt.expected.sha256);const original=JSON.parse(bytes.toString());
 const load=(lane:string)=>canonicalEvidenceBundleSchema.parse(read(path.join(input,`${id}-${lane}.json`)));
 const runtime=load('runtime_evidence'),consent=load('consent_proof'),policy=load('policy_evidence');
 // Runtime content is independently joined to the previously verified merged packet.
 assert.deepEqual(runtime.accessibilityAudit,original.accessibilityAudit);
 assert.deepEqual(runtime.networkEvents,original.networkEvents);
 assert.deepEqual(runtime.networkResponseEvents,original.networkResponseEvents);
 assert.equal(runtime.domSnapshots[0]?.textExcerpt,original.runtimeMetadataSnapshots[0]?.textExcerpt);
 assert.deepEqual(runtime.domSnapshots[0]?.documentIdentity,original.runtimeMetadataSnapshots[0]?.documentIdentity);
 assert.equal(consent.scanNoGoAssessment?.decision,'no_go');
 const before=JSON.stringify([runtime,consent,policy]);
 const merged=mergeLocalV2DagLambdaEvidenceLaneBundles({artifactRoot:'/tmp/u1-offline',scanId:id,runtimeEvidence:runtime,consentProof:consent,policyEvidence:policy});
 const isU1=id===ids[2];assert.equal(merged.scanNoGoAssessment?.decision,isU1?'no_go':'continue_with_diagnostics');
 const score=resolveScanReportScore({runtimeArtifacts:{scan_no_go_assessment:merged.scanNoGoAssessment}},100);
 assert.equal(score,isU1?null:100);assert.equal(before,JSON.stringify([runtime,consent,policy]));
 cases.push({scanId:id,url:runtime.url,originalDecision:original.scanNoGoAssessment.decision,candidateDecision:merged.scanNoGoAssessment?.decision,representativeContent:hasRepresentativeRuntimeEvidence(runtime),candidateScoreEligible:score!==null,originalSha256:sha(bytes),laneHashes:Object.fromEntries(['runtime_evidence','consent_proof','policy_evidence'].map(lane=>[lane,sha(readFileSync(path.join(input,`${id}-${lane}.json`)))]))});
}
let cohort=0,disagreements=0;
for(const id of readdirSync(path.join(root,'scans'))){
 let b;try{b=read(path.join(root,'scans',id,'evidence/0/CanonicalEvidenceBundle.json'));}catch{continue;}cohort++;
 if(b.scanNoGoAssessment?.contradictorCodes?.includes('independent_runtime_evidence_representative_page')){disagreements++;assert.ok(ids.includes(id),'Every affected cohort disagreement must be replayed');}
}
assert.equal(disagreements,3);
const result={status:'passed',cohortBundles:cohort,disagreementsReplayed:disagreements,changedDecisions:1,unchangedIndependentVisitControls:2,historicalPacketsUnchanged:true,productionWrites:0,cases};
writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
