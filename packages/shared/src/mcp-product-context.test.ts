import assert from "node:assert/strict";
import test from "node:test";
import { mcpTaskContextSchema, sanitizeMcpTaskContext } from "./mcp-product-context";
import { mcpRequestDetailsSchema } from "./mcp-telemetry";

test("question sharing is optional, explicit and bounded, and rejects unknown context fields", () => {
  assert.equal(mcpTaskContextSchema.safeParse({ purpose: "tracking_check" }).success, true);
  assert.equal(mcpTaskContextSchema.safeParse({ questionSummary: "Check tracking" }).success, false);
  assert.equal(mcpTaskContextSchema.safeParse({ purpose: "invented" }).success, false);
  assert.equal(mcpTaskContextSchema.safeParse({ prompt: "conversation" }).success, false);
  assert.equal(mcpTaskContextSchema.safeParse({ questionSummary: "x".repeat(301), questionSource: "user_wording", shareForImprovement: true }).success, false);
});

test("sensitive summaries are withheld while safe declared purpose and versions survive", () => {
  const base = { purpose: "vendor_review", integrationId: "qc", integrationVersion: "1.0", skillVersion: "2026-09-08.1", questionSource: "agent_paraphrase", shareForImprovement: true };
  for (const text of ["Contact person@example.com", "Scan https://example.com/login?token=abc", "password secret", "account 12345678"]) {
    const context = sanitizeMcpTaskContext({ ...base, questionSummary: text });
    assert.equal(context?.questionSummary, undefined);
    assert.equal(context?.purpose, "vendor_review");
    assert.equal(mcpRequestDetailsSchema.safeParse({ version: 1, arguments: {}, argumentsOmitted: true, actorBasis: "unavailable", sessionBasis: "unavailable", rateLimit: null, taskContext: { ...base, questionSummary: text } }).success, false);
  }
  assert.equal(sanitizeMcpTaskContext({ ...base, questionSummary: "Does this vendor load tracking before consent?" })?.questionSummary, "Does this vendor load tracking before consent?");
});
