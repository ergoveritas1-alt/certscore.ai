import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { McpRequestDetails } from "./mcp-request-details";

const event = {
  session_id: "a".repeat(24), actor_id: "b".repeat(24), tool_name: "certscore_get_scan_bundle",
  requested_resource: "scan_123", requested_resource_type: "scan_id" as const,
  quota_outcome: "rate_limited" as const, transport_outcome: "http_429" as const,
};

test("request details render recorded arguments, correlation links, and the enforced limit", () => {
  const html = renderToStaticMarkup(<McpRequestDetails traffic="external" period="6h" event={{ ...event,
    request_details: { version: 1, arguments: { scanId: "scan_123", detail: "full", maxBytes: 25000 }, argumentsOmitted: false,
      actorBasis: "requester_binding", sessionBasis: "mcp_session", rateLimit: { kind: "mcp_read", scope: "callerTarget", retryAfterSeconds: 25 } },
  }} />);
  assert.match(html, /Request details/);
  assert.match(html, /maxBytes/);
  assert.match(html, /25000/);
  assert.match(html, /callerTarget/);
  assert.match(html, /retryAfterSeconds/);
  assert.match(html, /may represent shared IP/);
  assert.match(html, /timeSpan=6h/);
  assert.match(html, /original chat prompts are not received/);
});

test("older events do not invent submitted options or stable identities", () => {
  const html = renderToStaticMarkup(<McpRequestDetails traffic="external" period="6h" event={event} />);
  assert.match(html, /Detailed arguments were not recorded/);
  assert.match(html, /Correlation basis not recorded/);
  assert.match(html, /Limit details were not retained/);
  assert.doesNotMatch(html, /maxBytes/);
});
