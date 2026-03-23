import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChildContextFallbackEvidence,
  isChildContextSignalKey
} from "./signal-fallback-evidence";

test("recognizes child-context signal keys including privacy disclosure contradiction key", () => {
  assert.equal(
    isChildContextSignalKey("privacy.children_privacy_context_without_supporting_disclosure"),
    true
  );
  assert.equal(isChildContextSignalKey("context.kid_directed_content_detected"), true);
  assert.equal(isChildContextSignalKey("privacy.preconsent_tracking_detected"), false);
});

test("builds child-context fallback evidence with disclosure support fields", () => {
  const evidence = buildChildContextFallbackEvidence({
    signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
    signalLabel: "Child-directed context without supporting privacy disclosure",
    signalValue: true,
    snapshot: {
      children_audience_likely: true,
      kid_directed_content_detected: true,
      privacy_policy_present: false,
      privacy_contact_channel_type: "none",
      form_collects_birthdate: false,
      mentions_coppa: false
    }
  });

  assert.equal(evidence.childrenAudienceLikely, true);
  assert.equal(evidence.kidDirectedContentDetected, true);
  assert.equal(evidence.privacyPolicyPresent, false);
  assert.equal(evidence.privacyContactChannelType, "none");
  assert.equal(evidence.signalKey, "privacy.children_privacy_context_without_supporting_disclosure");
});
