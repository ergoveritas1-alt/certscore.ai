import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {evidenceReferences,sha256} from './evaluate-ar-human-holdout.mjs';

export function validateModelReview(review, entry, packet) {
  assert.equal(review.caseId,entry.caseId,'Case mismatch');
  assert.equal(review.packetSha256,entry.packetSha256,'Packet hash mismatch');
  assert.equal(review.provenance,'model_reviewed','Model provenance required');
  assert.equal(review.independentlyReviewed,false,'Model labels cannot be independent human review');
  assert.equal(review.humanAdjudicated,false,'Model labels cannot be human adjudication');
  assert.ok(typeof review.reviewerModel==='string' && review.reviewerModel.length>3,'Model ID required');
  assert.ok(['usable','unusable','unverifiable'].includes(review.usability),'Invalid usability');
  assert.ok(Array.isArray(review.viewedImages),'Actual viewed image list required');
  const images=new Set(packet.screenshots.map(s=>s.path));
  assert.ok(review.viewedImages.every(p=>images.has(p)),'Viewed image is not retained in this packet');
  if(images.size)assert.ok(review.viewedImages.length>0,'Retained screenshot review is required');
  const refs=new Set(evidenceReferences(packet));
  for(const control of ['accept','reject']){
    const label=review[control];
    assert.ok(['observed','not_observed','unverifiable'].includes(label?.state),'Invalid control label');
    assert.ok(typeof label.rationale==='string'&&label.rationale.trim().length>=10,'Specific rationale required');
    assert.ok(Array.isArray(label.evidenceRefs)&&label.evidenceRefs.length>0&&label.evidenceRefs.every(r=>refs.has(r)),'Invalid evidence refs');
    if(review.usability!=='usable'||!packet.bundleIntegrityVerified)assert.equal(label.state,'unverifiable','Unusable evidence must not get binary labels');
  }
  return review;
}

export function compareModelReviews(manifest,predictions,reviews){
  const byCase=new Map(reviews.map(r=>[r.caseId,r]));
  const byScan=new Map(predictions.map(p=>[p.scanId,p]));
  const cohorts={}, disagreements=[];
  for(const cohort of ['random','challenge']){
    const cases=manifest.filter(c=>c.cohort===cohort);
    const reviewed=cases.filter(c=>byCase.has(c.caseId));
    const controls={};
    for(const control of ['accept','reject']){
      const matrix=Object.fromEntries(['observed','not_observed','unavailable'].map(pred=>[pred,{observed:0,not_observed:0,unverifiable:0}]));
      const canonicalMatrix=Object.fromEntries(['observed','not_observed','unknown'].map(pred=>[pred,{observed:0,not_observed:0,unverifiable:0}]));
      let unusableWithBinaryOutput=0;
      for(const entry of reviewed){
        const r=byCase.get(entry.caseId), p=byScan.get(entry.scanId);assert.ok(p,'Missing prediction');
        const predicted=p.report?.[control]??'unavailable', model=r[control].state;
        matrix[predicted][model]++;
        canonicalMatrix[p.canonical[control]][model]++;
        if(r.usability!=='usable'&&predicted!=='unavailable')unusableWithBinaryOutput++;
        if((model!=='unverifiable'&&model!==predicted)||(r.usability!=='usable'&&predicted!=='unavailable'))disagreements.push({caseId:entry.caseId,scanId:entry.scanId,domain:entry.domain,cohort,control,report:predicted,canonical:p.canonical[control],model,usability:r.usability,reviewer:r.reviewerModel,diagnosticPattern:r.diagnosticPattern,rationale:r[control].rationale,evidenceRefs:r[control].evidenceRefs});
      }
      const m=matrix, rate=(n,d)=>d?{numerator:n,denominator:d,percent:100*n/d}:null;
      controls[control]={matrix,canonicalMatrix,unusableWithBinaryOutput,comparisonRates:reviewed.length===cases.length?{
        observedAgreementAmongModelVerifiable:rate(m.observed.observed,m.observed.observed+m.observed.not_observed),
        notObservedDisagreementAmongModelVerifiable:rate(m.not_observed.observed,m.not_observed.observed+m.not_observed.not_observed),
        missedModelObservedIncludingUnavailable:rate(m.not_observed.observed+m.unavailable.observed,m.observed.observed+m.not_observed.observed+m.unavailable.observed),
      }:null};
    }
    cohorts[cohort]={totalCases:cases.length,reviewedCases:reviewed.length,complete:cases.length>0&&reviewed.length===cases.length,usability:reviewed.reduce((a,c)=>{const u=byCase.get(c.caseId).usability;a[u]=(a[u]??0)+1;return a},{}),controls};
  }
  return {status:Object.values(cohorts).every(c=>c.complete)?'model_review_complete':'model_review_partial',cohorts,disagreements};
}

