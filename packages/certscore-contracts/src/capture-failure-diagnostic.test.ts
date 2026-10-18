import assert from 'node:assert/strict';
import test from 'node:test';
import {captureFailureDiagnosticSchema,describeCaptureFailure} from './capture-failure-diagnostic';
test('failure diagnostics retain only bounded stage and classified error metadata',()=>{
 for(const [error,code] of [[new Error('net::ERR_NAME_NOT_RESOLVED secret@example.com'),'network_failure'],[new Error('cmp_packet_checksum_mismatch'),'checksum_mismatch'],[Object.assign(new Error('private page text'),{name:'ZodError'}),'contract_invalid']] as const){
  const value=describeCaptureFailure(error,'artifact_contract');assert.equal(value.code,code);assert.ok(captureFailureDiagnosticSchema.safeParse(value).success);assert.doesNotMatch(JSON.stringify(value),/secret|private/);
 }
 assert.equal(captureFailureDiagnosticSchema.safeParse({...describeCaptureFailure(new Error('x'),'navigation'),message:'raw content'}).success,false);
});
