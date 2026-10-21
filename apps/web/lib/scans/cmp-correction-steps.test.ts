import assert from "node:assert/strict";
import test from "node:test";
import { cmpCorrectionSteps } from "./cmp-correction-steps";
import type { CmpAuditRow } from "./cmp-audit-projection";

test("CMP review guidance supplies source changes and verification, not a generic review instruction", () => {
  for (const id of ["prominence", "implementation", "found_not_declared", "banner"]) {
    const steps = cmpCorrectionSteps({ id, label: id, status: "Review recommended" } as CmpAuditRow);
    assert.ok(steps.length >= 3);
    assert.match(steps.join(" "), /DevTools|configuration/);
    assert.match(steps.join(" "), /publish|Publish/);
    assert.match(steps.join(" "), /fresh|Retest|repeat|rerun/);
    assert.doesNotMatch(steps.join(" "), /^Check the evidence for this item/);
  }
});

test("positive and unassessed CMP criteria do not create a repair", () => {
  for (const status of ["Observed", "Not assessed"] as const) assert.deepEqual(cmpCorrectionSteps({ id: "banner", label: "Banner", status } as CmpAuditRow), []);
});
