/** CertScore.ai offline candidate materialization. Retained bytes and reports are never rewritten.
 * Usage: pnpm exec tsx --tsconfig tsconfig.base.json scripts/replay-policy-choice-methods.ts RETAINED_ROOT OUTPUT_JSON
 * RETAINED_ROOT contains receipts.json and <scanId>/CanonicalEvidenceBundle.json.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {consentControlAssessmentSchema,POLICY_CHOICE_METHOD_FINDING_ID,type CanonicalEvidenceBundle} from '@certscore/contracts';
import {projectPolicyChoiceMethods} from '../apps/web/server/scans/policy-choice-methods-projection';
import {buildUnifiedFindingDisplayPackets} from '../apps/web/lib/scans/unified-findings';
import {projectCaliforniaChoicePresence,projectCaliforniaPolicyChoiceMethods} from '../apps/web/lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../apps/web/lib/scans/california-regulatory-score';
const [input,outputArg]=process.argv.slice(2);assert.ok(input&&outputArg);const root=path.resolve(input),output=path.resolve(outputArg);
assert.ok(output!==root&&!output.startsWith(root+path.sep),'Use an output outside frozen input');
const receipts=JSON.parse(readFileSync(root+'/receipts.json','utf8'));
const results=receipts.map((r:{scanId:string;host:string;parent:unknown;event:{metadata:{artifactMetadata:{scanArtifactUri:{sha256:string;sizeBytes:number}}}}})=>{
 assert.match(r.scanId,/^[a-f0-9-]{36}$/);const file=path.join(root,r.scanId,'CanonicalEvidenceBundle.json'),bytes=readFileSync(file);
 const sha=createHash('sha256').update(bytes).digest('hex'),receipt=r.event.metadata.artifactMetadata.scanArtifactUri;
 assert.equal(sha,receipt.sha256);assert.equal(bytes.length,receipt.sizeBytes);
 const bundle=JSON.parse(bytes.toString()) as CanonicalEvidenceBundle;assert.equal(bundle.scanId,r.scanId);
 const parent=consentControlAssessmentSchema.parse(r.parent),frozen=JSON.stringify(parent);assert.ok(parent.californiaPrivacyReview);
 const review=parent.californiaPrivacyReview;
 const project=(value:typeof parent)=>{
   const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:value,gpcResponseAssessment:bundle.gpcResponseAssessment}});
   return {homepage:projectCaliforniaChoicePresence(packets,r.scanId,review.documentUrl),methods:projectCaliforniaPolicyChoiceMethods(packets,r.scanId,review.documentUrl),
     score:deriveCaliforniaRegulatoryScore({assessment:value.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets}),
     informational:packets.filter(p=>p.unifiedFindingId===POLICY_CHOICE_METHOD_FINDING_ID).map(p=>({title:p.title,summary:p.summary,reportable:p.surfacingDecision.reportable,scoreEffects:p.scoreEffects}))};
 };
 const before=project(parent),candidate=structuredClone(parent);
 const methods=projectPolicyChoiceMethods(bundle,{sha256:sha,verificationStatus:'verified'},review.documentUrl);
 if(methods)candidate.californiaPrivacyReview!.policyChoiceMethods=methods;
 const after=project(consentControlAssessmentSchema.parse(candidate));
 assert.deepEqual(before.score,after.score);assert.deepEqual(before.homepage,after.homepage);assert.equal(JSON.stringify(parent),frozen);
 return {host:r.host,scanId:r.scanId,sourceSha256:sha,verified:true,scoreUnchanged:true,homepageUnchanged:true,methods:after.methods,informational:after.informational};
});
const report={product:'CertScore.ai',mode:'offline_future_materialization_candidate',liveVisits:0,historicalWrites:0,verified:results.length,
 scopedPositives:results.filter((r:{methods:unknown})=>r.methods).map((r:{host:string})=>r.host),results};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:report.verified,scopedPositives:report.scopedPositives}));
