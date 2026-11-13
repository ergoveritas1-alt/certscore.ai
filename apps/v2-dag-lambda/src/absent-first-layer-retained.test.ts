import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {deriveConsentActionAvailability} from './handler';
const fixtures=JSON.parse(readFileSync(new URL('../../../packages/certscore-contracts/fixtures/retained-no-first-layer-actions-20261113.json',import.meta.url),'utf8'));
for(const row of fixtures)test(`retained ${row.host}: action routing preserves first-layer intent`,()=>{
 const before=JSON.stringify(row.bundle);
 const availability=deriveConsentActionAvailability(row.bundle);
 assert.equal(availability.acceptControlObserved,false);
 assert.equal(availability.rejectControlObserved,false);
 assert.equal(availability.necessaryOnlyRejectEquivalentObserved,false);
 if(row.host==='archonph.com'){
  assert.equal(availability.inventoryComplete,false);
  assert.equal(availability.acceptPassiveBarrierOnly,true);
  assert.equal(availability.rejectPassiveBarrierOnly,true);
 }else assert.equal(availability.inventoryComplete,true);
 assert.equal(JSON.stringify(row.bundle),before);
});
