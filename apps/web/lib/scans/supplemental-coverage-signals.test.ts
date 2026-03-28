import assert from "node:assert/strict";
import test from "node:test";
import { deriveSupplementalCoverageSignals } from "./supplemental-coverage-signals";

test("adds bounded key-page discovery unresolved when surface recovery leaves key surfaces unresolved", () => {
  const result = deriveSupplementalCoverageSignals({
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "surface_recovery_summary",
          unresolvedSurfaceTypes: ["privacy_policy", "privacy_choices", "privacy_rights_dsar", "accessibility_support"]
        }
      }
    ],
    existingSignals: []
  });

  assert.ok(
    result.supplementalSignals.some(
      (signal) => signal.key === "disclosure.key_page_discovery_unresolved_after_bounded_search" && signal.value === true
    )
  );
});

test("adds bounded key-page discovery unresolved when policy enrichment is skipped because no policy pages were retained", () => {
  const result = deriveSupplementalCoverageSignals({
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "policy_enrichment",
          skipReason: "no_policy_pages",
          policyPageCount: 0,
          skipped: true
        }
      }
    ],
    existingSignals: []
  });

  assert.ok(
    result.supplementalSignals.some(
      (signal) => signal.key === "disclosure.key_page_discovery_unresolved_after_bounded_search" && signal.value === true
    )
  );
});
