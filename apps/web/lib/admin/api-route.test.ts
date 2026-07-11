import assert from "node:assert/strict";
import test from "node:test";
import { classifyAdminApiRoute } from "./api-route";

test("classifies API activity routes from retained request channels", () => {
  assert.equal(classifyAdminApiRoute({ requestChannel: "pulse_api" }), "Pulse");
  assert.equal(classifyAdminApiRoute({ requestChannel: "gpt_action" }), "Pulse");
  assert.equal(classifyAdminApiRoute({ requestChannel: "mcp" }), "MCP");
  assert.equal(classifyAdminApiRoute({ requestSource: "sdk" }), "SDK");
  assert.equal(classifyAdminApiRoute({ requestChannel: "partner_api" }), "Other");
});
