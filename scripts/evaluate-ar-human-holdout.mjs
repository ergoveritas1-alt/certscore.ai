import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const STATES = ['observed', 'not_observed', 'unverifiable'];
export function evidenceReferences(packet) {
  return [
    ...packet.screenshots.map(s => `image:${s.file}`),
    ...packet.texts.map(t => `text:${t.file}`),
    ...(packet.geometry?.pageUrl ? ['geometry:inventory'] : []),
    ...(packet.geometry?.candidates ?? []).map(c => `candidate:${c.candidateId}`),
    ...(packet.observations ?? []).map(o => `observation:${o.observationId}`),
    'packet:coverage',
  ];
}

export function validateReview(review, entry, packet) {
  assert.equal(review.caseId, entry.caseId, 'Case ID mismatch');
  assert.equal(review.packetSha256, entry.packetSha256, 'Evidence hash mismatch');
  assert.ok(typeof review.reviewer === 'string' && review.reviewer.trim().length >= 2, 'Named human reviewer required');
  assert.ok(typeof review.reviewedAt === 'string' && Number.isFinite(Date.parse(review.reviewedAt)), 'Review timestamp required');
  for (const key of ['human', 'evidenceOnly', 'noModel', 'noPredictions']) {
    assert.equal(review.attestations?.[key], true, `Missing ${key} attestation`);
  }
  assert.ok(['usable', 'unusable', 'unverifiable'].includes(review.usability), 'Page usability required');
  const refs = new Set(evidenceReferences(packet));
  for (const control of ['accept', 'reject']) {
    const label = review[control];
    assert.ok(STATES.includes(label?.state), `Invalid ${control} label`);
    assert.ok(typeof label.rationale === 'string' && label.rationale.trim().length >= 10, `${control} rationale required`);
    assert.ok(Array.isArray(label.evidenceRefs) && label.evidenceRefs.length > 0 && label.evidenceRefs.every(r => refs.has(r)), `${control} evidence references invalid`);
    if (!packet.bundleIntegrityVerified || review.usability !== 'usable') {
      assert.equal(label.state, 'unverifiable', 'Unusable/unverified evidence cannot receive binary truth labels');
    }
  }
  return review;
}

export function wilson(successes, trials) {
  if (!trials) return null;
  const z = 1.959963984540054, p = successes / trials, d = 1 + z*z/trials;
  const center = (p + z*z/(2*trials))/d;
  const delta = z*Math.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/d;
  return {value:p, numerator:successes, denominator:trials, interval95:[center-delta,center+delta]};
}

export function summarize(predictions, manifest, reviews) {
  const result = {};
  const byScan = new Map(predictions.map(p => [p.scanId,p]));
  const byCase = new Map(reviews.map(r => [r.caseId,r]));
  for (const cohort of ['random', 'challenge']) {
    const cases = manifest.filter(m => m.cohort === cohort);
    const reviewed = cases.filter(m => byCase.has(m.caseId));
    const complete = cases.length > 0 && reviewed.length === cases.length;
    const controls = {};
    for (const control of ['accept','reject']) {
      const counts = {truePositive:0,falsePositive:0,trueNegative:0,falseNegative:0,unavailableWithPresent:0,unavailableWithAbsent:0,unverifiableTruth:0,unusableCasesWithBinaryOutput:0};
      for (const entry of reviewed) {
        const r = byCase.get(entry.caseId), p = byScan.get(entry.scanId);
        assert.ok(p, 'Missing frozen prediction');
        const truth = r[control].state, predicted = p.report?.[control] ?? 'unavailable';
        if (r.usability !== 'usable') {
          if (predicted !== 'unavailable') counts.unusableCasesWithBinaryOutput++;
          counts.unverifiableTruth++; continue;
        }
        if (truth === 'unverifiable') { counts.unverifiableTruth++; continue; }
        if (predicted === 'unavailable') { counts[truth === 'observed'?'unavailableWithPresent':'unavailableWithAbsent']++; continue; }
        const key = truth === 'observed' ? (predicted === 'observed'?'truePositive':'falseNegative') : (predicted === 'observed'?'falsePositive':'trueNegative');
        counts[key]++;
      }
      const c=counts, present=c.truePositive+c.falseNegative+c.unavailableWithPresent;
      controls[control] = {counts, rates: complete ? {
        observedPrecision:wilson(c.truePositive,c.truePositive+c.falsePositive),
        notObservedErrorRate:wilson(c.falseNegative,c.falseNegative+c.trueNegative),
        missedPresentControlRate:wilson(c.falseNegative+c.unavailableWithPresent,present),
        recallIncludingUnavailable:wilson(c.truePositive,present),
        reportCoverageOnVerifiableTruth:wilson(c.truePositive+c.falsePositive+c.trueNegative+c.falseNegative,reviewed.length-c.unverifiableTruth),
      } : null};
    }
    result[cohort]={totalCases:cases.length,reviewedCases:reviewed.length,complete,controls};
  }
  return {status:Object.values(result).every(c=>c.complete)?'human_review_complete':'awaiting_human_review',cohorts:result,notes:[
    'Random cohort estimates apply to the defined recent unique-domain sampling frame, not traffic-weighted production scans.',
    'Challenge results are diagnostic and are never pooled into random-cohort accuracy.',
    'Rates remain withheld until the entire corresponding cohort is reviewed; unverifiable truth is reported separately.',
    'Unavailable output counts as a missed present control in recall; binary negative errors are also reported separately.',
    'Wilson intervals are per-control binomial intervals. These are detection metrics, not calibrated model probabilities.',
    'Labels are evidence-only human review candidates; this tool does not write a canonical corpus or production record.',
  ]};
}

