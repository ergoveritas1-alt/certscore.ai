import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReview,summarize,wilson} from './evaluate-ar-human-holdout.mjs';
const packet={bundleIntegrityVerified:true,screenshots:[],texts:[],observations:[]};
const entry={caseId:'001',scanId:'scan1',packetSha256:'a',cohort:'random'};
const label=state=>({state,rationale:'Visible first-layer retained evidence.',evidenceRefs:['packet:coverage']});
const review={caseId:'001',packetSha256:'a',reviewer:'Human reviewer',reviewedAt:'2026-09-27T10:00:00Z',attestations:{human:true,evidenceOnly:true,noModel:true,noPredictions:true},usability:'usable',accept:label('observed'),reject:label('not_observed')};
test('rejects evidence drift, model/provisional labels and fabricated references',()=>{
 assert.equal(validateReview(review,entry,packet),review);
 for(const bad of [{...review,packetSha256:'b'},{...review,reviewer:''},{...review,attestations:{...review.attestations,noModel:false}},{...review,attestations:{...review.attestations,noPredictions:false}},{...review,accept:{...review.accept,evidenceRefs:['not-retained']}}])assert.throws(()=>validateReview(bad,entry,packet));
 assert.throws(()=>validateReview(review,entry,{...packet,bundleIntegrityVerified:false}));
 assert.throws(()=>validateReview({...review,usability:'unusable'},entry,packet));
});
test('keeps cohorts separate and counts omitted positives as misses without manufacturing binary negatives',()=>{
 const manifest=[entry,{...entry,caseId:'002',scanId:'scan2'},{...entry,caseId:'003',scanId:'scan3',cohort:'challenge'}];
 const predictions=[{scanId:'scan1',report:{accept:'not_observed',reject:'observed'}},{scanId:'scan2',report:null},{scanId:'scan3',report:{accept:'observed',reject:'not_observed'}}];
 const reviews=[review,{...review,caseId:'002'},{...review,caseId:'003'}];
 const s=summarize(predictions,manifest,reviews);
 assert.equal(s.cohorts.random.controls.accept.counts.falseNegative,1);
 assert.equal(s.cohorts.random.controls.accept.counts.unavailableWithPresent,1);
 assert.equal(s.cohorts.random.controls.accept.rates.missedPresentControlRate.value,1);
 assert.equal(s.cohorts.random.controls.reject.counts.falsePositive,1);
 assert.equal(s.cohorts.challenge.controls.accept.rates.observedPrecision.value,1);
 assert.equal(summarize(predictions,manifest,[review]).cohorts.random.controls.accept.rates,null);
});
test('unusable visits with binary output are recorded separately and zero denominators stay null',()=>{
 const s=summarize([{scanId:'scan1',report:{accept:'observed',reject:'not_observed'}}],[entry],[{...review,usability:'unusable',accept:label('unverifiable'),reject:label('unverifiable')}]);
 assert.equal(s.cohorts.random.controls.accept.counts.unusableCasesWithBinaryOutput,1);
 assert.equal(s.cohorts.random.controls.accept.rates.observedPrecision,null);
 assert.equal(wilson(0,0),null);
 assert.ok(wilson(9,10).interval95[0]<0.9);
 assert.ok(wilson(9,10).interval95[1]>0.9);
});
