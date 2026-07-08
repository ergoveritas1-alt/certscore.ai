import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportFacingProjectionCopy,
  filterReportFacingDemotionReasons
} from "./report-facing-demotion-reasons";

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

test("not-projected preconsent packet copy carries demotion context", () => {
  const copy = buildReportFacingProjectionCopy({
    demotionReasons: ["missing_preconsent_sequence_evidence"],
    eligibility: "not_projected",
    findingId: "preconsent_tracking",
    summary: "Observed vendor activity before consent for 7 vendors."
  });

  assert.match(copy.summary, /^Not projected as a canonical top finding: missing_preconsent_sequence_evidence\./);
  assert.match(copy.summary, /support evidence for review, not a confirmed top-finding packet/);
  assert.match(copy.summary, /Observed vendor activity before consent/);
});
