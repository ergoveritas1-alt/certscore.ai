import assert from "node:assert/strict";
import test from "node:test";
import { loadMergedSignalsByScanId } from "./merged-signal-summary";

test("loadMergedSignalsByScanId merges nano document semantic signals for summary paths", async () => {
  const mergedSignalsByScanId = await loadMergedSignalsByScanId({
    db: {
      from() {
        return {
          select() {
            return {
              async in() {
                return {
                  data: [
                    {
                      confidence: 0.87,
                      evidence_refs: ["https://example.com/privacy"],
                      observed_at: null,
                      population_source: "nano",
                      population_status: "present",
                      provenance_json: [{ detail: "scan_document_sources.privacy_policy", kind: "document" }],
                      scan_id: "scan-1",
                      signal_key: "privacy.gpc_disclosure_present",
                      signal_label: "GPC disclosure present",
                      signal_value_json: true,
                      value_type: "boolean"
                    }
                  ],
                  error: null
                };
              }
            };
          }
        };
      }
    },
    observedAtByScanId: new Map([["scan-1", "2026-04-03T16:24:49.590Z"]]),
    scanIds: ["scan-1"]
  });

  const mergedSignals = mergedSignalsByScanId.get("scan-1") ?? [];
  assert.equal(mergedSignals.length, 1);
  assert.equal(mergedSignals[0]?.key, "privacy.gpc_disclosure_present");
  assert.equal(mergedSignals[0]?.reportSignalSource, "document_semantic_signal");
  assert.equal(mergedSignals[0]?.populationStatus, "present");
  assert.equal(mergedSignals[0]?.selectedPopulation?.source, "nano");
  assert.deepEqual(mergedSignals[0]?.evidenceRefs, ["https://example.com/privacy"]);
});
