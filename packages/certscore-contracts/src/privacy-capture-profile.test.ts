import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPrivacyCaptureProfile, retainedOptOutDispatch, PRESENCE_ONLY_CAPTURE_PROFILE, CONDITIONAL_OPT_OUT_CAPTURE_PROFILE, PRESENCE_ONLY_WORKER_LANES} from './privacy-capture-profile';

test('conditional profile preserves all six lanes and only adds exact-target opt-out', () => {
  const base={orchestrationMode:'sharded',gpcObservation:{enabled:true}};
  const presence={...base,privacyCaptureProfile:PRESENCE_ONLY_CAPTURE_PROFILE};
  const conditional={...base,privacyCaptureProfile:CONDITIONAL_OPT_OUT_CAPTURE_PROFILE,saleSharingOptOut:{enabled:true,policyVersion:'bounded_sale_sharing_opt_out.v1',scanId:'test',exactTargetUrl:'https://example.com/'}};
  for(const lane of PRESENCE_ONLY_WORKER_LANES){assert.doesNotThrow(()=>assertPrivacyCaptureProfile(presence,lane));assert.doesNotThrow(()=>assertPrivacyCaptureProfile(conditional,lane));}
  assert.throws(()=>assertPrivacyCaptureProfile(presence,'sale_sharing_opt_out'));
  assert.doesNotThrow(()=>assertPrivacyCaptureProfile(conditional,'sale_sharing_opt_out'));
  for(const patch of [{cmpPreferenceInspection:{}},{gpcObservation:{enabled:false}},{orchestrationMode:'single'},{saleSharingOptOut:undefined},{saleSharingOptOut:{...conditional.saleSharingOptOut,policyVersion:'bounded_sale_sharing_opt_out.v2-apex-www',redirectAuthorization:{alternateTargetUrl:'https://www.example.com/'}}}])assert.throws(()=>assertPrivacyCaptureProfile({...conditional,...patch}));
  assert.throws(()=>assertPrivacyCaptureProfile(conditional,'cmp_preferences'));
});

test('conditional intent never becomes effective dispatch or successful action without retained proof',()=>{
  const lane={status:'limited',startedAt:'2026-11-05T00:00:00.000Z',completedAt:'2026-11-05T00:00:01.000Z',limitationCode:'opt_out_worker_failed'};
  assert.equal(retainedOptOutDispatch(CONDITIONAL_OPT_OUT_CAPTURE_PROFILE,undefined),'conditional_no_dispatch_recorded');
  assert.equal(retainedOptOutDispatch(CONDITIONAL_OPT_OUT_CAPTURE_PROFILE,lane),'dispatch_recorded');
  assert.equal(retainedOptOutDispatch(PRESENCE_ONLY_CAPTURE_PROFILE,lane),'profile_dispatch_conflict');
  assert.equal(retainedOptOutDispatch(PRESENCE_ONLY_CAPTURE_PROFILE,undefined),'excluded_by_profile');
});
