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

test("adds supplemental enrichment unavailable when diagnostics report no API key", () => {
  const result = deriveSupplementalCoverageSignals({
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "urlscan_preflight_lookup",
          status: "no_api_key"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "urlscan_preflight_legal_fetch",
          error: "no_api_key"
        }
      }
    ],
    existingSignals: []
  });

  assert.deepEqual(
    result.supplementalSignals.find((signal) => signal.key === "disclosure.supplemental_runtime_enrichment_unavailable"),
    {
      key: "disclosure.supplemental_runtime_enrichment_unavailable",
      label: "Supplemental public runtime enrichment unavailable",
      snapshotField: "supplemental_runtime_enrichment_unavailable",
      value: ["supplemental_disclosure_fetch", "supplemental_runtime_lookup"]
    }
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
