import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreError } from "@certscore/sdk";
import { captureMcpResponse, withResponseCapture } from "./response-capture.js";
import { toInvalidArgumentsToolError, toToolError, toToolResult, withMcpAgentGuidance } from "./tools.js";

test("capture retains controlled validation guidance without raw argument values", () => {
  const response = toInvalidArgumentsToolError("tool certscore_get_scan_bundle", { tool: "certscore_get_scan_bundle", issues: [{ field: "maxBytes", code: "invalid_type" }] });
  const summary = captureMcpResponse(response);
  assert.equal(summary.captureBasis, "response_generated");
  assert.equal(summary.message, "The maxBytes field is invalid.");
  assert.match(summary.recommendedNextAction!, /do not send null/);
  assert.deepEqual(summary.issues, [{ field: "maxBytes", code: "invalid_type" }]);
  assert.equal(summary.textOmitted, false);
});

test("upstream bodies and untrusted response text are never retained", () => {
  const error = Object.assign(new CertScoreError("secret-user@example.com", { status: 404, code: "not_found", responseBody: { error: { message: "secret", recommendedNextAction: "Visit https://private.example/?token=secret" }, evidence: "secret" } }), {
    upstream: { operation: "scan_resource" as const, httpStatus: 404, requestId: "00000000-0000-4000-8000-000000000123" },
  });
  const summary = captureMcpResponse(toToolError(error));
  assert.equal(summary.errorCode, "not_found");
  assert.equal(summary.upstream?.operation, "scan_resource");
  assert.equal(summary.message, undefined);
  assert.equal(summary.recommendedNextAction, undefined);
  assert.equal(summary.textOmitted, true);
  assert.doesNotMatch(JSON.stringify(summary), /secret|private\.example|evidence/);
});

test("capture bounds multibyte text and distinguishes generated protocol errors", () => {
  const protocol = withResponseCapture({ code: -32602, message: "unknown tool", data: { code: "unknown_tool", retryable: false } }, { message: "🙂".repeat(400), recommendedNextAction: "🙂".repeat(800) });
  const summary = captureMcpResponse(undefined, protocol);
  assert.equal(summary.kind, "protocol_error");
  assert.equal(summary.mcpCode, -32602);
  assert.equal(summary.summaryTruncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) <= 2048);
});

test("success captures polling metadata without the bundle and terminal fallback retains guidance", () => {
  const success = captureMcpResponse(toToolResult({ type: "certscore_scan_job", status: "queued", retryAfterSeconds: 15, recommendedNextTool: "certscore_get_scan_status", findings: [{ secret: "not retained" }] }));
  assert.equal(success.retryAfterSeconds, 15);
  assert.equal(success.recommendedNextTool, "certscore_get_scan_status");
  assert.ok(Buffer.byteLength(JSON.stringify(success)) < 512);
  const failed = captureMcpResponse(toToolResult(withMcpAgentGuidance({ type: "certscore_scan_job", status: "failed", scanId: "00000000-0000-4000-8000-000000000123" })));
  assert.match(failed.recommendedNextAction!, /uses scan quota/);
});


test("malformed optional metadata cannot suppress the invocation event", () => {
  const summary = captureMcpResponse(withResponseCapture({ isError: true }, { upstream: { operation: "other", httpStatus: 999 } }));
  assert.equal(summary.isError, true);
  assert.equal(summary.summaryTruncated, true);
  assert.equal(summary.upstream, undefined);
});
