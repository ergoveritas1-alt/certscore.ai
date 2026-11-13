import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {postAcceptReportProjectionSchema} from './post-accept-observation.js';
import {postRefusalReportProjectionSchema} from './post-refusal-observation.js';
import {assessChoicePathExecution} from './choice-path-execution.js';
const rows=JSON.parse(readFileSync(__dirname + '/../fixtures/retained-unconfirmed-actions-20261113.json','utf8'));
test('retained unconfirmed cohort covers all 34 paths, excluding ergoveritas',()=>{
 assert.equal(rows.length,34);
 assert.equal(rows.filter((row:any)=>row.action==='accept').length,22);
 assert.equal(rows.filter((row:any)=>row.action==='reject').length,12);
 assert.equal(new Set(rows.map((row:any)=>`${row.sourcePacketSha256}:${row.action}`)).size,34);
 assert.ok(rows.every((row:any)=>!row.domain.includes('ergoveritas')));
});
for(const row of rows) test(`retained ${row.domain} ${row.action}: completed capture cannot invent a consent decision`,()=>{
 const schema=row.action==='accept'?postAcceptReportProjectionSchema:postRefusalReportProjectionSchema;
 const projection=schema.parse(row.projection);
 assert.equal(projection.packetSha256,row.sourcePacketSha256);
 assert.equal(projection.registrationStatus,'unconfirmed');
 const execution=assessChoicePathExecution(projection,row.action);
 assert.equal(execution.status,'succeeded');
 assert.equal(execution.clickCompleted,true);
 assert.equal(execution.observationCompleted,true);
 assert.equal(execution.consentConfirmed,false);
 // A fabricated confirmation must fail the canonical projection contract,
 // even though the click and post-click capture completed successfully.
 assert.equal(schema.safeParse({...projection,execution:{...execution,status:'succeeded_with_confirmation',consentConfirmed:true}}).success,false);
});
