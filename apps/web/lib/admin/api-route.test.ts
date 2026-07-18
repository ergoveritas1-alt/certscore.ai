import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_API_ROUTES, adminApiRouteSql, classifyAdminApiRoute } from "./api-route";

test("classifies API activity routes from retained request channels", () => {
  assert.equal(classifyAdminApiRoute({ requestChannel: "pulse_api" }), "Pulse");
  assert.equal(classifyAdminApiRoute({ requestChannel: "gpt_action" }), "Pulse");
  assert.equal(classifyAdminApiRoute({ requestChannel: "mcp" }), "MCP");
  assert.equal(classifyAdminApiRoute({ requestSource: "sdk" }), "SDK");
  assert.equal(classifyAdminApiRoute({ requestChannel: "partner_api" }), "Other");
});

test("exposes matching canonical route options and SQL classification", () => {
  assert.deepEqual(ADMIN_API_ROUTES, ["Pulse", "SDK", "MCP", "Other"]);
  const sql = adminApiRouteSql({ requestChannel: "pr.request_channel", requestSource: "pr.request_source" });
  assert.match(sql, /then 'MCP'/);
  assert.match(sql, /then 'SDK'/);
  assert.match(sql, /then 'Pulse'/);
  assert.match(sql, /else 'Other'/);
});
