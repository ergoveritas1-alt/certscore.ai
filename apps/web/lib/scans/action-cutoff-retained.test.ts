import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readChoicePathLimitation} from './choice-path-execution';
const fixture=JSON.parse(readFileSync(new URL('../../../../packages/certscore-contracts/fixtures/local-action-cutoff-image-20261113.json',import.meta.url),'utf8'));
for(const row of fixture.cutoffs) test(`retained ${row.scanId} ${row.action}: passive cutoff is not worker timeout`,()=>{
 assert.equal(row.timing.workerReportedHandlerDurationMs,null);
 assert.ok(row.timing.coordinatorElapsedMs<20000);
 const reason=readChoicePathLimitation(null,row.action,row.coverage);
 assert.equal(reason?.code,'passive_inspection_cutoff');
 assert.doesNotMatch(reason!.message,/timed out|exhausted|within its existing scan window/);
 assert.equal(readChoicePathLimitation(null,row.action,{status:'timed_out',limitationCode:row.action+'_path_timeout'})?.code,'result_deadline_exceeded');
});

test('retained HubSpot image outcome is completed quality rejection, not deadline or lost form evidence',()=>{
 const image=fixture.image;
 assert.equal(image.diagnostics.outcome,'completed');
 assert.equal(image.diagnostics.lastStage,'packet_validation');
 assert.deepEqual(image.diagnostics.reasons,['no_visible_context']);
 assert.equal(image.diagnostics.observedForms,image.inventory.forms.length);
 assert.equal(image.snapshots.length,image.inventory.forms.length);
 for(const snapshot of image.snapshots){
  assert.equal(snapshot.status,'unavailable');
  assert.equal(snapshot.reason,'no_visible_context');
  assert.equal(snapshot.data,undefined);
  assert.equal(snapshot.sha256,undefined);
  assert.ok(image.inventory.forms.some((form:{formRef:string})=>form.formRef===snapshot.formRef));
 }
});
