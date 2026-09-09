import assert from "node:assert/strict";
import test from "node:test";
import { captureMcpCallerInput, mergeMcpCallerInputs, mcpCallerInputSchema } from "./mcp-caller-input";
import { boundMcpRequestDetails, mcpRequestDetailsSchema } from "./mcp-telemetry";

const sharedQuestion = { questionSummary: "Check tracking before consent", questionSource: "user_wording", shareForImprovement: true };

test("retains supplied extra text and metadata without asserting it is a chat transcript", () => {
  const result = captureMcpCallerInput({ reason: "Vendor renewal review", notes: "Focus on analytics", prompt: "Check consent controls", options: { enabled: true } }, {
    "io.modelcontextprotocol/clientInfo": { name: "Example client", version: "1.2.3" }, progressToken: "do-not-store",
  });
  assert.equal(result.fields.find(f => f.path === "arguments.reason")?.value, "Vendor renewal review");
  assert.equal(result.fields.find(f => f.path === "request_meta.clientInfo.version")?.value, "1.2.3");
  assert.equal(result.fields.find(f => f.path === "request_meta.progressToken")?.reason, "sensitive_field");
  assert.equal(JSON.stringify(result).includes("do-not-store"), false);
  assert.equal(mcpCallerInputSchema.safeParse(result).success, true);
});

test("redacts secrets and contact values, withholds chat history, and retains only URL origins", () => {
  const result = captureMcpCallerInput({ url: "https://example.com/private/path?customer=abc#detail", apiKey: "abc123", messages: ["private chat"],
    notes: "Contact person@example.com or +1 (415) 555-1234", nested: { password: "private-value" }, token: "another-private-value" });
  const serialized = JSON.stringify(result);
  for (const value of ["/private/path", "customer=abc", "private chat", "abc123", "person@example.com", "555-1234", "private-value"]) assert.ok(!serialized.includes(value), value);
  assert.equal(result.fields.find(f => f.path === "arguments.url")?.value, "https://example.com");
  assert.equal(result.fields.find(f => f.path === "arguments.url")?.reason, "url_components_removed");
  assert.equal(mcpCallerInputSchema.safeParse(result).success, true);
  assert.equal(mcpCallerInputSchema.safeParse({ ...result, fields: [{ path: "arguments.password", type: "string", value: "raw", disposition: "retained" }] }).success, false);
  assert.equal(mcpCallerInputSchema.safeParse({ ...result, fields: [{ path: "arguments.notes", type: "string", value: "email person@example.com", disposition: "retained" }] }).success, false);
});

test("distinguishes absent, unapproved, malformed, filtered and retained question context without a capture bypass", () => {
  for (const [args, status] of [
    [{}, "not_provided"], [{ taskContext: { ...sharedQuestion, shareForImprovement: false } }, "sharing_not_confirmed"],
    [{ taskContext: { ...sharedQuestion, unexpected: true } }, "invalid_context"],
    [{ taskContext: { ...sharedQuestion, questionSummary: "Check https://example.com" } }, "filtered"],
    [{ taskContext: sharedQuestion }, "retained"],
  ] as const) {
    const result = captureMcpCallerInput(args);
    assert.equal(result.questionStatus, status);
    assert.ok(result.fields.every(field => !field.path.startsWith("arguments.taskContext.")));
    assert.ok(!JSON.stringify(result).includes("Check tracking before consent"));
  }
});

test("bounded recursive capture and merging fit the existing PostgreSQL envelope even for multibyte text", () => {
  const large = captureMcpCallerInput(Object.fromEntries(Array.from({length:1000},(_,i)=>[`field${i}`, "日本語の説明。".repeat(40)])));
  assert.ok(large.limits.length);
  assert.ok(large.fields.length <= 24);
  const result = boundMcpRequestDetails({ version: 1, arguments: { url: "https://example.com" }, argumentsOmitted: false, actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: null,
    callerInput: mergeMcpCallerInputs(large, captureMcpCallerInput({}, { client: { name: "Example" } })), taskContext: { ...sharedQuestion, questionSource: "user_wording" } });
  assert.ok(Buffer.byteLength(JSON.stringify(result, null, 1)) <= 4096);
  assert.equal(result.taskContext?.questionSummary, sharedQuestion.questionSummary);
  assert.equal(mcpRequestDetailsSchema.safeParse(result).success, true);
  const deep = captureMcpCallerInput({ nested: { one: { two: { three: "hidden" } } }, ["x".repeat(1000)]: "hidden" });
  assert.equal(JSON.stringify(deep).includes("hidden"), false);
  assert.ok(deep.fields.some(f=>f.reason === "depth_limit"));
  assert.ok(deep.fields.some(f=>f.reason === "invalid_field_name"));
});
