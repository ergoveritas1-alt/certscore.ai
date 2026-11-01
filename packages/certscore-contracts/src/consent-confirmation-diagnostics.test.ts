import assert from "node:assert/strict";
import test from "node:test";
import { consentConfirmationDiagnosticsSchema, summarizeConsentConfirmationReads } from "./consent-confirmation-diagnostics.js";

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

test("read diagnostics preserve each lifecycle state, recorded zero and source version without inventing proof", () => {
  for (const version of ["v1", "v2", "v3"] as const) {
    for (const terminalRead of ["not_started", "started", "unverified", "verified", "discarded"] as const) {
      const source = consentConfirmationDiagnosticsSchema.parse({
        policyVersion: `consent_confirmation_diagnostics.${version}`, diagnosticOnly: true,
        initialPasses: 0, terminalPasses: 0, terminalRead, reasons: [],
        ...(version === "v1" ? {} : {initialReasons: [], terminalReasons: [], reasonsTruncated: false}),
      });
      assert.deepEqual(summarizeConsentConfirmationReads(source), {
        policyVersion: "consent_confirmation_read_diagnostics.v1", diagnosticOnly: true,
        source: "retained_confirmation_diagnostics", sourceDiagnosticsPolicyVersion: source.policyVersion,
        passCountLimit: 10_000, initialPasses: 0, terminalPasses: 0, terminalRead,
      });
    }
  }
});

test("missing or invalid diagnostics stay unavailable while capped counts stay explicit", () => {
  const source = {policyVersion: "consent_confirmation_diagnostics.v1" as const, diagnosticOnly: true as const,
    initialPasses: 10_000, terminalPasses: 1, terminalRead: "discarded" as const, reasons: []};
  assert.equal(summarizeConsentConfirmationReads(undefined), null);
  assert.equal(summarizeConsentConfirmationReads(source)?.initialPasses, 10_000);
  assert.equal(summarizeConsentConfirmationReads(source)?.passCountLimit, 10_000);
  for (const patch of [{initialPasses: 10_001}, {terminalPasses: -1}, {terminalRead: "future"},
    {cookieValue: "private"}, {decision: "granted"}, {terminalPasses: undefined}]) {
    assert.equal(summarizeConsentConfirmationReads({...source, ...patch} as typeof source), null);
  }
});
