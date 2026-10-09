import assert from "node:assert/strict";
import test from "node:test";
import { consentDecisionEvidenceSchema, oneTrustGroupEvidenceSchema } from "./consent-action-evidence-policy.js";

const complete = {
  policyVersion: "onetrust_cookie_groups.v1" as const,
  cookieIdentitySha256: "1".repeat(64), beforeValueSha256: "2".repeat(64),
  afterValueSha256: "3".repeat(64), configurationSha256: "4".repeat(64),
  baselineGroupIds: ["C0001","C0002"], configuredGroupIds: ["C0001","C0002"],
  groups: [{id:"C0001",alwaysActive:true,consent:true},{id:"C0002",alwaysActive:false,consent:false}],
};

test("OneTrust v1 keeps its historical complete-baseline requirement", () => {
  assert.ok(oneTrustGroupEvidenceSchema.safeParse(complete).success);
  assert.equal(oneTrustGroupEvidenceSchema.safeParse({...complete,baselineGroupIds:["C0001"]}).success,false);
});

test("OneTrust v2 allows only a known nonempty baseline subset and complete fresh decision", () => {
  const proof = {...complete,policyVersion:"onetrust_cookie_groups.v2",baselineGroupIds:["C0001"]};
  assert.ok(oneTrustGroupEvidenceSchema.safeParse(proof).success);
  for (const change of [
    {baselineGroupIds:[]}, {baselineGroupIds:["C0001","C0001"]}, {baselineGroupIds:["alien"]},
    {groups:proof.groups.slice(0,1)}, {groups:[...proof.groups,proof.groups[1]]},
    {groups:[proof.groups[0],{...proof.groups[1],id:"alien"}]},
    {configuredGroupIds:["C0001","C0001"]}, {beforeValueSha256:proof.afterValueSha256},
    {groups:proof.groups.map(g=>({...g,alwaysActive:true}))},
    {groups:proof.groups.map(g=>({...g,consent:false}))},
  ]) assert.equal(oneTrustGroupEvidenceSchema.safeParse({...proof,...change}).success,false,JSON.stringify(change));
  const evidence = {policyVersion:"semantic_consent_registration.v2",basis:"verified_state",decision:"denied",
    observedStateSha256:proof.afterValueSha256, observedAtMs:10,timestampBasis:"instrumented_state_write",oneTrustGroupEvidence:proof};
  assert.ok(consentDecisionEvidenceSchema.safeParse(evidence).success);
  assert.equal(consentDecisionEvidenceSchema.safeParse({...evidence,timestampBasis:"verified_state_observed"}).success,false);
  assert.equal(consentDecisionEvidenceSchema.safeParse({...evidence,decision:"granted"}).success,false);
});
