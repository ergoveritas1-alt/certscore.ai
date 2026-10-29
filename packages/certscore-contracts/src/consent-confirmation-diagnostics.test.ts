import assert from "node:assert/strict";
import test from "node:test";
import { consentConfirmationDiagnosticsSchema } from "./consent-confirmation-diagnostics.js";

test("confirmation diagnostics are bounded and cannot carry a decision, receipt value or registration", () => {
  const valid = {policyVersion: "consent_confirmation_diagnostics.v1", diagnosticOnly: true, initialPasses: 12,
    terminalPasses: 1, terminalRead: "unverified", reasons: ["receipt_malformed_or_unsupported"]};
  assert.ok(consentConfirmationDiagnosticsSchema.safeParse(valid).success);
  for (const change of [{diagnosticOnly:false}, {decision:"denied"}, {registration:"confirmed"}, {cookieValue:"private"},
    {initialPasses:10_001}, {reasons:["invented"]}, {reasons:["receipt_missing","receipt_missing"]}]) {
    assert.equal(consentConfirmationDiagnosticsSchema.safeParse({...valid,...change}).success,false);
  }
});

test("v2 phase diagnostics are bounded and cannot rewrite v1 history",()=>{
  const value={policyVersion:"consent_confirmation_diagnostics.v2",diagnosticOnly:true,initialPasses:3,terminalPasses:1,terminalRead:"verified",reasons:["group_universe_incomplete","verified_decision"],initialReasons:["group_universe_incomplete"],terminalReasons:["verified_decision"],reasonsTruncated:false};
  assert.ok(consentConfirmationDiagnosticsSchema.safeParse(value).success);
  for(const patch of [{terminalReasons:["receipt_missing"]},{initialReasons:["group_universe_incomplete","group_universe_incomplete"]},{policyVersion:"consent_confirmation_diagnostics.v1"},{decision:"granted"},{reasonsTruncated:undefined}])assert.equal(consentConfirmationDiagnosticsSchema.safeParse({...value,...patch}).success,false);
});
