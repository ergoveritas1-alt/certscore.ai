import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { postAcceptFormCaptureSchema } from './post-accept-form-capture';

const capture = {
  version:'post_accept_form_capture.v1', phase:'after_accept_click', sessionId:randomUUID(),
  exactTargetSha256:'a'.repeat(64),actionDispatchedAtMs:100,status:'captured',reasonCodes:[],
  inspectedFrameCount:1,candidateFrameCount:1,
  frames:[{frameRef:'main',documentToken:randomUUID(),documentUrl:'https://example.test/',capturedAtMs:120,forms:[]}],
};
test('form capture rejects false coverage, invalid time, unsafe frames, and duplicated provenance',()=>{
  assert.equal(postAcceptFormCaptureSchema.safeParse(capture).success,true);
  for(const invalid of [
    {...capture,inspectedFrameCount:0}, {...capture,candidateFrameCount:2}, {...capture,status:'limited'},
    {...capture,frames:[capture.frames[0],capture.frames[0]]},
    {...capture,frames:[{...capture.frames[0],capturedAtMs:99}]},
    {...capture,frames:[{...capture.frames[0],documentUrl:'javascript:alert(1)'}]},
  ]) assert.equal(postAcceptFormCaptureSchema.safeParse(invalid).success,false);
});

test('windowed capture requires terminal coverage and preserves legacy samples',()=>{
  const windowed={...capture,version:'post_accept_form_capture.v2',window:{startedAtMs:100,endedAtMs:3100,terminalSampleCompleted:true}};
  assert.equal(postAcceptFormCaptureSchema.safeParse(windowed).success,true);
  for(const invalid of [{...windowed,window:undefined},{...windowed,window:{...windowed.window,terminalSampleCompleted:false}},
    {...windowed,window:{...windowed.window,endedAtMs:100}}, {...capture,window:windowed.window}]) {
    assert.equal(postAcceptFormCaptureSchema.safeParse(invalid).success,false);
  }
});
