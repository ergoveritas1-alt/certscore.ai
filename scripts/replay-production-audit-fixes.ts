// Local-only replay: reads the frozen audit cohort and writes separate diagnostic artifacts.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildUnifiedFindingDisplayPackets} from '../apps/web/lib/scans/unified-findings';
import {projectPostRefusalEvidenceForReport} from '../packages/certscore-contracts/src/post-refusal-observation';
import {normalizeConcernFromReviewFindingCandidate} from '../apps/web/lib/scans/normalized-concerns';
import {projectCaliforniaObservedScoreBasis} from '../apps/web/server/scans/california-observed-score-basis';
import {deriveCaliforniaRegulatoryScore} from '../apps/web/lib/scans/california-regulatory-score';
import {californiaPrivacyReviewSchema} from '@certscore/contracts';
async function main(){
const {scanBundleText}=await import('../packages/certscore-mcp/src/tools.ts');
const input='artifacts/independent-production-audit-2026-10-22',output='artifacts/production-audit-fixes-2026-10-22';
const read=(p:string)=>JSON.parse(readFileSync(`${input}/${p}`,'utf8'));
mkdirSync(output,{recursive:true});
const inventory=read('inventory.json');const rows=[];
for(const scan of inventory){
 const path=`scans/${scan.id}`,report=read(`${path}/outputs/report.json`),bundle=read(`${path}/evidence/0/CanonicalEvidenceBundle.json`),mcp=read(`${path}/outputs/mcp.json`);
 const hash=createHash('sha256').update(readFileSync(`${input}/${path}/evidence/0/CanonicalEvidenceBundle.json`)).digest('hex');
 assert.equal(hash,scan.retained[0].hashes.scanArtifactUri.sha256);
 const contaminated=report.projection.normalizedConcerns.filter((c:any)=>c.evidenceBundle.runtimeArtifacts.some((s:string)=>s.startsWith('Consent governance disclosure note:')));
 const repaired=contaminated.map((c:any)=>{
  const raw=structuredClone(c.evidenceBundle.rawEvidence);
  // Persisted rawEvidence contains derived entity decorations. They are not producer evidence.
  if(raw.entities){delete raw.entities.consentGovernanceDisclosureEvidence;
   if(Array.isArray(raw.entities.findingSubtype))raw.entities.findingSubtype=raw.entities.findingSubtype.filter((s:string)=>s!=='consent_governance_disclosure_gap');}
  const next=normalizeConcernFromReviewFindingCandidate({title:c.title,description:c.description,observedValue:c.observedValue,
   severity:c.severity,sourceType:c.sourceType==='issue'?'issue':'signal',signalKey:c.signalKey,signalSource:c.signalSource,
   signalLabel:c.signalLabel,fallbackEvidence:raw});
  assert.ok(!next.evidenceBundle.runtimeArtifacts.some(s=>s.startsWith('Consent governance disclosure note:')));
  assert.ok(!next.evidenceBundle.flags.includes('consent_governance_disclosure_gap'));
  assert.equal(next.evidenceBundle.entities.consentGovernanceDisclosureEvidence,undefined);
  return {originKey:c.originKey,evidence:next.evidenceBundle};
 });
 const assessment=structuredClone(report.consentControlAssessment.californiaPrivacyReview);
 const noGo=read(`${path}/outputs/api.json`).resultDisposition==='no_go';
 const basis=assessment ? projectCaliforniaObservedScoreBasis(bundle,{sha256:hash,verificationStatus:'verified'},assessment.documentUrl) : undefined;
 if(noGo)assert.equal(basis,undefined);
 if(assessment&&basis)assessment.observedScoreBasis=basis;
 if(assessment)californiaPrivacyReviewSchema.parse(assessment);
 const meta=read(`${path}/persisted/audit-meta.json`);
 const runtime:any={...bundle,...meta,consentControlAssessment:{...report.consentControlAssessment,californiaPrivacyReview:assessment}};
 const rejectPath=`${input}/${path}/evidence/0/PostRefusalEvidencePacket.json`;
 if(existsSync(rejectPath))runtime.postRefusalEvidenceProjection=projectPostRefusalEvidenceForReport({packet:JSON.parse(readFileSync(rejectPath,'utf8')),
  packetSha256:createHash('sha256').update(readFileSync(rejectPath)).digest('hex')});
 const replayedFindings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 const familyIds=new Set(['gpc_response','california_post_reject_collection','california_collection_review','post_reject_click_tracking']);
 const relevant=report.projection.unifiedFindings.filter((f:any)=>familyIds.has(f.unifiedFindingId));
 for(const original of relevant){
  const next=replayedFindings.find(f=>f.unifiedFindingId===original.unifiedFindingId);
  assert.ok(next,`Missing replayed canonical finding ${scan.id} ${original.unifiedFindingId}`);
  assert.ok(!next.evidence.snippets.some(s=>s.startsWith('Consent governance disclosure note:')));
  assert.deepEqual(JSON.parse(JSON.stringify(next.scoreEffects??[])),original.scoreEffects??[],`Changed effects ${scan.id} ${original.unifiedFindingId}`);
 }
 const newFindings=report.projection.unifiedFindings.map((f:any)=>familyIds.has(f.unifiedFindingId)?replayedFindings.find(n=>n.unifiedFindingId===f.unifiedFindingId):f);
 const score=deriveCaliforniaRegulatoryScore({assessment,checklistRows:report.projection.checklist,unifiedFindings:newFindings});
 const oldScore=report.californiaScore;
 if(oldScore.score!==null){assert.equal(score.score,oldScore.score,'Existing numeric scores must remain identical');assert.deepEqual(JSON.parse(JSON.stringify(score.deductions)),oldScore.deductions,'Existing deductions must remain identical');}
 if(noGo)assert.equal(score.score,null);
 else assert.equal(typeof score.score,'number','Every reportable retained visit must have a score');
 const text=scanBundleText(mcp.structuredContent);
 assert.doesNotMatch(text,/Canonical score deduction:|decision verification=/);
 rows.push({scanId:scan.id,site:scan.hostname,noGo,oldCa:oldScore.score,newCa:score.score,eu:report.score.value,
   numericScoreUnchanged:oldScore.score===null?null:score.score===oldScore.score,
   fullTypedScoreUnchanged:oldScore.score===null?null:JSON.stringify(score)===JSON.stringify(oldScore),
   reprojectedCanonicalFamilies:relevant.map((f:any)=>f.unifiedFindingId),governanceConcernsRepaired:repaired.length,repairedConcerns:repaired,basis,
   deductionProseRemoved:mcp.content.some((c:any)=>c.text?.includes('Canonical score deduction:')),
   mcpText:text,score});
}
const summary={scans:rows.length,reportable:rows.filter(r=>!r.noGo).length,bothScores:rows.filter(r=>!r.noGo&&r.eu!==null&&r.newCa!==null).length,
 recoveredCalifornia:rows.filter(r=>!r.noGo&&r.oldCa===null).map(({scanId,site,newCa})=>({scanId,site,newCa})),
 numericScoresPreserved:rows.filter(r=>r.numericScoreUnchanged===true).length,noGoPreserved:rows.filter(r=>r.noGo&&r.newCa===null).length,
 governanceAffectedScans:rows.filter(r=>r.governanceConcernsRepaired>0).length,governanceConcernsRepaired:rows.reduce((n,r)=>n+r.governanceConcernsRepaired,0),
 mcpDeductionProseRemovedScans:rows.filter(r=>r.deductionProseRemoved).length};
assert.equal(summary.scans,65);assert.equal(summary.bothScores,54);assert.equal(summary.recoveredCalifornia.length,2);
writeFileSync(`${output}/cohort-replay.json`,JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary,null,2));

}
main().catch(error=>{console.error(error);process.exitCode=1;});
