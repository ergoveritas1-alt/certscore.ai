import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWorkflows, type McpWorkflowEvent } from "./mcp-workflows";

const base: McpWorkflowEvent = { event_id: "a", occurred_at: "2026-09-08T12:00:00Z", session_id: "session", scan_id: "scan", client_name: "qc", surface: "mcp_light", source: "unknown", tool_name: "certscore_scan_site", outcome: "success", error_code: null, quota_outcome: "allowed", duration_ms: 10, scan_decision: "new", scan_status: "running", canonical_status: "completed", canonical_outcome: "completed_partial", requested_resource: "example.com" };
const details = { version: 1, arguments: {}, argumentsOmitted: false, actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: null, taskContext: { purpose: "tracking_check", integrationId: "qc", integrationVersion: "1" } };
test("workflows relate observed intent, errors and bundle delivery without upgrading scan outcomes", () => {
  const [workflow] = buildMcpWorkflows([
    { ...base, request_details: details },
    { ...base, event_id: "b", occurred_at: "2026-09-08T12:00:10Z", tool_name: "certscore_get_scan_status", outcome: "rate_limited", quota_outcome: "rate_limited", error_code: "rate_limited" },
    { ...base, event_id: "c", occurred_at: "2026-09-08T12:01:00Z", tool_name: "certscore_get_scan_bundle", request_details: { ...details, taskContext: undefined, response: { bytes: 100, truncated: true } } },
  ]);
  assert.equal(workflow?.stage, "Bundle retrieved");
  assert.deepEqual(workflow?.purposes, ["tracking_check"]);
  assert.equal(workflow?.outcome, "completed_partial");
  assert.equal(workflow?.firstBundleSeconds, 60);
  assert.equal(workflow?.quotaHits, 1);
  assert.equal(workflow?.truncatedResponses, 1);
  assert.equal(workflow?.errors, 1);
});
test("shared scan IDs across sessions or clients are not merged; missing identity and intent stay unknown", () => {
  const groups = buildMcpWorkflows([base, { ...base, event_id: "b", session_id: "other" }, { ...base, event_id: "c", client_name: "other" }, { ...base, event_id: "d", session_id: null }, { ...base, event_id: "e", session_id: null }]);
  assert.equal(groups.length, 5);
  assert.ok(groups.every(group => !group.purposes.length && !group.integrations.length));
  assert.ok(groups.every(group => group.stage === "Completed; no bundle observed"));
});

test("a rejected request without a scan retains friction without inventing a scan outcome", () => {
  const [workflow] = buildMcpWorkflows([{ ...base, scan_id: null, canonical_status: null, canonical_outcome: null,
    scan_status: "invalid_arguments", outcome: "error", error_code: "invalid_arguments", request_details: details }]);
  assert.equal(workflow?.outcome, null);
  assert.equal(workflow?.stage, "Friction observed");
  assert.deepEqual(workflow?.purposes, ["tracking_check"]);
  assert.deepEqual(workflow?.friction, ["invalid_arguments"]);
});

test("a bundle read before a later scan request does not become a zero-second conversion", () => {
  const [workflow] = buildMcpWorkflows([
    { ...base, tool_name: "certscore_get_scan_bundle", scan_decision: "not_applicable" },
    { ...base, event_id: "b", occurred_at: "2026-09-08T12:01:00Z", scan_decision: "reused" },
  ]);
  assert.equal(workflow?.stage, "Bundle retrieved");
  assert.equal(workflow?.firstBundleSeconds, null);
});
