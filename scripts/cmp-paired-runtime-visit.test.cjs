'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boundedDiagnosticBody, diagnosticWindowOpen, assertSerializedPacketMatches } = require('./cmp-paired-runtime-visit.cjs');

test('diagnostic response bodies require positive bounded explicit identity length', () => {
  assert.equal(boundedDiagnosticBody({ 'content-length': '1048576' }, 1048576), true);
  assert.equal(boundedDiagnosticBody({ 'content-length': '16', 'content-encoding': 'identity' }, 1048576), true);
  for (const headers of [{}, { 'content-length': '0' }, { 'content-length': '-1' },
    { 'content-length': '1048577' }, { 'content-length': '1e3' }, { 'content-length': '1.5' },
    { 'content-length': '9007199254740992' }, { 'content-length': '32', 'content-encoding': 'gzip' },
    { 'content-length': '32', 'content-encoding': 'br' }, { 'content-length': '32', 'content-encoding': 'gzip, identity' }]) {
    assert.equal(boundedDiagnosticBody(headers, 1048576), false, JSON.stringify(headers));
  }
});

test('diagnostic capture closes on observer return or original absolute deadline without waiting', () => {
  assert.equal(diagnosticWindowOpen(true, 20000, 19999), true);
  assert.equal(diagnosticWindowOpen(true, 20000, 20000), false);
  assert.equal(diagnosticWindowOpen(true, 20000, 20001), false);
  assert.equal(diagnosticWindowOpen(false, 20000, 1000), false);
});

test('canonical JSON omission of optional undefined timing fields preserves packet equality', () => {
  const packet = { scanId: 'same-session', timing: { totalMs: 16852, observationEndedAtMs: undefined, observationExitReason: undefined } };
  assert.doesNotThrow(() => assertSerializedPacketMatches(Buffer.from(JSON.stringify(packet)), packet));
});

test('serialized packet verification still rejects changed session, timing, decision, missing fields and malformed bytes', () => {
  const packet = { scanId: 'same-session', timing: { totalMs: 16852 }, decision: 'unknown' };
  for (const changed of [{ ...packet, scanId: 'different-session' }, { ...packet, timing: { totalMs: 1 } },
    { ...packet, decision: 'granted' }, { scanId: packet.scanId }, { ...packet, extra: true }]) {
    assert.throws(() => assertSerializedPacketMatches(Buffer.from(JSON.stringify(changed)), packet));
  }
  assert.throws(() => assertSerializedPacketMatches(Buffer.from('{'), packet));
});

const {canonicalEvidenceFailure,navigationFailureReasons}=require('./cmp-paired-runtime-visit.cjs');
test('observer-side schema errors are globally fatal before the visitor verifier begins',()=>{
 assert.equal(canonicalEvidenceFailure({name:'ZodError',issues:[{message:'exact request mismatch'}]},false),true);
 assert.equal(canonicalEvidenceFailure({issues:[]},false),true);
 assert.equal(canonicalEvidenceFailure(new Error('transport timeout'),false),false);
 assert.equal(canonicalEvidenceFailure(new Error('bad packet'),true),true);
});
test('failed TLS or unauthorized navigation stops the domain; missing receipts do not',()=>{
 assert(navigationFailureReasons({navigation:{outcome:'failed',documentCommitted:false,finalUrlAuthorized:false}}).length>0);
 assert(navigationFailureReasons({limitations:['target_navigation_failed:tls']}).length>0);
 assert.deepEqual(navigationFailureReasons({navigation:{outcome:'completed',documentCommitted:true,finalUrlAuthorized:true},limitations:['acceptance_registration_not_confirmed']}),[]);
});
