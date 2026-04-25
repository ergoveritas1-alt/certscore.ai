import assert from "node:assert/strict";
import test from "node:test";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";

test("policy enrichment rows synthesize positive disclosure packets when merged signals are absent", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        pageType: "privacy_policy",
        pageUrl: "https://www.example.com/privacy",
        policyEvidenceSnippets: {
          "topic:tracking_technologies_disclosure": "We use cookies, pixels, tags, beacons, scripts, and similar technologies."
        }
      }
    ],
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "tracking_technologies_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.snippets, [
    "We use cookies, pixels, tags, beacons, scripts, and similar technologies."
  ]);
});

test("policy enrichment positive synthesis ignores source-marker snippets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        pageType: "privacy_policy",
        pageUrl: "https://www.example.com/privacy",
        policyEvidenceSnippets: {
          dsar: "nano"
        },
        policyRightsSignals: ["access", "delete"]
      }
    ],
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "privacy_rights_path_present"), false);
});
