import test from 'node:test';import assert from 'node:assert/strict';
import {validateModelReview,compareModelReviews} from './evaluate-ar-ai-holdout.mjs';
const packet={bundleIntegrityVerified:true,screenshots:[{path:'/retained/image.png',file:'image.png'}],texts:[],observations:[]};
const entry={caseId:'001',packetSha256:'h',scanId:'s1',domain:'example.test',cohort:'random'};
const label=state=>({state,rationale:'Visible retained first-layer evidence.',evidenceRefs:['image:image.png']});
const review={caseId:'001',packetSha256:'h',reviewerModel:'gpt-6-sol',provenance:'model_reviewed',independentlyReviewed:false,humanAdjudicated:false,viewedImages:['/retained/image.png'],usability:'usable',accept:label('observed'),reject:label('not_observed')};
test('model provenance cannot masquerade as human labels or invent a viewed screenshot',()=>{
 assert.equal(validateModelReview(review,entry,packet),review);
 for(const patch of [{independentlyReviewed:true},{humanAdjudicated:true},{viewedImages:[]},{viewedImages:['/invented.png']},{packetSha256:'changed'},{usability:'unusable'}])assert.throws(()=>validateModelReview({...review,...patch},entry,packet));
});
test('separates omitted positives, binary mistakes and challenge cohort',()=>{
 const manifest=[entry,{...entry,caseId:'002',scanId:'s2',cohort:'challenge'}];
 const predictions=[{scanId:'s1',report:null,canonical:{accept:'unknown',reject:'unknown'}},{scanId:'s2',report:{accept:'not_observed',reject:'observed'},canonical:{accept:'unknown',reject:'observed'}}];
 const r=compareModelReviews(manifest,predictions,[review,{...review,caseId:'002'}]);
 assert.equal(r.cohorts.random.controls.accept.matrix.unavailable.observed,1);
 assert.equal(r.cohorts.random.controls.accept.matrix.not_observed.observed,0);
 assert.equal(r.cohorts.challenge.controls.accept.matrix.not_observed.observed,1);
 assert.equal(r.cohorts.challenge.controls.reject.matrix.observed.not_observed,1);
 assert.equal(r.disagreements.length,4);
 assert.equal(compareModelReviews(manifest,predictions,[]).cohorts.random.controls.accept.comparisonRates,null);
});
