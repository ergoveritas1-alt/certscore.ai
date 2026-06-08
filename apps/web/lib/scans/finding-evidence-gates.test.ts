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

test("bounded key-page discovery unresolved is blocked when stable expected legal coverage is already retained", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        contactPagePresent: true,
        keyPageAttemptCount: 4,
        keyPageDiscoverySource: "footer_link",
        privacyPolicyPresent: true,
        signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
        signalLabel: "Bounded key-page discovery unresolved",
        signalValue: true,
        termsOfServicePresent: true
      },
      key: "disclosure.key_page_discovery_unresolved_after_bounded_search",
      linkedValidationEvidence: null,
      signalSource: "snapshot_signal"
    }),
    false
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

test("AI surface tracking review signal is allowed with retained hybrid runtime evidence", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        evidenceRefs: [
          "https://example.com/ai-assistant",
          "https://www.google-analytics.com/g/collect?v=2&cid=[redacted]"
        ],
        provenance: [
          {
            detail: "hybrid_runtime_evidence.ai_surface_runtime_evidence",
            kind: "document"
          }
        ],
        signalKey: "ai.flow_tracking_review_signal",
        signalLabel: "AI surface tracking review signal",
        signalValue: true
      },
      key: "ai.flow_tracking_review_signal",
      linkedValidationEvidence: null,
      signalSource: "runtime_artifact_signal"
    }),
    true
  );
});

test("AI surface tracking review signal accepts retained messenger runtime endpoints", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        evidenceRefs: [
          "https://www.intercom.com/",
          "https://api-iam.intercom.io/messenger/web/ping",
          "https://api-iam.intercom.io/messenger/web/events",
          "https://api-iam.intercom.io/messenger/web/rulesets/58118832/match",
          "https://api-iam.intercom.io/messenger/web/metrics"
        ],
        provenance: [
          {
            detail: "hybrid_runtime_evidence.ai_surface_runtime_evidence",
            kind: "document"
          }
        ],
        signalKey: "ai.flow_tracking_review_signal",
        signalLabel: "AI surface tracking review signal",
        signalValue: true
      },
      key: "ai.flow_tracking_review_signal",
      linkedValidationEvidence: null,
      signalSource: "runtime_artifact_signal"
    }),
    true
  );
});
