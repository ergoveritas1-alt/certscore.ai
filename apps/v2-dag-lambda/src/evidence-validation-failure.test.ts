import assert from "node:assert/strict";
import test from "node:test";
import { evidenceValidationFailure } from "./evidence-validation-failure";

test("terminal action diagnostics distinguish timing, source and document proof without arbitrary text", () => {
  for (const [field, message, code] of [
    ["terminalDecisionEvidence", "Terminal proof requires a matching verified decision and retained read timing.", "terminal_decision_read_binding"],
    ["observedActionSourceProof", "Prospective scoped source proof must match the original confirmed action, packet inventory and configured window.", "observed_action_source_binding"],
    ["afterActionCapture", "V2 capture requires a committed authorized action document.", "after_action_document_binding"],
    ["mainDocumentWriteCoverage", "Main-document write coverage requires bound, loss-free counters and healthy completed capture.", "main_document_write_coverage"],
  ]) {
    const error = Object.assign(new Error("private"), { name: "ZodError", issues: [{ path: [field], code: "custom", message, received: "private" }] });
    const result = evidenceValidationFailure(error)!;
    assert.equal(result.message, `Evidence validation failed: ${field} (custom:${code})`);
    assert.doesNotMatch(result.message, /private|must |requires /);
  }
});

test("schema failure diagnostics retain bounded paths/codes but no values, messages, or stacks", () => {
  const error = Object.assign(new Error("secret-cookie-value"), { name: "ZodError", issues: [
    { path: ["storage", "preAction", 10, "name"], code: "too_small", message: "secret-cookie-value", received: "secret" },
    ...Array.from({ length: 30 }, () => ({ path: ["storage", "secret-key"], code: "invalid_type", message: "secret" })),
  ] });
  const result = evidenceValidationFailure(error)!;
  assert.equal(result.code, "v2_dag_lambda_evidence_invalid");
  assert.match(result.message, /storage.preAction.\[10\].name \(too_small\)/);
  assert.ok(result.message.length <= 500);
  assert.doesNotMatch(JSON.stringify(result), /secret|Error:|stack/);
  assert.equal(evidenceValidationFailure(new Error("ordinary failure")), undefined);
});

test("schema failure diagnostics identify canonical consent fields without retaining rejected content", () => {
  const error = Object.assign(new Error("https://example.test/private-query"), { name: "ZodError", issues: [
    { path: ["consentUiObservations", 0, "documentUrl"], code: "too_big", message: "private-query" },
  ] });
  const result = evidenceValidationFailure(error)!;
  assert.equal(result.message, "Evidence validation failed: consentUiObservations.[0].documentUrl (too_big)");
  assert.doesNotMatch(JSON.stringify(result), /private-query|example\.test/);
});

test("schema failure diagnostics identify visual note bounds without retaining note text", () => {
  const error = Object.assign(new Error("private-query"), { name: "ZodError", issues: [
    { path: ["visualCapture", "notes", 3], code: "too_big", message: "private-query" },
  ] });
  const result = evidenceValidationFailure(error)!;
  assert.equal(result.message, "Evidence validation failed: visualCapture.notes.[3] (too_big)");
  assert.doesNotMatch(JSON.stringify(result), /private-query/);
});

test("native document invariant diagnostics expose only the allowlisted invariant",()=>{
 const error=Object.assign(new Error('private'),{name:'ZodError',issues:[
  {path:['consentUiObservations',0,'controls'],code:'custom',params:{invariant:'native_ax_observation_document_binding'},message:'private'},
  {path:['consentUiObservations',1],code:'custom',params:{invariant:'private-value'},message:'private'},
 ]});
 const result=evidenceValidationFailure(error)!;
 assert.match(result.message,/controls \(custom:native_ax_observation_document_binding\)/);
 assert.doesNotMatch(result.message,/private/);
});

test('Reject packet invariants get fixed diagnostic codes without rejected values or arbitrary custom messages',()=>{
 const error=Object.assign(new Error('private'),{name:'ZodError',issues:[
  {path:[],code:'custom',message:'California collection proof must bind to its exact retained request.',received:'private-url'},
  {path:[],code:'custom',message:'V2 after-action capture requires exact retained request ancestry.'},
  {path:[],code:'custom',message:'private-cookie-and-identifier',params:{invariant:'private'}},
 ]});
 const result=evidenceValidationFailure(error)!;
 assert.match(result.message,/packet \(custom:california_request_binding\)/);
 assert.match(result.message,/packet \(custom:after_action_request_ancestry\)/);
 assert.doesNotMatch(result.message,/private|must bind|ancestry\./);
 assert.ok(result.message.length<=500);
});

 test('root Reject projection diagnostics distinguish schema-owned failures without values',()=>{
 const error=Object.assign(new Error('private'),{name:'ZodError',issues:[
  {path:[],code:'custom',message:'Action projection must preserve verified decision and capture-coverage invariants.'},
  {path:[],code:'custom',message:'Property disclosure source must bind to the Reject scan and target.'},
  {path:[],code:'custom',message:'Exact cookie assignment must bind its parent write identity and clock.'},
 ]});
 const result=evidenceValidationFailure(error)!;
 assert.match(result.message,/custom:reject_action_projection_binding/);
 assert.match(result.message,/custom:reject_property_source_binding/);
 assert.match(result.message,/custom:exact_cookie_assignment_binding/);
 assert.doesNotMatch(result.message,/private|must bind|must preserve/);
 });

 test('protocol proof diagnostics expose closed invariants without raw rejected identifiers',()=>{
 const error=Object.assign(new Error('private-identifier'),{name:'ZodError',issues:[
 {path:[],code:'custom',message:'Protocol visitor identity must bind to its exact supported collector.'},
 {path:[],code:'custom',message:'California v2 body/header proof must retain consistent dispositions and hashes.'},
 ]});
 const r=evidenceValidationFailure(error)!;assert.match(r.message,/custom:protocol_identity_binding/);assert.match(r.message,/custom:california_body_header_dispositions/);assert.doesNotMatch(r.message,/private|must retain|must bind/);
 });
