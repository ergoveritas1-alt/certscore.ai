import assert from "node:assert/strict";
import test from "node:test";
import { evidenceValidationFailure } from "./evidence-validation-failure";

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
