import assert from "node:assert/strict";
import test from "node:test";
import { shouldSurfacePrimarySignalFinding } from "./finding-evidence-gates";

test("bounded key-page discovery unresolved is allowed through to the surfacing engine", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        keyPageAttemptCount: 3,
        keyPageDiscoverySource: "footer_link",
        signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        signalLabel: "Bounded key-page discovery unresolved",
        signalValue: true
      },
      key: "disclosure.key_page_discovery_unresolved_after_bounded_search",
      linkedValidationEvidence: null,
      signalSource: "snapshot_signal"
    }),
    true
  );
});

test("policy-backed positive infrastructure findings can reach the surfacing engine even when upstream marked them audit-only", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        pageUrl: "https://www.spotify.com/us/legal/privacy-policy/",
        pageUrls: ["https://www.spotify.com/us/legal/privacy-policy/"],
        policyRightsSignals: ["access", "delete", "privacy_controls", "privacy_contact"],
        policySnippets: [
          "You have the right to access and delete your personal data.",
          "You can exercise your privacy controls and contact our privacy team by email."
        ],
        sourceUrls: ["https://www.spotify.com/us/legal/privacy-policy/"],
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalValue: true
      },
      key: "privacy.privacy_contact_path_present",
      linkedValidationEvidence: null,
      signalSource: "policy_enrichment_signal"
    }),
    true
  );
});
