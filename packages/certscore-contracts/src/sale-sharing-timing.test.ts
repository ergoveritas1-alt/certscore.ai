import assert from 'node:assert/strict';
import test from 'node:test';
import {saleSharingOptOutDiagnosticsSchema,saleSharingTimingSchema} from './sale-sharing-opt-out';
test('optional bounded timing preserves historical diagnostics and rejects invalid new facts',()=>{
 const old={version:'sale_sharing_execution_diagnostics.v1',milestones:[],decisionReads:[]};
 assert.deepEqual(saleSharingOptOutDiagnosticsSchema.parse(old),old);
 const timing={version:'sale_sharing_timing.v1',captureMs:2750,launchMs:200,contextMs:300,navigationMs:301,commitMs:600,readinessMs:850,entranceMs:900,entrance:'native_settings',readiness:{reason:'script_recipe',checks:2,probeMs:1,matched:1,gpp:true}};
 assert.ok(saleSharingTimingSchema.safeParse(timing).success);
 assert.ok(saleSharingOptOutDiagnosticsSchema.safeParse({...old,timing}).success);
 assert.ok(Buffer.byteLength(JSON.stringify(timing))<500);
 for(const change of [{captureMs:3001},{commitMs:100},{unknown:'raw body'},{entrance:'external_form'},{readiness:{...timing.readiness,checks:3}},{readiness:{...timing.readiness,gpp:'unverified'}},{readiness:{...timing.readiness,matched:3}}])assert.equal(saleSharingTimingSchema.safeParse({...timing,...change}).success,false);
});
