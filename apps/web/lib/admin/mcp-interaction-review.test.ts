import assert from "node:assert/strict";
import test from "node:test";
import { reviewMcpInteractions } from "./mcp-interaction-review";
import type { McpWorkflowEvent } from "./mcp-workflows";
const base: McpWorkflowEvent = { event_id: "a", occurred_at: "2026-09-11T12:00:00Z", session_id: "session", scan_id: "scan", client_name: "client", source: "openai", surface: "mcp_light", tool_name: "certscore_get_scan_status", outcome: "success", error_code: null, quota_outcome: "allowed", duration_ms: 1000, scan_decision: "not_applicable", scan_status: "running", canonical_status: "completed", canonical_outcome: "completed", requested_resource: "scan" };
const details = (summary: object = {}, extra: object = {}) => ({ version: 1, arguments: {}, argumentsOmitted: false, actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: null,
 response: { bytes: 100, truncated: false, summary: { version: 1, templateVersion: "2026-09-11.1", captureBasis: "response_generated", kind: "tool_result", isError: false, textOmitted: false, summaryTruncated: false, ...summary } }, ...extra });
const input = (value: string | null) => ({ version: 1, fields: [{ path: "arguments.detail", type: value === null ? "null" : "string", value, disposition: "retained" }], limits: [], questionStatus: "not_provided" });

test("adjacent success after invalid input and repeated errors require retained input proof", () => {
 const failure = { ...base, scan_id: null, outcome: "error", error_code: "invalid_arguments", request_details: details({ isError: true }, { argumentsOmitted: true, callerInput: input(null) }) };
 const success = { ...base, event_id: "b", occurred_at: "2026-09-11T12:00:10Z", request_details: details({}, { callerInput: input("full") }) };
 const result = reviewMcpInteractions([failure, success], 15);
 assert.equal(result.counts.successesAfterInvalid, 1);
 assert.equal(result.counts.changedInputsThenSuccess, 1);
 const repeated = reviewMcpInteractions([failure, { ...failure, event_id: "b", occurred_at: success.occurred_at }], 15);
 assert.equal(repeated.counts.repeatedSameError, 1);
 const missing = reviewMcpInteractions([{ ...failure, request_details: null }, { ...failure, event_id: "b", occurred_at: success.occurred_at }], 15);
 assert.equal(missing.counts.repeatedSameError, 0);
 assert.equal(missing.counts.comparableErrorPairs, 0);
});

test("sessions, clients, entrypoints, scan identities and time boundaries prevent invented journeys", () => {
 const a = { ...base, request_details: details({ recommendedNextTool: "certscore_get_scan_bundle" }) };
 const b = { ...base, event_id: "b", occurred_at: "2026-09-11T12:00:10Z", tool_name: "certscore_get_scan_bundle" };
 assert.equal(reviewMcpInteractions([a,b], 15).counts.bundleFollowUps, 1);
 for (const change of [{ session_id: null }, { session_id: "other" }, { client_name: "other" }, { surface: "mcp_anonymous" }, { source: "other" }, { scan_id: "other" }, { occurred_at: "2026-09-11T13:00:00Z" }, { occurred_at: base.occurred_at }]) {
   assert.equal(reviewMcpInteractions([a, { ...b, ...change }], 15).counts.nextToolPairs, 0);
 }
});

test("polling uses recorded response and request-start times, not completion gaps", () => {
 const a = { ...base, request_details: details({ recommendedNextTool: "certscore_get_scan_status", retryAfterSeconds: 10 }, { timing: { startedAt: "2026-09-11T11:59:59Z", responseGeneratedAt: "2026-09-11T12:00:00Z" } }) };
 for (const [start, counter] of [["05", "earlyPolls"], ["11", "respectedDelay"], ["10", "uncertainTiming"]] as const) {
  const b = { ...base, event_id: "b", occurred_at: "2026-09-11T12:00:20Z", request_details: details({}, { timing: { startedAt: `2026-09-11T12:00:${start}Z`, responseGeneratedAt: "2026-09-11T12:00:20Z" } }) };
  assert.equal(reviewMcpInteractions([a,b], 15).counts[counter], 1);
 }
 assert.equal(reviewMcpInteractions([a, { ...base, event_id: "b", occurred_at: "2026-09-11T12:00:20Z" }], 15).counts.pollingPairs, 0);
});

test("capture health keeps missing/invalid summaries separate from legacy size metadata", () => {
 const result = reviewMcpInteractions([
  base, { ...base, event_id: "b", request_details: details({ textOmitted: true }) },
  { ...base, event_id: "c", session_id: null, request_details: { ...details(), response: { bytes: 10, truncated: false } } },
  { ...base, event_id: "d", request_details: { unexpected: "invalid" } },
 ], 15);
 assert.deepEqual(result.health, { total: 4, validRequestDetails: 2, responseCaptured: 1, correlated: 3, repeatedSessionCalls: 3, inputOmitted: 0, responseLimited: 1, timingCaptured: 0 });
});


test("overlapping calls are not treated as following returned guidance", () => {
 const a = { ...base, request_details: details({ recommendedNextTool: "certscore_get_scan_status", retryAfterSeconds: 10 }, { timing: { startedAt: "2026-09-11T11:59:55Z", responseGeneratedAt: "2026-09-11T12:00:00Z" } }) };
 const b = { ...base, event_id: "b", occurred_at: "2026-09-11T12:00:05Z", request_details: details({}, { timing: { startedAt: "2026-09-11T11:59:59Z", responseGeneratedAt: "2026-09-11T12:00:05Z" } }) };
 const result = reviewMcpInteractions([a,b], 15);
 assert.equal(result.counts.nextToolPairs, 0);
 assert.equal(result.counts.uncertainTiming, 1);
});


test("a faster concurrent response cannot displace the actual next request", () => {
 const a = { ...base, occurred_at: "2026-09-11T12:00:01Z", request_details: details({ recommendedNextTool: "certscore_get_scan_status" }, { timing: { startedAt: "2026-09-11T12:00:00Z", responseGeneratedAt: "2026-09-11T12:00:01Z" } }) };
 const b = { ...base, event_id: "b", tool_name: "certscore_get_scan_bundle", occurred_at: "2026-09-11T12:00:20Z", request_details: details({}, { timing: { startedAt: "2026-09-11T12:00:02Z", responseGeneratedAt: "2026-09-11T12:00:20Z" } }) };
 const c = { ...base, event_id: "c", occurred_at: "2026-09-11T12:00:04Z", request_details: details({}, { timing: { startedAt: "2026-09-11T12:00:03Z", responseGeneratedAt: "2026-09-11T12:00:04Z" } }) };
 assert.equal(reviewMcpInteractions([a,c,b], 15).counts.nextToolMatched, 0);
});
