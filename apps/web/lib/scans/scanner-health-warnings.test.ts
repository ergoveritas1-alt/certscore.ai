import assert from "node:assert/strict";
import test from "node:test";
import { deriveScannerHealthWarnings } from "./scanner-health-warnings";

test("derives a scanner health warning when urlscan preflight lacks an API key", () => {
  const warnings = deriveScannerHealthWarnings([
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
        skipReason: "no_api_key"
      }
    }
  ]);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.code, "urlscan_api_key_missing");
  assert.deepEqual(warnings[0]?.phases, ["urlscan_preflight_legal_fetch", "urlscan_preflight_lookup"]);
});

test("ignores non-urlscan no_api_key diagnostics", () => {
  const warnings = deriveScannerHealthWarnings([
    {
      eventType: "runtime.build_phase_diagnostic",
      metadataJson: {
        phase: "policy_enrichment",
        status: "no_api_key"
      }
    }
  ]);

  assert.deepEqual(warnings, []);
});
