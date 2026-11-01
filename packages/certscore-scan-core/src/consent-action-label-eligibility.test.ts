import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./test-fixtures/retained-action-label-preflight.json";
import {genericConsentActionLabelSupported} from "./consent-action-label-eligibility";

test("retained diagnostic labels do not acquire generic action permission",()=>{
  assert.equal(fixture.cases.length,13);
  for(const row of fixture.cases){
    assert.match(row.bundleSha256,/^[a-f0-9]{64}$/);
    assert.equal(genericConsentActionLabelSupported(row.label,row.action as "accept"|"reject"),row.expectedGenericEligible,row.site);
  }
});

test("generic label preflight preserves direct decisions and rejects opposite, ambiguous and contextual labels",()=>{
  for(const action of ["accept","reject"] as const){
    assert.equal(genericConsentActionLabelSupported(action==="accept"?"Accept all":"Reject all",action),true);
    for(const label of ["","Settings","Accept all or reject all","What happens if I reject all?","VERSTANDEN","NO, THANKS","Accept proposed privacy settings",action==="accept"?"Reject all":"Accept all"])
      assert.equal(genericConsentActionLabelSupported(label,action),false,label);
  }
});
