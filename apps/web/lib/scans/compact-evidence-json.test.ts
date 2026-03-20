import assert from "node:assert/strict";
import test from "node:test";
import { compactEvidenceJsonForDisplay } from "./compact-evidence-json";

test("compacts long evidence arrays into a sampled summary", () => {
  const compacted = compactEvidenceJsonForDisplay({
    supportingSignals: [
      {
        key: "privacy.preconsent_tracker_evidence_urls",
        value: [
          "https://a.example/1",
          "https://a.example/2",
          "https://a.example/3",
          "https://a.example/4",
          "https://a.example/5",
          "https://a.example/6"
        ]
      }
    ]
  }) as {
    supportingSignals: Array<{ value: { sample: string[]; totalCount: number; truncated: boolean } }>;
  };

  assert.equal(compacted.supportingSignals[0]?.value.totalCount, 6);
  assert.equal(compacted.supportingSignals[0]?.value.truncated, true);
  assert.deepEqual(compacted.supportingSignals[0]?.value.sample, [
    "https://a.example/1",
    "https://a.example/2",
    "https://a.example/3",
    "https://a.example/4",
    "https://a.example/5"
  ]);
});

test("compacts long strings for readability", () => {
  const compacted = compactEvidenceJsonForDisplay({
    runtimeEvidence: ["x".repeat(260)]
  }) as { runtimeEvidence: string[] };

  assert.match(compacted.runtimeEvidence[0] ?? "", /\[truncated 20 chars\]$/);
});