export async function evaluate(root, reviewsFile) {
  const manifest=JSON.parse(await fs.readFile(path.join(root,'review-manifest.json'),'utf8'));
  const predictionBytes=await fs.readFile(path.join(root,'frozen-predictions.json'));
  assert.equal(sha256(predictionBytes),(await fs.readFile(path.join(root,'frozen-predictions.sha256'),'utf8')).trim(),'Frozen prediction hash mismatch');
  const frozen=JSON.parse(predictionBytes);
  assert.equal(sha256(await fs.readFile(path.join(root,'source.json'))),frozen.sourceSha256,'Source changed after freeze');
  assert.equal(sha256(await fs.readFile(path.join(root,'selection.json'))),frozen.selectionSha256,'Selection changed after freeze');
  assert.equal(new Set(manifest.map(m=>m.caseId)).size,manifest.length,'Duplicate manifest cases');
  assert.equal(new Set(frozen.predictions.map(p=>p.scanId)).size,manifest.length,'Prediction coverage mismatch');
  for(const entry of manifest)assert.ok(frozen.predictions.some(p=>p.scanId===entry.scanId && p.cohort===entry.cohort),'Manifest/prediction mismatch');
  const input=reviewsFile ? JSON.parse(await fs.readFile(reviewsFile,'utf8')) : {schemaVersion:'ar-human-review.v1',reviews:[]};
  assert.equal(input.schemaVersion,'ar-human-review.v1','Review schema mismatch');
  if (reviewsFile) assert.equal(input.frozenPredictionsSha256,sha256(predictionBytes),'Review belongs to another frozen evaluation');
  assert.ok(Array.isArray(input.reviews),'Reviews must be an array');
  assert.equal(new Set(input.reviews.map(r=>r.caseId)).size,input.reviews.length,'Duplicate reviews');
  for (const review of input.reviews) {
    const entry=manifest.find(m=>m.caseId===review.caseId);assert.ok(entry,'Unknown review case');
    const bytes=await fs.readFile(entry.packetPath);assert.equal(sha256(bytes),entry.packetSha256,'Reviewer packet evidence drift');
    const packet=JSON.parse(bytes);assert.equal(packet.scanId,entry.scanId,'Packet scan mismatch');
    for (const image of packet.screenshots) {
      assert.equal(sha256(await fs.readFile(image.path)),image.sha256,'Retained image evidence drift');
    }
    for (const text of packet.texts) {
      assert.equal(sha256(text.text),text.sha256,'Retained text evidence drift');
    }
    validateReview(review,entry,packet);
  }
  const result={schemaVersion:'ar-human-evaluation.v1',generatedAt:new Date().toISOString(),frozenAt:frozen.frozenAt,reviewSource:reviewsFile??null,...summarize(frozen.predictions,manifest,input.reviews)};
  await fs.writeFile(path.join(root,'evaluation.json'),JSON.stringify(result,null,2));
  return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=process.argv[2];if(!root)throw new Error('Usage: node scripts/evaluate-ar-human-holdout.mjs ROOT [REVIEWS.json]');
 evaluate(root,process.argv[3]).then(r=>console.log(JSON.stringify({status:r.status,cohorts:Object.fromEntries(Object.entries(r.cohorts).map(([k,v])=>[k,{total:v.totalCases,reviewed:v.reviewedCases}]))}))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
