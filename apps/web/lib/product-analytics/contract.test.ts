import assert from "node:assert/strict";
import test from "node:test";
import { analyticsRouteIdentifier, extractScanIdFromPath, normalizeAnalyticsRoute, parseProductAnalyticsPayload } from "./contract";

const validEvent = {
  eventName: "page_viewed",
  category: "navigation",
  feature: "route",
  outcome: "observed",
  route: "/app/scans/1c798510-8cac-4bf3-8bc8-dda2f57a444f?token=secret"
};

test("normalizes routes without query values and replaces record identifiers", () => {
  assert.equal(normalizeAnalyticsRoute(validEvent.route), "/app/scans/:id");
  assert.equal(extractScanIdFromPath(validEvent.route), "1c798510-8cac-4bf3-8bc8-dda2f57a444f");
});

test("normalizes path-carried sites, emails, numeric IDs, and opaque tokens", () => {
  assert.equal(normalizeAnalyticsRoute("/pulse/example.com"), "/pulse/:site");
  assert.equal(normalizeAnalyticsRoute("/users/person%40example.com"), "/users/:value");
  assert.equal(normalizeAnalyticsRoute("/items/12345"), "/items/:id");
  assert.equal(normalizeAnalyticsRoute("/status/0123456789abcdef0123456789abcdef"), "/status/:id");
});

test("creates contract-safe identifiers for route-backed links and forms", () => {
  const formId = analyticsRouteIdentifier("form", "/app/admin/analytics?token=secret", 80);
  assert.equal(formId, "form:app:admin:analytics");
  assert.ok(parseProductAnalyticsPayload({
    ...validEvent,
    eventName: "form_submitted",
    category: "form",
    feature: formId,
    formId,
    outcome: "submitted"
  }));
  assert.equal(analyticsRouteIdentifier("link", "/app/scans/1c798510-8cac-4bf3-8bc8-dda2f57a444f"), "link:app:scans::id");
});

test("accepts only bounded structured product analytics fields", () => {
  const parsed = parseProductAnalyticsPayload({
    ...validEvent,
    actorId: "6c13c217-d6ea-41e5-a061-f46b579665de",
    elementId: "header-pricing",
    prompt: "private prompt",
    formValues: { email: "person@example.com" },
    authorization: "Bearer secret"
  });
  assert.ok(parsed);
  assert.equal(parsed.route, "/app/scans/:id");
  assert.equal(parsed.elementId, "header-pricing");
  assert.equal("prompt" in parsed, false);
  assert.equal("formValues" in parsed, false);
  assert.equal("authorization" in parsed, false);
});

test("accepts the OAuth-to-MCP activation funnel event names", () => {
  for (const eventName of ["oauth_authorized", "mcp_initialized", "mcp_tools_listed", "mcp_first_tool_invoked", "mcp_scan_requested"] as const) {
    assert.ok(parseProductAnalyticsPayload({
      ...validEvent,
      category: eventName === "oauth_authorized" ? "account" : "interaction",
      eventName,
      feature: "mcp:claude",
      outcome: "success"
    }));
  }
});

test("rejects identifiers and campaigns that look sensitive", () => {
  const parsed = parseProductAnalyticsPayload({
    ...validEvent,
    elementId: "person@example.com",
    campaignName: "https://example.com/private",
    campaignSource: "Bearer token"
  });
  assert.ok(parsed);
  assert.equal(parsed.elementId, undefined);
  assert.equal(parsed.campaignName, undefined);
  assert.equal(parsed.campaignSource, undefined);
});

test("rejects unrecognized event names and arbitrary feature strings", () => {
  assert.equal(parseProductAnalyticsPayload({ ...validEvent, eventName: "password_entered" }), null);
  assert.equal(parseProductAnalyticsPayload({ ...validEvent, feature: "user typed this sentence" }), null);
});
