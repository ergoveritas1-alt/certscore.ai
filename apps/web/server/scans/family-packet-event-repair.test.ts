import assert from "node:assert/strict";
import test from "node:test";

import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { repairFindingFamilyPacketEvents } from "./family-packet-event-repair";

function buildPackets(events: ReturnType<typeof repairFindingFamilyPacketEvents>) {
  return buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });
}

test("enriches an existing cookie finding without creating a new finding id", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-27T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_cookie",
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

  const [event] = events;
  assert.ok(event);
  const packet = (event.metadataJson as { packets: Array<Record<string, unknown>> }).packets[0];
  assert.ok(packet);
  const findings = packet.supportedUnifiedFindings as Array<Record<string, unknown>>;
  assert.deepEqual(findings.map((finding) => finding.findingId), ["cookie_policy_present"]);

  const packets = buildPackets(events);
  const cookiePacket = packets.find((displayPacket) => displayPacket.unifiedFindingId === "cookie_policy_present");
  assert.ok(cookiePacket);
  assert.equal(cookiePacket.primaryPageUrl, "https://www.schwab.com/legal/privacy/us-residents");
  assert.equal(cookiePacket.evidence?.fetchQuality, "verified_content");
  assert.ok(
    cookiePacket.evidence?.snippets?.includes(
      "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
    )
  );
});

test("does not add cookie targets or finding ids when strong cookie evidence already exists", () => {
  const originalEvent = {
    createdAt: "2026-03-27T00:00:00.000Z",
    eventType: "runtime.build_phase_diagnostic",
    id: "evt_cookie_strong",
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

  assert.ok(event);
  const packet = (event.metadataJson as { packets: Array<Record<string, unknown>> }).packets[0];
  assert.ok(packet);
  assert.deepEqual(packet.canonicalTargets, originalEvent.metadataJson.packets[0]?.canonicalTargets);

  const findings = packet.supportedUnifiedFindings as Array<Record<string, unknown>>;
  assert.deepEqual(findings.map((finding) => finding.findingId), ["cookie_policy_present"]);
  assert.ok((findings[0]?.evidenceUrls as string[]).includes("https://www.example.com/privacy-notice"));
});

test("does not synthesize family packets from discovery-only privacy choices evidence", () => {
  const originalEvents = [
    {
      createdAt: "2026-03-30T00:00:00.000Z",
      eventType: "runtime.build_phase_diagnostic",
      id: "evt_discovery_only_privacy_choices",
      message: "discovery",
      metadataJson: {
        discoveryDebug: {
          topDiscoveryCandidates: [
            {
              candidateScore: 91,
              candidateUrl: "https://www.example.com/do-not-sell-or-share",
              discoveredFrom: "rendered_link",
              hostRelation: "same_host",
              pageType: "privacy_policy",
              sourceUrl: "https://www.example.com/"
            }
          ]
        },
        phase: "page_discovery_fetch"
      }
    }
  ];

  const events = repairFindingFamilyPacketEvents({
    events: originalEvents,
    policyEnrichment: []
  });

  assert.deepEqual(events, originalEvents);
  const packets = buildPackets(events);
  assert.equal(packets.find((packet) => packet.unifiedFindingId === "targeted_advertising_choices_present"), undefined);
});

test("does not append targeted advertising findings from retained privacy choices targets", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_family_privacy_choices",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/do-not-sell",
                  fetchQuality: "verified_content",
                  snippet: "Do Not Sell or Share My Personal Information",
                  supportedSurfaceTypes: ["privacy_choices"],
                  title: "Do Not Sell or Share My Personal Information"
                }
              ],
              familyId: "privacy_controls",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy"],
                  findingId: "privacy_rights_path_present",
                  reason: "Verified privacy-rights evidence includes a DSAR path.",
                  sourceSurfaceTypes: ["privacy_rights_dsar"]
                }
              ]
            }
          ],
          phase: "finding_family_packets"
        }
      }
    ],
    policyEnrichment: []
  });

  const packet = ((events[0]?.metadataJson as Record<string, unknown>).packets as Array<Record<string, unknown>>)[0];
  const findings = packet?.supportedUnifiedFindings as Array<Record<string, unknown>>;
  assert.deepEqual(findings.map((finding) => finding.findingId), ["privacy_rights_path_present"]);

  const displayPackets = buildPackets(events);
  assert.equal(
    displayPackets.find((displayPacket) => displayPacket.unifiedFindingId === "targeted_advertising_choices_present"),
    undefined
  );
});

