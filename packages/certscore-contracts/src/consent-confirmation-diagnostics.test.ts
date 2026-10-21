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
