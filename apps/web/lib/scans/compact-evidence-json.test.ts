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

test("collapses repeated URL aliases into one display list", () => {
  const compacted = compactEvidenceJsonForDisplay({
    evidence: {
      pageUrls: ["https://example.test/"],
      sourceUrls: ["https://tracker.test/pixel.js", "https://tracker.test/pixel.js"],
      entities: {
        runtimeRequestUrls: ["https://tracker.test/pixel.js"],
        preconsent_cookie_initiator_urls: ["https://tracker.test/pixel.js", "https://cdn.test/tag.js"]
      },
      runtimeRequestUrls: ["https://tracker.test/pixel.js", "https://cdn.test/tag.js"]
    },
    sourceUrl: "https://tracker.test/pixel.js"
  }) as {
    evidence: {
      urls: string[];
      pageUrls?: string[];
      sourceUrls?: string[];
      runtimeRequestUrls?: string[];
      entities: {
        runtimeRequestUrls?: string[];
        preconsent_cookie_initiator_urls?: string[];
      };
    };
    sourceUrl?: string;
  };

  assert.deepEqual(compacted.evidence.urls, [
    "https://example.test/",
    "https://tracker.test/pixel.js",
    "https://cdn.test/tag.js"
  ]);
  assert.equal(compacted.evidence.pageUrls, undefined);
  assert.equal(compacted.evidence.sourceUrls, undefined);
  assert.equal(compacted.evidence.runtimeRequestUrls, undefined);
  assert.equal(compacted.evidence.entities.runtimeRequestUrls, undefined);
  assert.equal(compacted.evidence.entities.preconsent_cookie_initiator_urls, undefined);
  assert.equal(compacted.sourceUrl, undefined);
});
