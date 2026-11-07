import assert from 'node:assert/strict';
import test from 'node:test';
import {retainedInputCoverage} from './audit-progress-input-coverage';
test('input coverage uses readable report rows and Los Angeles dates, without guessing legacy input state',()=>{
 const rows=[{reportable:true,createdAt:'2026-11-03T07:30:00Z',retainedReportInput:'missing_input' as const},
  {reportable:true,createdAt:'2026-11-03T08:30:00Z',retainedReportInput:'verified_originals' as const},
  {reportable:true,createdAt:'2026-11-03T09:30:00Z'},
  {reportable:false,createdAt:'2026-11-03T09:30:00Z'}];
 const result=retainedInputCoverage(rows);assert.equal(result.eligible,3);assert.equal(result.states.not_evaluated,1);
 assert.equal(result.days[0]?.date,'2026-11-02');assert.equal(result.days[0]?.states.missing_input,1);
 assert.equal(result.days[1]?.date,'2026-11-03');assert.equal(result.days[1]?.eligible,2);
 assert.equal(retainedInputCoverage(rows.slice(1,2)).states.verified_originals,1);
 assert.equal(Object.values(result.states).reduce((a,b)=>a+b,0),result.eligible);
});
