import assert from "node:assert/strict";
import test from "node:test";
import { filterReportFacingDemotionReasons } from "./report-facing-demotion-reasons";

test("not-projected preconsent packet demotion reasons exclude positive projection rationale", () => {
  const demotionReasons = filterReportFacingDemotionReasons({
    eligibility: "not_projected",
    reasons: [
      "missing:consent_timeline_sequence",
      "Validation-backed runtime evidence retained concrete tracker request evidence or non-essential cookie timing evidence, so pre-consent tracking is strong enough to stand on its own.",
      "evidence.preconsent.confirmed_when_validation_and_runtime_artifacts"
    ]
  });

  assert.deepEqual(demotionReasons, ["missing:consent_timeline_sequence"]);
});
