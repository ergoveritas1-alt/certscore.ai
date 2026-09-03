import assert from "node:assert/strict";
import test from "node:test";

import { buildUnifiedFindingSupportAnalysis } from "./unified-finding-support-analysis";

test("support analysis preserves the current source-shape buckets for canonical unified findings", () => {
  const analysis = buildUnifiedFindingSupportAnalysis();
  const byId = new Map(analysis.map((record) => [record.id, record] as const));

  assert.equal(byId.get("privacy_policy_present")?.currentTriggerShape, "snapshot");
  assert.equal(byId.get("gpc_response")?.currentTriggerShape, "runtime");
  assert.equal(byId.get("privacy_rights_path_present")?.currentTriggerShape, "policy");
  assert.equal(byId.get("policy_behavior_conflict")?.currentTriggerShape, "mixed");
  assert.equal(byId.get("missing_dsar_mechanism")?.currentTriggerShape, "validation");
  assert.equal(byId.get("surface_title_mismatch")?.currentTriggerShape, "unmapped");
  assert.equal(byId.get("privacy_rights_path_present")?.nanoBackfillRequired, true);
  assert.equal(byId.get("privacy_policy_present")?.scannerSupportStatus, "direct");
  assert.equal(byId.get("missing_dsar_mechanism")?.action, "move to validation/internal");
});
