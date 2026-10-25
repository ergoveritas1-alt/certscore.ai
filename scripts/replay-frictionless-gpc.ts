/** CertScore.ai offline candidate replay. Reads only verified retained inputs.
 * Usage: pnpm exec tsx --tsconfig tsconfig.base.json scripts/replay-frictionless-gpc.ts SOURCE_INDEX OUTPUT_JSON
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {consentControlAssessmentSchema,FRICTIONLESS_GPC_FINDING_ID,OPT_OUT_SIGNAL_FINDING_ID,policyTextEvidenceProjectionSchema,type CaliforniaPolicyDocument,type CanonicalEvidenceBundle} from '@certscore/contracts';
import {projectFrictionlessGpcException} from '../apps/web/server/scans/frictionless-gpc-exception-projection';
import {projectPolicyChoiceMethods} from '../apps/web/server/scans/policy-choice-methods-projection';
import {projectOptOutNegativeSearch} from '../apps/web/server/scans/opt-out-negative-search';
import {retainDomOptOutLabel} from '../packages/certscore-scan-core/src/dom-opt-out-label';
import {projectDomOptOutPresenceSignal,projectOptOutPresenceSignal,projectReviewedOwnerOptOutDocuments} from '../apps/web/server/scans/opt-out-presence-signal-projection';
import {buildUnifiedFindingDisplayPackets} from '../apps/web/lib/scans/unified-findings';
import {projectCaliforniaChoicePresence,projectCaliforniaOptOutPresence,projectCaliforniaFrictionlessGpcException} from '../apps/web/lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../apps/web/lib/scans/california-regulatory-score';
const [input,output,option]=process.argv.slice(2);assert.ok(input&&output&&path.resolve(input)!==path.resolve(output));
assert.ok(option===undefined||option==='--opt-out-signals');const includeSignals=option==='--opt-out-signals';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const rows=JSON.parse(readFileSync(input,'utf8'));
const results=rows.map((row:{root:string;receipt:{scanId:string;host:string;parent:unknown;event:{metadata:{artifactMetadata:{scanArtifactUri:{sha256:string;sizeBytes:number}}}}};domDocuments?:Array<{path:string;sha256:string;sizeBytes:number;artifactId:string}>;documents:Array<{path:string;sha256:string;sizeBytes:number;evidenceRef:string;url:string;complete:boolean}>})=>{
 const r=row.receipt;assert.match(r.scanId,/^[a-f0-9-]{36}$/);const file=path.join(row.root,r.scanId,'CanonicalEvidenceBundle.json');assert.notEqual(path.resolve(output),path.resolve(file));
 const bytes=readFileSync(file),meta=r.event.metadata.artifactMetadata.scanArtifactUri;assert.equal(hash(bytes),meta.sha256);assert.equal(bytes.length,meta.sizeBytes);
 const bundle=JSON.parse(bytes.toString()) as CanonicalEvidenceBundle;assert.equal(bundle.scanId,r.scanId);
 // Artifact-only reprocessing uses the original verified DOM bytes and its own
 // retained identity. Never modify the original bundle or historical record.
 if(includeSignals)for(const d of row.domDocuments??[]){
   const raw=readFileSync(d.path);assert.equal(hash(raw),d.sha256);assert.equal(raw.length,d.sizeBytes);
   const manifest=JSON.parse(readFileSync(path.join(row.root,r.scanId,'manifest.json'),'utf8'));
   assert.ok(manifest.auxiliaryArtifacts.some((a:{sha256:string;sizeBytes:number})=>a.sha256===d.sha256&&a.sizeBytes===d.sizeBytes));
   const snapshot=bundle.domSnapshots.find(s=>s.artifactId===d.artifactId);assert.ok(snapshot?.documentIdentity);
   snapshot.optOutLabel=retainDomOptOutLabel({value:raw.toString('utf8'),url:snapshot.url,documentIdentity:snapshot.documentIdentity,capturedAtMs:snapshot.capturedAtMs},d.artifactId);
 }
 const parent=consentControlAssessmentSchema.parse(r.parent),frozen=JSON.stringify(parent),review=parent.californiaPrivacyReview;
 if(!review||review.contractVersion!=='certscore.california-privacy-review.v10')return {host:r.host,skipped:'historical_version'};
 assert.equal(review.sourceHash,meta.sha256,'Parent assessment must bind the verified original bundle');
 const signalDocuments:CaliforniaPolicyDocument[]=[];
 const ownedProjectionDocuments:unknown[]=[],allTexts:Array<{observationId:string;text:string}>=[];
 const documents:CaliforniaPolicyDocument[]=row.documents.flatMap(d=>{
   assert.notEqual(path.resolve(output),path.resolve(d.path));const b=readFileSync(d.path);assert.equal(hash(b),d.sha256);assert.equal(b.length,d.sizeBytes);
   const surface=bundle.policySurfaceObservations.find(s=>'policy-text:'+s.observationId===d.evidenceRef);
   const language=surface?.documentLanguage?.trim().toLowerCase();
   if(!d.complete||!surface||surface.translationApplied)return [];
   if(!review.reviewCoverage.sourceDocuments.some(s=>s.evidenceRef===d.evidenceRef&&s.sha256===d.sha256)){
     const manifest=JSON.parse(readFileSync(path.join(row.root,r.scanId,'manifest.json'),'utf8'));
     const retained=manifest.auxiliaryArtifacts.find((a:{sha256:string;sizeBytes:number})=>a.sha256===d.sha256&&a.sizeBytes===d.sizeBytes);assert.ok(retained);
     const text=b.toString('utf8');allTexts.push({observationId:surface.observationId,text});
     ownedProjectionDocuments.push({observationId:surface.observationId,artifactId:retained.fileName,artifactSha256:d.sha256,artifactSizeBytes:d.sizeBytes,
       artifactVerificationStatus:'verified',requestedUrl:new URL(surface.url!,bundle.normalizedUrl).href,finalUrl:surface.finalUrl,redirectChain:[],documentFormat:'text',
       documentFetchState:surface.documentFetchState,documentEvaluationState:surface.documentEvaluationState,documentRole:surface.documentRole,targetRelationship:surface.targetRelationship,
       contentCoverage:surface.contentCoverage,documentTextCoverage:surface.documentTextCoverage,retainedTextChars:text.length,retainedTextSha256:d.sha256,extractionStatus:'complete',limitationKeys:[]});
     return [];
   }
   const doc={evidenceRef:d.evidenceRef,textSha256:d.sha256,url:d.url,text:b.toString('utf8')};signalDocuments.push(doc);
   return language&&language.split('-')[0]!=='en'?[]:[doc];
 });
 const canonical=(value:typeof parent)=>{
   const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:value,gpcResponseAssessment:bundle.gpcResponseAssessment}});
   const info=packets.find(p=>p.unifiedFindingId===FRICTIONLESS_GPC_FINDING_ID);assert.equal(info?.scoreEffects?.length??0,0);
   const signal=packets.find(p=>p.unifiedFindingId===OPT_OUT_SIGNAL_FINDING_ID);assert.equal(signal?.scoreEffects?.length??0,0);
   return {infoFieldBytes:info?Object.fromEntries(Object.entries(info).map(([key,value])=>[key,Buffer.byteLength(JSON.stringify(value)??"")])):null,serializedBytes:Buffer.byteLength(JSON.stringify({assessment:value,packets})),score:deriveCaliforniaRegulatoryScore({assessment:value.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets}),
     presence:projectCaliforniaChoicePresence(packets,r.scanId,review.documentUrl),optOut:projectCaliforniaOptOutPresence(packets,r.scanId,review.documentUrl),exception:projectCaliforniaFrictionlessGpcException(packets,r.scanId,review.documentUrl)};
 };
 const before=canonical(parent),candidate=structuredClone(parent),exception=projectFrictionlessGpcException(review,documents,bundle.gpcResponseAssessment);
 const policyChoiceMethods=includeSignals?projectPolicyChoiceMethods(bundle,{sha256:meta.sha256,verificationStatus:"verified"},review.documentUrl):undefined;
 const ownerEvidence={projection:policyTextEvidenceProjectionSchema.parse({contractVersion:'certscore.policy-text-evidence-projection.v1',generatedAt:bundle.completedAt,scanId:r.scanId,
   sourceBundle:{schemaVersion:bundle.schemaVersion,sha256:meta.sha256,verificationStatus:'verified'},projectionStatus:'verified_complete',documents:ownedProjectionDocuments,limitationKeys:[]}),texts:allTexts};
 const optOutPresenceSignal=includeSignals&&!policyChoiceMethods?.methods.length?projectDomOptOutPresenceSignal(review,bundle,meta.sha256)??projectOptOutPresenceSignal(review,signalDocuments,projectReviewedOwnerOptOutDocuments(bundle,meta.sha256,ownerEvidence,review)):undefined;
 candidate.californiaPrivacyReview={...review,frictionlessGpcException:exception,...(policyChoiceMethods?{policyChoiceMethods}:{}),...(optOutPresenceSignal?{optOutPresenceSignal}:{})};
 const negative=includeSignals?projectOptOutNegativeSearch(candidate.californiaPrivacyReview!,documents):undefined;
 if(negative&&candidate.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10')candidate.californiaPrivacyReview.optOutNegativeSearch=negative;
 const after=canonical(consentControlAssessmentSchema.parse(candidate));assert.deepEqual(after.score,before.score);assert.deepEqual(after.presence,before.presence);assert.equal(JSON.stringify(parent),frozen);
 assert.ok(after.exception);assert.ok(Buffer.byteLength(JSON.stringify(exception))<=4096);
 return {host:r.host,scanId:r.scanId,sourceSha256:meta.sha256,verified:true,policyDocuments:documents.length,
   status:exception.status,basis:exception.basis,declaredDisclosures:exception.disclosures.filter(d=>d.status==='declared').map(d=>d.id),
   homepage:after.presence?.state??'unknown',...(includeSignals?{optOutBefore:before.optOut.state,optOutAfter:after.optOut.state,optOutPresenceSignal,policyChoiceMethods,optOutNegativeSearch:negative,absenceBlockers:review.inspection&&"limitationKeys" in review.inspection?review.inspection.limitationKeys:[]}:{}),scoreUnchanged:true,presenceUnchanged:true,infoFieldBytes:after.infoFieldBytes,serializedIncreaseBytes:after.serializedBytes-before.serializedBytes,metadataBytes:Buffer.byteLength(JSON.stringify(exception)),assessment:exception};
});
const report={product:'CertScore.ai',mode:'offline_future_assessment_candidate_only',liveVisits:0,productionWrites:0,historicalWrites:0,
 verified:results.filter((r:{verified?:boolean})=>r.verified).length,contradictions:results.filter((r:{status?:string})=>r.status==='contradicted_in_assessed_scope').length,
 unresolved:results.filter((r:{status?:string})=>r.status==='unresolved').length,...(includeSignals?{positiveRecoveries:results.filter(r=>'optOutBefore' in r&&r.optOutBefore==='unknown'&&r.optOutAfter==='observed').length}:{}),results};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:report.verified,contradictions:report.contradictions,unresolved:report.unresolved}));