export async function evaluateModelReviews(root){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'review-manifest.json'),'utf8'));
  const bytes=await fs.readFile(path.join(root,'frozen-predictions.json'));
  const hash=sha256(bytes);assert.equal(hash,(await fs.readFile(path.join(root,'frozen-predictions.sha256'),'utf8')).trim(),'Prediction freeze drift');
  const frozen=JSON.parse(bytes);
  assert.equal(sha256(await fs.readFile(path.join(root,'source.json'))),frozen.sourceSha256,'Source drift');
  assert.equal(sha256(await fs.readFile(path.join(root,'selection.json'))),frozen.selectionSha256,'Selection drift');
  const reviews=[];
  for(const batch of [1,2,3]){
    const file=path.join(root,`ai-reviews-${batch}.json`);
    let items;try{items=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
    assert.ok(Array.isArray(items),'Batch must be an array');reviews.push(...items);
  }
  assert.equal(new Set(reviews.map(r=>r.caseId)).size,reviews.length,'Duplicate review');
  for(const review of reviews){
    const entry=manifest.find(m=>m.caseId===review.caseId);assert.ok(entry,'Unknown case');
    const packetBytes=await fs.readFile(entry.packetPath);assert.equal(sha256(packetBytes),entry.packetSha256,'Packet drift');
    const packet=JSON.parse(packetBytes);assert.equal(packet.scanId,entry.scanId,'Packet scan mismatch');
    for(const image of packet.screenshots)assert.equal(sha256(await fs.readFile(image.path)),image.sha256,'Image drift');
    for(const text of packet.texts)assert.equal(sha256(text.text),text.sha256,'Text drift');
    validateModelReview(review,entry,packet);
  }
  const result={schemaVersion:'ar-ai-comparison.v1',generatedAt:new Date().toISOString(),frozenPredictionsSha256:hash,labelProvenance:'model_reviewed',independentlyReviewed:false,humanAdjudicated:false,reviewerModels:[...new Set(reviews.map(r=>r.reviewerModel))],...compareModelReviews(manifest,frozen.predictions,reviews),limitations:[
    'Agreement with AI reviewers is not human-validated detection accuracy or calibrated probability.',
    'Random and challenge cohorts are kept separate. Recent domain groups are not traffic-weighted scans.',
    'The binary report rule was frozen before review; historical assessments are not rerun through classifier v7.',
    'No product conclusion, canonical human label, production record or score is changed by this analysis.',
    'This sample has now been examined by models; do not reuse it as an untouched evaluation for rules developed from its disagreements.',
  ]};
  await fs.writeFile(path.join(root,'ai-all-reviews.json'),JSON.stringify(reviews,null,2));
  await fs.writeFile(path.join(root,'ai-comparison.json'),JSON.stringify(result,null,2));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(!process.argv[2])throw new Error('Usage: node scripts/evaluate-ar-ai-holdout.mjs ROOT');
  evaluateModelReviews(process.argv[2]).then(r=>console.log(JSON.stringify({status:r.status,reviewers:r.reviewerModels,cohorts:Object.fromEntries(Object.entries(r.cohorts).map(([k,v])=>[k,{total:v.totalCases,reviewed:v.reviewedCases}]))}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
