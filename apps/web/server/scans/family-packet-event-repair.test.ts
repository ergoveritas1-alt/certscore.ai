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
  assert.equal(cookiePacket?.presentationDecision.status, "audit_only");
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

test("replaces weak vanity contact targets with strong rendered-link discovery evidence", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_discovery",
        message: "discovery",
        metadataJson: {
          discoveryDebug: {
            topDiscoveryCandidates: [
              {
                candidateScore: 111,
                candidateUrl: "https://www.example.com/t/contact_us/",
                discoveredFrom: "rendered_link",
                hostRelation: "same_host",
                pageType: "contact",
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
        id: "evt_family",
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

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const contactPacket = packets.find((packet) => packet.unifiedFindingId === "contact_support_path_present");
  assert.ok(contactPacket);
  assert.equal(contactPacket?.presentationDecision.status, "audit_only");
  assert.equal(contactPacket?.primaryPageUrl, "https://www.example.com/t/contact_us/");
  assert.ok(contactPacket?.evidence?.pageUrls?.includes("https://www.example.com/t/contact_us/"));
  assert.ok(contactPacket?.evidence?.snippets?.includes("Homepage rendered link candidate for Contact Us."));
  assert.ok(!contactPacket?.evidence?.pageUrls?.includes("https://www.example.com/contact"));
});

test("backfills a missing terms finding from strong rendered-link discovery evidence", () => {
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
                candidateScore: 51,
                candidateUrl: "https://www.example.com/t/terms",
                discoveredFrom: "rendered_link",
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
        id: "evt_family_terms",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy",
                  fetchQuality: "verified_content",
                  snippet: "Privacy Policy",
                  supportedSurfaceTypes: ["privacy_policy"],
                  title: "Privacy Policy"
                }
              ],
              familyId: "legal_core",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy"],
                  findingId: "privacy_policy_present",
                  reason: "Verified legal-core evidence includes a privacy policy or privacy notice surface.",
                  sourceSurfaceTypes: ["privacy_policy"]
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

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const termsPacket = packets.find((packet) => packet.unifiedFindingId === "terms_of_service_present");
  assert.ok(termsPacket);
  assert.equal(termsPacket?.presentationDecision.status, "audit_only");
  assert.equal(termsPacket?.primaryPageUrl, "https://www.example.com/t/terms");
  assert.ok(termsPacket?.evidence?.snippets?.includes("Homepage rendered link candidate for Terms of Service."));
});

test("backfills a missing terms finding from a strong same-host footer legal link", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_discovery_footer_terms",
        message: "discovery",
        metadataJson: {
          discoveryDebug: {
            topDiscoveryCandidates: [
              {
                candidateScore: 95,
                candidateUrl: "https://www.example.com/legal/internet-services/terms/site.html",
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
        id: "evt_family_footer_terms",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/legal/privacy/",
                  fetchQuality: "verified_content",
                  snippet: "Privacy Policy",
                  supportedSurfaceTypes: ["privacy_policy"],
                  title: "Privacy Policy"
                }
              ],
              familyId: "legal_core",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/legal/privacy/"],
                  findingId: "privacy_policy_present",
                  reason: "Verified legal-core evidence includes a privacy policy or privacy notice surface.",
                  sourceSurfaceTypes: ["privacy_policy"]
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

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const termsPacket = packets.find((packet) => packet.unifiedFindingId === "terms_of_service_present");
  assert.ok(termsPacket);
  assert.equal(termsPacket?.presentationDecision.status, "audit_only");
  assert.equal(termsPacket?.primaryPageUrl, "https://www.example.com/legal/internet-services/terms/site.html");
});

test("backfills a missing accessibility support finding from a strong same-host footer link", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:00.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_discovery_footer_accessibility",
        message: "discovery",
        metadataJson: {
          discoveryDebug: {
            topDiscoveryCandidates: [
              {
                candidateScore: 99,
                candidateUrl: "https://www.example.com/accessibility/",
                discoveredFrom: "footer_link",
                hostRelation: "same_host",
                pageType: "accessibility_statement",
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
        id: "evt_family_footer_accessibility",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/contact/",
                  fetchQuality: "verified_content",
                  snippet: "Contact support",
                  supportedSurfaceTypes: ["contact_support"],
                  title: "Contact"
                }
              ],
              familyId: "support_access",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/contact/"],
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

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const accessibilityPacket = packets.find((packet) => packet.unifiedFindingId === "accessibility_support_path_present");
  assert.ok(accessibilityPacket);
  assert.equal(accessibilityPacket?.presentationDecision.status, "audit_only");
  assert.equal(accessibilityPacket?.primaryPageUrl, "https://www.example.com/accessibility/");
  assert.ok(accessibilityPacket?.evidence?.snippets?.includes("Homepage rendered link candidate for Accessibility."));
});

test("suppresses editorial accessibility initiative pages that do not retain support-path evidence", () => {
  const events = repairFindingFamilyPacketEvents({
    events: [
      {
        createdAt: "2026-03-30T00:00:01.000Z",
        eventType: "runtime.build_phase_diagnostic",
        id: "evt_family_editorial_accessibility",
        message: "family packet",
        metadataJson: {
          packets: [
            {
              canonicalTargets: [
                {
                  canonicalUrl: "https://belonging.example.com/disability-innovation/",
                  fetchQuality: "verified_content",
                  snippet:
                    "Co-creating a world where people with disabilities can thrive. Explore accessibility in our products & features.",
                  supportedSurfaceTypes: ["accessibility_support"],
                  title: "Disability Innovation in the Workplace and Beyond — Example"
                }
              ],
              familyId: "support_access",
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://belonging.example.com/disability-innovation/"],
                  findingId: "accessibility_support_path_present",
                  reason: "Verified support-access evidence includes accessibility, captioning, or accommodation language.",
                  sourceSurfaceTypes: ["accessibility_support"]
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

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: events,
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const accessibilityPacket = packets.find((packet) => packet.unifiedFindingId === "accessibility_support_path_present");
  assert.equal(accessibilityPacket, undefined);
});
