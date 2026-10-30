import assert from "node:assert/strict";
import test from "node:test";
import {summarizeCmpStages} from "./cmp-stage-benchmark";
import {assessConsentActionStages} from "../packages/certscore-contracts/src/consent-action-stages";
test("stage totals preserve unknowns, action/cohort boundaries and unverified CMP attribution",()=>{
 const empty=assessConsentActionStages({} as any),base={contacted:true,url:"https://example.test/",packetSha256:null,stages:empty};
 const rows=summarizeCmpStages([{...base,cohort:"first",action:"accept"},{...base,cohort:"first",action:"accept"},{...base,cohort:"second",action:"reject"}]);
 assert.equal(rows.length,2);assert.equal(rows[0]?.provider,"Unverified CMP");assert.equal(rows[0]?.total,2);assert.deepEqual(rows[0]?.measures.decisionVerified,{verified:0,notVerified:0,unknown:2});assert.equal(rows[1]?.total,1);
 assert.deepEqual(rows[0]?.evidenceStages.initialChoiceRegistrationSupported,{verified:0,notVerified:0,unknown:2});
 assert.deepEqual(rows[0]?.evidenceStages.terminalChoiceStateVerified,{verified:0,notVerified:0,unknown:2});
 assert.deepEqual(rows[0]?.identityStates,{unknown:2});
 const skipped=summarizeCmpStages([{...base,contacted:false,cohort:"skip",action:"accept"}]);assert.equal(skipped[0]?.total,0);assert.equal(skipped[0]?.notContacted,1);assert.equal(skipped[0]?.measures.decisionVerified?.unknown,0);
});
