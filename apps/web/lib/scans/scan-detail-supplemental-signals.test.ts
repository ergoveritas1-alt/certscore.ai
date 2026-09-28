import assert from "node:assert/strict";
import test from "node:test";
import { deriveSupplementalSnapshotSignals } from "./scan-detail-supplemental-signals";

test("legacy snapshot absence and retargeting do not create a sale/share gap", () => {
  const signals = deriveSupplementalSnapshotSignals({
    existingSignals: [],
    events: [],
    primaryPolicyEnrichment: null,
    snapshot: {
      do_not_sell_link_present: false,
      retargeting_pixel_detected: true,
    },
  });
  assert.equal(signals.some((signal) => signal.key === "privacy.sale_sharing_controls_missing"), false);
});
