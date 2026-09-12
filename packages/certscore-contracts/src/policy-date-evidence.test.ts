import assert from "node:assert/strict";
import test from "node:test";
import { extractPolicyUpdateDateText } from "./policy-date-evidence";
test("policy update dates must contain a date immediately after their label", () => {
  assert.equal(extractPolicyUpdateDateText("Material changes will be reflected with updated content. 17. Privacy Contact Point"), undefined);
  assert.equal(extractPolicyUpdateDateText("Last updated: June 2026. Contact us."), "Last updated: June 2026");
  assert.equal(extractPolicyUpdateDateText("Effective date: 2026-09-11 More prose"), "Effective date: 2026-09-11");
  assert.equal(extractPolicyUpdateDateText("Updated on September 11, 2026. Next section"), "Updated on September 11, 2026");
});
