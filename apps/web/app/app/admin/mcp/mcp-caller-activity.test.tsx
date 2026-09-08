import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { McpCallerActivity } from "./mcp-caller-activity";

test("caller activity exposes the identifier, temporal scope, counts and rate limits", () => {
  const html = renderToStaticMarkup(<McpCallerActivity traffic="external" period="6h" event={{
    actor_id: "abcdef1234567890", session_id: "session-a", source: "openai", surface: "mcp_light",
    caller_activity: { calls5m: 4, calls10m: 6, calls60m: 8, quotaHits60m: 1 },
  }} />);
  for (const text of ["Caller abcdef123456", "Unverified caller binding", "5m: 4", "10m: 6", "60m: 8", "as of this request", "Rate limited / 429: 1", "q=abcdef1234567890", "source=openai", "surface=mcp_light"]) assert.ok(html.includes(text), text);
});

test("missing identity or missing counts are never presented as zero calls", () => {
  const event = { actor_id: null, session_id: null, source: "unknown", surface: "mcp_light" };
  assert.match(renderToStaticMarkup(<McpCallerActivity traffic="all" period="6h" event={event} />), /activity unknown/);
  const html = renderToStaticMarkup(<McpCallerActivity traffic="all" period="6h" event={{ ...event, session_id: "a" }} />);
  assert.match(html, /5m: —/);
  assert.match(html, /MCP session/);
});