test("does not backfill missing legal findings from discovery or policy enrichment", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_discovery_terms",
        message: "discovery",
        metadataJson: {
          discoveryDebug: {
            topDiscoveryCandidates: [
              {
                candidateScore: 95,
                candidateUrl: "https://www.example.com/legal/terms",
                discoveredFrom: "footer_link",
                hostRelation: "same_host",
                pageType: "terms_of_service",
                sourceUrl: "https://www.example.com/"
              }
            ]
          },
          phase: "page_discovery_fetch"
        }
      },
      {
        createdAt: "2026-03-30T00:00:01.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_family_legal",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [],
              familyId: "legal_core",
              supportedUnifiedFindings: []
            }
          ],
          phase: "finding_family_packets"
        }
      }
    ],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy",
        policy_summary_short: "Privacy policy for Example."
      }
    ]
  });

  const familyEvent = events.find((event) => event.id === "evt_family_legal");
  assert.ok(familyEvent);
  const packet = ((familyEvent.metadataJson as Record<string, unknown>).packets as Array<Record<string, unknown>>)[0];
  assert.deepEqual(packet?.supportedUnifiedFindings, []);

  const packets = buildPackets(events);
  assert.equal(packets.find((displayPacket) => displayPacket.unifiedFindingId === "privacy_policy_present"), undefined);
  assert.equal(packets.find((displayPacket) => displayPacket.unifiedFindingId === "terms_of_service_present"), undefined);
});

test("does not create support-access packets from discovery or surface-recovery events", () => {
  const originalEvents = [
    {
      createdAt: "2026-03-30T00:00:00.000Z",
      eventType: "runtime.build_phase_diagnostic",
      id: "evt_surface_recovery_contact",
      message: "surface recovery",
      metadataJson: {
        phase: "surface_recovery_side_merge",
        verificationResults: [
          {
            confidence: 0.99,
            requestedUrl: "https://www.example.com/contact",
            snippet: "Contact page with office addresses, phone numbers, and service help.",
            surfaceType: "contact_support",
            title: "Contact Us",
            verified: true,
            verifiedUrl: "https://www.example.com/contact"
          }
        ]
      }
    }
  ];

  const events = repairFindingFamilyPacketEvents({
    events: originalEvents,
    policyEnrichment: []
  });

  assert.deepEqual(events, originalEvents);
  const packets = buildPackets(events);
  assert.equal(packets.find((packet) => packet.unifiedFindingId === "contact_support_path_present"), undefined);
});

test("filters weak support targets and their orphan findings", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_family_support",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/contact",
                  fetchQuality: "verified_content",
                  snippet:
                    "contact - Example About Press Copyright Contact us Creators Advertise Developers Terms Privacy Policy",
                  supportedSurfaceTypes: ["contact_support"],
                  title: "contact - Example"
                }
              ],
              familyId: "support_access",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/contact"],
                  findingId: "contact_support_path_present",
                  reason: "Verified support-access evidence includes help, contact, or feedback language.",
                  sourceSurfaceTypes: ["contact_support"]
                }
              ]
            }
          ],
          phase: "finding_family_packets"
        }
      }
    ],
    policyEnrichment: []
  });

  const packet = ((events[0]?.metadataJson as Record<string, unknown>).packets as Array<Record<string, unknown>>)[0];
  assert.deepEqual(packet?.canonicalTargets, []);
  assert.deepEqual(packet?.supportedUnifiedFindings, []);
  assert.equal(
    buildPackets(events).find((displayPacket) => displayPacket.unifiedFindingId === "contact_support_path_present"),
    undefined
  );
});

test("suppresses weak privacy-policy hub pages with insufficient retained policy content", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_weak_privacy_hub",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://help.example.com/hc/sections/123-Terms-and-policies",
                  snippet: "Terms and policies - Help Centre",
                  supportedSurfaceTypes: ["privacy_policy"],
                  title: "Terms and policies - Help Centre"
                },
                {
                  canonicalUrl: "https://www.example.com/terms",
                  snippet: "Terms of Use",
                  supportedSurfaceTypes: ["terms_of_service"],
                  title: "Terms of Use"
                }
              ],
              familyId: "legal_core",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://help.example.com/hc/sections/123-Terms-and-policies"],
                  findingId: "privacy_policy_present",
                  reason: "Verified legal-core evidence includes a privacy policy or privacy notice surface.",
                  sourceSurfaceTypes: ["privacy_policy"]
                },
                {
                  evidenceUrls: ["https://www.example.com/terms"],
                  findingId: "terms_of_service_present",
                  reason: "Verified legal-core evidence includes a terms of service or terms and conditions surface.",
                  sourceSurfaceTypes: ["terms_of_service"]
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
        page_url: "https://help.example.com/hc/sections/123-Terms-and-policies",
        policy_actionable_flags: ["policy_fetch_insufficient_content"],
        policy_structurally_weak: true,
        policy_summary_short: "Insufficient policy content fetched for semantic review."
      }
    ]
  });

  const displayPackets = buildPackets(events);
  assert.equal(displayPackets.find((packet) => packet.unifiedFindingId === "privacy_policy_present"), undefined);
  assert.ok(displayPackets.find((packet) => packet.unifiedFindingId === "terms_of_service_present"));
});
