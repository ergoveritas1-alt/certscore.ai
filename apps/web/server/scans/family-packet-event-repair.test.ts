import assert from "node:assert/strict";
import test from "node:test";

import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { repairFindingFamilyPacketEvents } from "./family-packet-event-repair";

test("repairs weak privacy-controls family packets with cookie evidence from privacy-policy enrichment", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-27T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_1",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.schwab.com/cookies",
                  fetchQuality: "blocked_interstitial",
                  snippet: "Charles Schwab",
                  supportedSurfaceTypes: ["cookie_policy"],
                  title: "Charles Schwab"
                }
              ],
              familyId: "privacy_controls",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.schwab.com/cookies"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy"]
                }
              ]
            }
          ],
          phase: "finding_family_packets"
        }
      }
    ],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.schwab.com/legal/privacy/us-residents",
        policy_summary_short:
          "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
      }
    ]
  });

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const cookiePacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_present");
  assert.ok(cookiePacket);
  assert.equal(cookiePacket?.presentationDecision.status, "surface");
  assert.equal(cookiePacket?.primaryPageUrl, "https://www.schwab.com/legal/privacy/us-residents");
  assert.equal(cookiePacket?.evidence?.fetchQuality, "verified_content");
  assert.ok(
    cookiePacket?.evidence?.snippets?.includes(
      "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
    )
  );
  assert.ok(cookiePacket?.evidence?.pageUrls?.includes("https://www.schwab.com/legal/privacy/us-residents"));
});

test("does not modify privacy-controls packets that already retain strong cookie evidence", () => {
  const originalEvent = {
    createdAt: "2026-03-27T00:00:00.000Z",
    eventType: "runtime.build_phase_diagnostic",
    id: "evt_2",
    message: "family packet",
    metadataJson: {
      packets: [
        {
          canonicalTargets: [
            {
              canonicalUrl: "https://www.example.com/privacy-center",
              fetchQuality: "verified_content",
              snippet: "Manage Cookies and Your Privacy Choices",
              supportedSurfaceTypes: ["cookie_policy_or_settings"],
              title: "Privacy Center"
            }
          ],
          familyId: "privacy_controls",
          supportedUnifiedFindings: [
            {
              evidencePayload: {
                policySnippets: ["Manage Cookies and Your Privacy Choices"]
              },
              evidenceUrls: ["https://www.example.com/privacy-center"],
              findingId: "cookie_policy_present",
              reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
              sourceSurfaceTypes: ["cookie_policy_or_settings"]
            }
          ]
        }
      ],
      phase: "finding_family_packets"
    }
  };

  const [event] = repairFindingFamilyPacketEvents({
    events: [originalEvent],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy-notice",
        policy_summary_short: "How We Use Cookies and Other Tracking Technologies."
      }
    ]
  });

  assert.deepEqual(event, originalEvent);
});
