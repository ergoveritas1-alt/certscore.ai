import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const contracts=await import('../../packages/certscore-contracts/src/index.ts');
const {consentActionControlProofSchema}=contracts.default??contracts;
const root='artifacts/ar-reject-eligibility-20261009';
const summary=JSON.parse(await readFile(`${root}/summary-verified.json`,'utf8'));
const rows=[];
for(const row of summary.results){
 if(!['accept','reject'].includes(row.lane)||row.click?.outcome!=='completed')continue;
 const parsed=consentActionControlProofSchema.safeParse(row.actionControlProof);
 assert.ok(parsed.success,`${row.url} ${row.version} ${row.repeat} ${row.lane}: ${JSON.stringify(parsed.error)}`);
 if(row.registration.status!=='confirmed'){
 assert.ok(row.afterActionCapture,`unconfirmed completed click missing bounded capture: ${row.scanId}`);
 assert.equal(row.afterActionCapture.activationStatus,'completed');
 assert.ok(row.afterActionCapture.captureEndedAtMs >= row.afterActionCapture.actionDispatchedAtMs);
 }
 rows.push({scanId:row.scanId,url:row.url,version:row.version,repeat:row.repeat,lane:row.lane,proofValid:true,
 registration:row.registration.status,afterActionCapture:row.afterActionCapture?.stopReason??"confirmed_observation"});
}
await writeFile(`${root}/packet-validation.json`,JSON.stringify({completedClicks:rows.length,rows},null,2)+'\n');
console.log(`Validated ${rows.length} completed-click proofs and bounded captures.`);
