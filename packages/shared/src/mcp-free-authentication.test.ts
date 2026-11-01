import assert from "node:assert/strict";
import test from "node:test";
import { MCP_FREE_AUTHENTICATION, MCP_FREE_AUTHENTICATION_ALLOWANCE, MCP_FREE_AUTHENTICATION_MESSAGE, MCP_FREE_AUTHENTICATION_INTRO_MESSAGE, MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE, freeMcpAuthenticationOffer, sharedMcpPoolAuthenticationOffer, freeMcpAuthenticationOfferKind } from "./mcp-free-authentication";

test("free authentication starts after the second new scan and reminders never appear on every response", () => {
  for (const n of [0, 1, 3, 4, 6, 9, 11, 26, 49, 51, Number.NaN]) assert.equal(freeMcpAuthenticationOffer({ sessionNewScans: n }), null);
  assert.equal(freeMcpAuthenticationOffer({ sessionNewScans: 2 }), MCP_FREE_AUTHENTICATION_INTRO_MESSAGE);
  for (const n of [5, 10, 25, 50]) assert.equal(freeMcpAuthenticationOffer({ sessionNewScans: n }), MCP_FREE_AUTHENTICATION_MESSAGE);
});

test("offer gives a free optional path and derives exact existing allowances without promising a quota reset", () => {
  assert.ok(MCP_FREE_AUTHENTICATION_MESSAGE.includes(`${MCP_FREE_AUTHENTICATION_ALLOWANCE.dailyNewScans} new scans per rolling 24 hours`));
  assert.ok(MCP_FREE_AUTHENTICATION_MESSAGE.includes(`${MCP_FREE_AUTHENTICATION_ALLOWANCE.hourlyNewScans} per rolling hour per active workspace`));
  assert.ok(MCP_FREE_AUTHENTICATION_MESSAGE.includes(MCP_FREE_AUTHENTICATION.signupUrl));
  assert.ok(MCP_FREE_AUTHENTICATION_MESSAGE.includes(MCP_FREE_AUTHENTICATION.setupUrl));
  assert.match(MCP_FREE_AUTHENTICATION_MESSAGE, /No paid plan is required/);
  assert.match(MCP_FREE_AUTHENTICATION_MESSAGE, /does not reset active quotas/);
  assert.match(MCP_FREE_AUTHENTICATION_MESSAGE, /Authentication is optional/);
});

test("shared daily pool exhaustion offers optional workspace access without claiming other limits disappear", () => {
  assert.equal(sharedMcpPoolAuthenticationOffer({ scope: "surface", windowId: "daily" }), MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE);
  for (const limit of [null, [], {}, { scope: "surface", windowId: "burst" }, { scope: "surface", windowId: "concurrent" }, { scope: "ip", windowId: "daily" }]) assert.equal(sharedMcpPoolAuthenticationOffer(limit), null);
  assert.match(MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE, /No paid plan is required/);
  assert.match(MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE, /Existing workspace limits still apply/);
  assert.equal(freeMcpAuthenticationOfferKind(MCP_FREE_AUTHENTICATION_INTRO_MESSAGE), "intro");
  assert.equal(freeMcpAuthenticationOfferKind(MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE), "shared_pool");
  assert.equal(freeMcpAuthenticationOfferKind("untrusted arbitrary text"), null);
});
