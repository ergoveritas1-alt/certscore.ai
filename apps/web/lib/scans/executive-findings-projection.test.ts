import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRegulatoryLenses,
  buildRegulatoryLensesFromUnifiedPackets
} from "../../components/scans/executive-summary-card";
import { ADA_ACCESSIBILITY_FIXTURES } from "./ada-accessibility.fixtures";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function makePacket(
  unifiedFindingId: string,
  overrides: Partial<UnifiedFindingDisplayPacket> = {}
): UnifiedFindingDisplayPacket {
  return {
    affectedPageCount: 1,
    categoryAlignments: [],
    confidenceBand: "moderate",
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: true,
      hasCorroboratedPositiveSurfaceEvidence: true,
      hasDirectRuntimeEvidence: true,
      hasKeyPageDiscoveryEvidence: true,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: true,
      hasPacketBackedEvidence: true,
      hasPolicyTextEvidence: false,
      hasReadableSurfaceSnippetEvidence: true,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 1,
      sourceCount: 1,
      sourceKinds: ["signal"],
      validationCount: 0
    },
    details: { family: "commercial", kind: unifiedFindingId },
    linkedValidationFinding: null,
    observedValue: null,
    presentation: {
      findingName: unifiedFindingId,
      suggestedFix: "test",
      whyThisMatters: "test"
    },
    presentationDecision: {
      confidenceRationale: "test",
      downgradeReasons: [],
      rationale: "test",
      status: "surface",
      verificationLabel: "Verified",
      verificationState: "verified"
    },
    primaryPageUrl: "https://example.com/",
    referenceLabel: undefined,
    referenceUrl: undefined,
    severity: "medium",
    sourceLabel: undefined,
    sourceRefs: [],
    sourceUrl: undefined,
    summary: `${unifiedFindingId} summary`,
    surfacingDecision: {
      decisionState: "confirmed",
      policyVersion: "test",
      reportLane: "main",
      reportable: true,
      supports: [],
      unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: false,
      appliedRules: [],
      decisionReasons: [],
      family: "commercial",
      surfaceTier: "headline"
    },
    title: unifiedFindingId,
    unifiedFindingId,
    ...overrides
  } satisfies UnifiedFindingDisplayPacket;
}

test("projects surfaced unified findings into executive findings and regulatory lenses", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: { preconsentViolationCount: 2 },
        entities: {
          runtimeVendors: ["Meta Pixel", "Google Analytics"],
          runtimeRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://example.com/"],
        snippets: ["Trackers fired before consent interaction."],
        sourceUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
      },
      severity: "high",
      summary: "6 third-party requests fired before any consent action."
    }),
    makePacket("policy_behavior_conflict", {
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      severity: "high",
      summary: "Observed runtime behavior appears to conflict with policy representations."
    }),
    makePacket("accept_more_prominent_than_reject", {
      details: { family: "consent_tracking", kind: "accept_more_prominent_than_reject" },
      summary: "Accept appears more prominent than reject."
    }),
    makePacket("leveraged_or_high_risk_product_promotion", {
      details: { family: "financial_promotion", kind: "leveraged_or_high_risk_product_promotion" },
      presentationDecision: {
        confidenceRationale: "test",
        downgradeReasons: [],
        rationale: "test",
        status: "audit_only",
        verificationLabel: "Discovered",
        verificationState: "discovered"
      },
      surfacingDecision: {
        decisionState: "support_only",
        policyVersion: "test",
        reportLane: "confidence_and_coverage",
        reportable: true,
        supports: [],
        unifiedFindingId: "leveraged_or_high_risk_product_promotion",
        usedFamilyDefault: false,
        usedFindingOverride: false,
        appliedRules: [],
        decisionReasons: [],
        family: "financial_promotion",
        surfaceTier: "support"
      },
      summary: "High-risk promotion retained only for audit."
    })
  ]);

  assert.deepEqual(
    projection.findings.map((finding) => finding.id).sort(),
    [
      "asymmetric_consent_ui",
      "policy_behavior_contradiction_detected",
      "pre_consent_tracking_detected"
    ]
  );
  assert.equal(projection.posture, "Action Needed");
  const preconsentFinding = projection.findings.find((finding) => finding.id === "pre_consent_tracking_detected");
  assert.deepEqual(preconsentFinding?.evidenceDetails?.runtimeVendors, ["Meta Pixel", "Google Analytics"]);
  assert.deepEqual(preconsentFinding?.evidenceDetails?.runtimeRequestUrls, ["https://connect.facebook.net/en_US/fbevents.js"]);
  assert.deepEqual(preconsentFinding?.evidenceDetails?.counts, { preconsentViolationCount: 2 });
  assert.ok(
    projection.topFindings.every((finding) => projection.findings.some((candidate) => candidate.id === finding.id))
  );
  assert.ok(!projection.findings.some((finding) => finding.id === "leveraged_or_high_risk_product_promotion"));
  assert.deepEqual(
    projection.trace.packets.map((packet) => ({
      executiveFindingId: packet.executiveFindingId,
      inExecutiveFindings: packet.inExecutiveFindings,
      inRegulatoryLensInput: packet.inRegulatoryLensInput,
      status: packet.presentationStatus,
      unifiedFindingId: packet.unifiedFindingId
    })),
    [
      {
        executiveFindingId: "pre_consent_tracking_detected",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "preconsent_tracking"
      },
      {
        executiveFindingId: "policy_behavior_contradiction_detected",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "policy_behavior_conflict"
      },
      {
        executiveFindingId: "asymmetric_consent_ui",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "accept_more_prominent_than_reject"
      }
    ]
  );

  assert.equal(
    buildRegulatoryLenses(projection.findings, {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 6
    }).some((lens) => lens.acronym === "Financial & commercial claims"),
    false
  );
});

test("projects reject-path tracking failure into executive findings with dedicated evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_did_not_reduce_tracking", {
      confidenceBand: "high",
      details: {
        family: "consent_tracking",
        kind: "reject_did_not_reduce_tracking",
        requestUrls: [
          "https://example.com/baseline.js",
          "https://example.com/post-reject.js"
        ],
        vendors: ["Google Ads", "Adobe Analytics"]
      },
      evidence: {
        counts: {
          consentBaselineThirdPartyCookieCount: 3,
          consentOptOutClicks: 1,
          consentPostRejectThirdPartyCookieCount: 3
        },
        entities: {
          consentInteraction: [
            JSON.stringify({
              action_type: "reject_all",
              clicked_label: "Reject all",
              selector: "button#reject",
              clicked_at_ms: 1000,
              success: true
            })
          ],
          rejectEvidenceDiff: [
            JSON.stringify({
              baseline_vendors: ["Google Ads", "Adobe Analytics"],
              post_reject_vendors: ["Google Ads", "Adobe Analytics"],
              new_after_reject_vendors: [],
              persisting_after_reject_vendors: ["Google Ads", "Adobe Analytics"],
              baseline_request_count: 1,
              post_reject_request_count: 1,
              baseline_cookie_count: 3,
              post_reject_cookie_count: 3,
              baseline_third_party_cookie_count: 3,
              post_reject_third_party_cookie_count: 3
            })
          ],
          postRejectNonEssentialRequests: [
            JSON.stringify({
              vendor: "Google Ads",
              hostname: "googleadservices.com",
              category: "advertising",
              url: "https://example.com/post-reject.js",
              ts_ms: 1842,
              ms_after_reject: 842,
              resource_type: "script",
              initiator: null,
              why_non_essential: "Google Ads is classified as advertising."
            })
          ],
          suppressionChecks: [
            JSON.stringify({
              reject_click_confirmed: true,
              post_reject_window_available: true,
              non_essential_vendor_after_reject: true,
              cmp_initialization_only: false,
              navigation_or_reload_ambiguous: false,
              baseline_contradiction_detected: false
            })
          ],
          persisted_tracker_vendors: ["Google Ads", "Adobe Analytics"],
          runtimeRequestUrls: [
            "https://example.com/baseline.js",
            "https://example.com/post-reject.js"
          ]
        },
        fetchQuality: null,
        flags: ["reject_did_not_reduce_tracking", "reject_evidence_confirmed"],
        pageUrls: ["https://example.com/"],
        snippets: [
          "Reject flow retained tracking after opt-out. Baseline vendors: Google Ads, Adobe Analytics. Post-reject vendors: Google Ads, Adobe Analytics."
        ],
        sourceUrls: ["https://example.com/post-reject.js"]
      },
      severity: "high",
      summary: "Tracking requests still appeared after the reject interaction."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "reject_tracking_persists_after_reject");

  assert.ok(finding);
  assert.equal(finding?.directVsInferred, "direct");
  assert.deepEqual(finding?.evidenceDetails?.runtimeRequestUrls, [
    "https://example.com/baseline.js",
    "https://example.com/post-reject.js"
  ]);
  assert.deepEqual(finding?.evidenceDetails?.counts, {
    consentBaselineThirdPartyCookieCount: 3,
    consentOptOutClicks: 1,
    consentPostRejectThirdPartyCookieCount: 3
  });
  assert.ok(finding?.evidenceDetails?.evidenceFlags?.includes("reject_path_tracking_not_reduced"));
  assert.equal(finding?.evidenceDetails?.consentInteraction?.action_type, "reject_all");
  assert.equal(finding?.evidenceDetails?.postRejectNonEssentialRequests?.[0]?.ms_after_reject, 842);
  assert.equal(finding?.evidenceDetails?.suppressionChecks?.reject_click_confirmed, true);
  assert.equal(projection.trace.packets[0]?.executiveFindingId, "reject_tracking_persists_after_reject");
  assert.equal(projection.trace.packets[0]?.inRegulatoryLensInput, true);
});

test("downgrades reject-path tracking projection when post-reject timing is missing", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_did_not_reduce_tracking", {
      confidenceBand: "moderate",
      details: {
        family: "consent_tracking",
        kind: "reject_did_not_reduce_tracking",
        requestUrls: [
          "https://munchkin.marketo.net/munchkin.js",
          "https://px.ads.linkedin.com/collect?v=2"
        ],
        vendors: ["Marketo", "LinkedIn Insight Tag"]
      },
      evidence: {
        counts: {
          consentOptOutClicks: 1
        },
        entities: {
          promotionDecision: [
            JSON.stringify({
              promoted: false,
              reason: "Post-reject timing unavailable; cannot confirm persistence after reject.",
              requiredTimingSatisfied: false,
              requiredVendorClassificationSatisfied: true,
              requiredRejectClickSatisfied: true
            })
          ],
          postRejectNonEssentialRequests: [
            JSON.stringify({
              vendor: "LinkedIn Insight Tag",
              hostname: "px.ads.linkedin.com",
              category: "advertising",
              url: "https://px.ads.linkedin.com/collect?v=2",
              ts_ms: null,
              ms_after_reject: null,
              phase: "unknown",
              vendor_attribution_confidence: "high"
            })
          ],
          suppressionChecks: [
            JSON.stringify({
              reject_click_confirmed: true,
              post_reject_window_available: false,
              non_essential_vendor_after_reject: true,
              cmp_initialization_only: false,
              navigation_or_reload_ambiguous: false,
              baseline_contradiction_detected: false
            })
          ],
          runtimeRequestUrls: [
            "https://munchkin.marketo.net/munchkin.js",
            "https://px.ads.linkedin.com/collect?v=2"
          ]
        },
        fetchQuality: null,
        flags: ["reject_did_not_reduce_tracking", "reject_evidence_review"],
        pageUrls: ["https://example.com/"],
        snippets: ["Tracking requests appeared after the reject interaction; review timing and vendor classification."],
        sourceUrls: ["https://px.ads.linkedin.com/collect?v=2"]
      },
      severity: "high",
      summary: "Tracking requests appeared after the reject interaction."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "reject_tracking_persists_after_reject");

  assert.ok(finding);
  assert.equal(finding?.severity, "medium");
  assert.equal(finding?.confidence, "moderate");
  assert.equal(finding?.shortSummary, "Tracking requests were observed during the consent flow, but post-reject timing was not retained.");
  assert.equal(finding?.evidenceDetails?.promotionDecision?.promoted, false);
  assert.equal(finding?.evidenceDetails?.suppressionChecks?.post_reject_window_available, false);
});

test("projects surfaced scanner-level financial promotion into executive findings without validation rows", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("leveraged_or_high_risk_product_promotion", {
      details: { family: "financial_promotion", kind: "leveraged_or_high_risk_product_promotion" },
      evidence: {
        counts: {},
        entities: {
          pageUrls: ["https://example.com/sportsbook"]
        },
        fetchQuality: null,
        flags: ["financial.leveraged_or_high_risk_product_promotion"],
        pageUrls: ["https://example.com/sportsbook"],
        snippets: ["Sportsbook promotion language appeared on a wagering product page."],
        sourceUrls: ["https://example.com/sportsbook"]
      },
      summary: "High-risk financial product promotion language surfaced."
    })
  ]);

  assert.deepEqual(projection.findings.map((finding) => finding.id), [
    "leveraged_or_high_risk_product_promotion"
  ]);
  assert.deepEqual(projection.findings[0]?.evidenceDetails?.sourceUrls, ["https://example.com/sportsbook"]);
  assert.deepEqual(projection.findings[0]?.evidenceDetails?.evidenceSnippets, [
    "Sportsbook promotion language appeared on a wagering product page."
  ]);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
});

test("projects financial companion findings into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("guaranteed_outcome_claim_detected", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "guaranteed_outcome_claim_detected" },
      severity: "high",
      summary: "Guaranteed outcome language surfaced."
    }),
    makePacket("regulatory_registration_disclosure_absent", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "regulatory_registration_disclosure_absent" },
      severity: "high",
      summary: "Registration disclosure was not retained."
    }),
    makePacket("unsubstantiated_testimonial_near_performance_claim", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "unsubstantiated_testimonial_near_performance_claim" },
      severity: "high",
      summary: "Testimonial appeared near performance claim."
    }),
  ]);

  assert.deepEqual(
    projection.findings.map((finding) => finding.id).sort(),
    [
      "guaranteed_outcome_claim_detected",
      "regulatory_registration_disclosure_absent",
      "unsubstantiated_testimonial_near_performance_claim"
    ]
  );
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
  assert.ok(projection.topFindings.some((finding) => finding.id === "guaranteed_outcome_claim_detected"));
  assert.equal(projection.topFindings.filter((finding) => finding.section === "Financial & Claims").length, 2);
});

test("projects concrete sportsbook offer evidence into high-risk promotion finding", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("leveraged_or_high_risk_product_promotion", {
      details: { family: "financial_promotion", kind: "leveraged_or_high_risk_product_promotion" },
      evidence: {
        counts: {},
        entities: {
          offerSnippets: ["Get $1,000 in bonus bets when you sign up."],
          primaryOfferSnippet: ["Get $1,000 in bonus bets when you sign up."],
          responsibleGamblingDisclosureAdjacent: ["false"],
          termsDisclosureAdjacent: ["false"]
        },
        fetchQuality: null,
        flags: ["financial.leveraged_or_high_risk_product_promotion"],
        pageUrls: ["https://example.com/sportsbook"],
        snippets: ["Get $1,000 in bonus bets when you sign up."],
        sourceUrls: ["https://example.com/sportsbook"]
      },
      summary: "Sportsbook offer language was observed."
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "leveraged_or_high_risk_product_promotion");

  assert.equal(
    finding?.shortSummary,
    'Sportsbook offer language was observed ("Get $1,000 in bonus bets when you sign up.") without clear nearby responsible-gambling or terms evidence retained.'
  );
  assert.deepEqual(finding?.evidenceDetails?.offerSnippets, ["Get $1,000 in bonus bets when you sign up."]);
  assert.ok(finding?.evidenceDetails?.disclosureFindings?.includes("Clear adjacent disclosure evidence was not retained with the offer snippet."));
});

test("keeps runtime-backed session recording in top findings when consent issues also surface", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    }),
    makePacket("policy_behavior_conflict", {
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      severity: "high",
      summary: "Policy and runtime behavior conflict."
    }),
    makePacket("accept_more_prominent_than_reject", {
      details: { family: "consent_tracking", kind: "accept_more_prominent_than_reject" },
      summary: "Consent choices appear imbalanced."
    }),
    makePacket("session_replay_observed", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "session_replay_observed" },
      evidence: {
        counts: {},
        entities: {
          runtimeVendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.session_replay_runtime_vendors"],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      observedValue: "Microsoft Clarity",
      presentationDecision: {
        confidenceRationale: "Runtime vendor provenance retained.",
        downgradeReasons: [],
        rationale: "Direct runtime evidence retained a session-recording vendor.",
        status: "surface",
        verificationLabel: "Runtime",
        verificationState: "runtime"
      },
      severity: "medium",
      summary: "Microsoft Clarity session recording was observed."
    })
  ]);

  const topFindingIds = projection.topFindings.map((finding) => finding.id);
  assert.ok(topFindingIds.includes("session_recording_services_detected"));
  assert.ok(
    topFindingIds.indexOf("session_recording_services_detected") <
      topFindingIds.indexOf("asymmetric_consent_ui")
  );
  assert.equal(
    projection.topFindings.find((finding) => finding.id === "session_recording_services_detected")?.shortSummary,
    "Microsoft Clarity session recording was observed during runtime collection."
  );
});

test("projects blocking overlay context into executive top findings without violation framing", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("blocking_overlay_observed", {
      confidenceBand: "moderate",
      details: { family: "context", kind: "blocking_overlay_observed" },
      evidence: {
        counts: {},
        entities: {
          blockingOverlayType: ["cookie_wall"],
          overlayBehavior: ["interaction_blocked", "page_access_blocked_until_choice"],
          overlayControls: ["accept:present", "reject:absent", "manage:present", "close:absent"],
          rejectDepthClass: ["second_layer"]
        },
        fetchQuality: null,
        flags: ["blocking_overlay_observed", "overlay_interaction_blocked", "overlay_reject_second_layer"],
        pageUrls: [],
        snippets: [
          "A blocking cookie wall overlay was observed. This is common, but it increases concern when users cannot reject as easily as accept or when tracking begins before a choice is made.",
          "Overlay controls detected: accept present, reject absent, manage present, close absent."
        ],
        sourceUrls: []
      },
      presentationDecision: {
        confidenceRationale: "Overlay control evidence was retained.",
        downgradeReasons: [],
        rationale: "A blocking consent overlay was observed with retained control-state evidence.",
        status: "surface",
        verificationLabel: "Runtime",
        verificationState: "runtime"
      },
      severity: "medium",
      summary: "A blocking consent overlay was observed with an imbalanced choice path.",
      surfacingDecision: {
        ...makePacket("blocking_overlay_observed").surfacingDecision,
        decisionState: "support_only",
        family: "context",
        reportLane: "confidence_and_coverage",
        surfaceTier: "support"
      }
    }),
    makePacket("privacy_contact_channel_missing", { severity: "medium" }),
    makePacket("policy_clarity_risk", { severity: "medium" }),
    makePacket("cookie_policy_present", { severity: "medium" }),
    makePacket("privacy_rights_path_present", { severity: "medium" })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "blocking_overlay_observed");
  assert.equal(finding?.label, "Blocking consent overlay observed");
  assert.equal(finding?.section, "Consent Experience");
  assert.equal(finding?.severity, "medium");
  assert.ok(finding?.whyItMatters.includes("common"));
  assert.ok(!/violation/i.test(`${finding?.label} ${finding?.whyItMatters}`));
  assert.ok(projection.topFindings.some((entry) => entry.id === "blocking_overlay_observed"));
});

test("projects video content tracking exposure into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("video_content_tracking_exposure", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "video_content_tracking_exposure" },
      evidence: {
        counts: {},
        entities: {
          metaPixelPayloadFieldHints: ["ev", "dl", "page_title"],
          runtimeVendors: ["Meta Pixel"],
          videoTitleSnippets: ["Week 1 highlights"]
        },
        fetchQuality: null,
        flags: ["privacy.video_content_tracking_exposure_detected"],
        pageUrls: ["https://example.com/watch/highlights"],
        snippets: ["Week 1 highlights"],
        sourceUrls: ["https://www.facebook.com/tr/?ev=PageView"]
      },
      observedValue: "Meta/Facebook tracking was observed on a video-content surface.",
      severity: "high",
      summary: "Meta/Facebook tracking was observed on a video-content surface."
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "video_content_tracking_exposure");

  assert.equal(finding?.label, "Video content tracking exposure");
  assert.equal(finding?.section, "Privacy & Tracking");
  assert.deepEqual(finding?.evidenceDetails?.runtimeVendors, ["Meta Pixel"]);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
});

test("names first-party proxied FullStory collection in executive summary", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("session_replay_observed", {
      confidenceBand: "moderate",
      details: {
        family: "consent_tracking",
        kind: "session_replay_observed",
        vendors: ["FullStory"]
      },
      evidence: {
        counts: {},
        entities: {
          runtimeRequestUrls: ["https://www.draftkings.com"],
          runtimeVendors: ["FullStory"]
        },
        fetchQuality: null,
        flags: ["privacy.session_replay_runtime_detected"],
        pageUrls: ["https://www.draftkings.com"],
        snippets: ["collection_endpoint:first_party_collection_proxy", "tracker_vendor:FullStory"],
        sourceUrls: []
      },
      primaryPageUrl: "https://www.draftkings.com",
      summary: "Session replay runtime detected."
    })
  ]);

  const finding = projection.topFindings.find((candidate) => candidate.id === "session_recording_services_detected");

  assert.equal(
    finding?.shortSummary,
    "FullStory session recording appears proxied through the scanned first-party domain, which can make the collection endpoint harder to identify or block at the network level."
  );
  assert.deepEqual(finding?.evidenceDetails?.runtimeRequestUrls, ["https://www.draftkings.com"]);
  assert.ok(finding?.evidenceDetails?.evidenceFlags?.includes("session_replay_first_party_proxy_collection"));
});

test("projects concrete session replay vendor evidence into executive finding json", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("session_replay_observed", {
      confidenceBand: "moderate",
      details: {
        family: "consent_tracking",
        kind: "session_replay_observed",
        requestUrls: ["https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"],
        vendors: ["Qualtrics SiteIntercept"]
      },
      evidence: {
        counts: {},
        entities: {
          runtimeVendors: ["Qualtrics SiteIntercept"]
        },
        fetchQuality: null,
        flags: ["privacy.session_replay_runtime_detected", "privacy.session_replay_runtime_vendors"],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"]
      },
      observedValue: "Yes",
      presentationDecision: {
        confidenceRationale: "Runtime vendor provenance retained.",
        downgradeReasons: [],
        rationale: "Direct runtime evidence retained a session-recording vendor.",
        status: "surface",
        verificationLabel: "Runtime",
        verificationState: "runtime"
      },
      sourceRefs: [
        {
          kind: "signal",
          key: "privacy.session_replay_runtime_detected",
          label: "Session replay runtime detected",
          source: "snapshot_signal"
        }
      ],
      summary: "Session replay runtime detected."
    })
  ]);

  const finding = projection.topFindings.find((candidate) => candidate.id === "session_recording_services_detected");

  assert.deepEqual(finding?.evidenceDetails?.runtimeVendors, ["Qualtrics SiteIntercept"]);
  assert.deepEqual(finding?.evidenceDetails?.runtimeRequestUrls, [
    "https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"
  ]);
  assert.ok(finding?.evidencePreview.includes("Runtime vendor: Qualtrics SiteIntercept"));
  assert.equal(
    finding?.shortSummary,
    "Qualtrics SiteIntercept session recording was observed during runtime collection."
  );
});

test("projects representative accessibility packets into DOJ ADA regulatory lens", () => {
  const seriousExampleCount = ADA_ACCESSIBILITY_FIXTURES.seriousAxeExample.accessibilityRuleExamples.length;
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makePacket("accessibility_risk_score", {
        details: {
          family: "accessibility",
          kind: "accessibility_risk_score",
          ruleExamples: ["color-contrast"]
        },
        evidence: {
          counts: {},
          entities: {},
          fetchQuality: null,
          flags: ["representative_accessibility_examples_retained"],
          pageUrls: ["https://example.com/"],
          snippets: ["color-contrast on https://example.com/ (.hero-title)"],
          sourceUrls: []
        },
        summary: "Representative accessibility barriers were retained from axe examples."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        wcagErrorCountTotal: seriousExampleCount
      }
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, undefined);
  assert.notEqual(adaLens?.ratingLabel, "Not applicable");
  assert.ok(adaLens?.findings.some((finding) => /automated wcag|representative accessibility/i.test(finding.label)));
});

test("keeps DOJ ADA regulatory lens minimal for score-only accessibility packets", () => {
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makePacket("accessibility_risk_score", {
        details: {
          family: "accessibility",
          kind: "accessibility_risk_score"
        },
        evidence: {
          counts: {},
          entities: {},
          fetchQuality: null,
          flags: [],
          pageUrls: [ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.pageUrl],
          snippets: [`Accessibility risk score: ${ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.value}.`],
          sourceUrls: []
        },
        presentationDecision: {
          confidenceRationale: "Score-only accessibility signal remains audit-only.",
          downgradeReasons: ["No representative axe examples were retained."],
          rationale: "Score-only accessibility signal remains audit-only.",
          status: "audit_only",
          verificationLabel: "Audit only",
          verificationState: "triage"
        },
        summary: "Automated accessibility score was retained without representative axe examples."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, true);
  assert.equal(adaLens?.ratingLabel, "Audit-only");
  assert.equal(adaLens?.score, null);
});

test("projects surfaced contrast failures with representative axe evidence into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("contrast_failures", {
      confidenceBand: "high",
      details: {
        family: "accessibility",
        kind: "contrast_failures",
        ruleExamples: ["color-contrast"]
      },
      evidence: {
        counts: {
          representativeAxeExampleCount: 1,
          representativeAxePageCount: 1,
          representativeAxeRuleCount: 1
        },
        entities: {
          accessibilityRuleCodes: ["color-contrast"],
          accessibilityRuleGroups: ["wcag2aa"],
          accessibilitySelectors: ["p.low-contrast"],
          accessibilitySeverities: ["high"],
          accessibilityImpacts: ["serious"],
          maxAxeImpact: ["serious"]
        },
        fetchQuality: null,
        flags: ["representative_accessibility_examples_retained"],
        pageUrls: ["https://example.com/"],
        snippets: [
          "Axe example: color-contrast/wcag2aa on https://example.com/; selector p.low-contrast; nodes 1; impact serious; severity high; help: Elements must meet minimum color contrast ratio thresholds."
        ],
        sourceUrls: []
      },
      severity: "high",
      summary: "Representative color contrast failures were retained from axe evidence."
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "accessibility_risk_score");

  assert.ok(finding);
  assert.equal(finding?.section, "Accessibility");
  assert.equal(finding?.severity, "high");
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
  assert.ok(finding?.evidencePreview.some((snippet) => /color-contrast\/wcag2aa/i.test(snippet)));
  assert.ok(finding?.evidenceDetails?.evidenceFlags?.includes("representative_accessibility_examples_retained"));
});

test("records surfaced packets that are not yet mapped into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("some_unmapped_surface", {
      details: { family: "context", kind: "some_unmapped_surface" }
    })
  ]);

  assert.deepEqual(projection.findings, []);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, ["some_unmapped_surface"]);
});

test("projects sensitive data with third-party tracking into executive findings and top findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("sensitive_data_collection_with_third_party_tracking_present", {
      confidenceBand: "high",
      details: {
        family: "sensitive_data",
        kind: "sensitive_data_collection_with_third_party_tracking_present",
        dataTypes: ["phone_detected"]
      },
      evidence: {
        counts: {},
        entities: {
          request_domains: ["log.intellimize.co"],
          request_urls: ["https://log.intellimize.co/logger"],
          runtimeRequestUrls: ["https://log.intellimize.co/logger"],
          sensitive_data_types: ["phone_detected"],
          sensitive_source_fields: ["intellimizeClientIp"],
          sensitive_source_locations: ["request_body"],
          third_party_domains: ["log.intellimize.co"],
          vendors: ["log.intellimize.co"]
        },
        fetchQuality: "thin_content",
        flags: ["commerce.high_sensitivity_data_collection_detected"],
        pageUrls: [],
        snippets: ["intellimizeClientIp=***-***-4248"],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Sensitive-data collection with third-party tracking was retained."
    }),
    makePacket("contrast_failures", {
      confidenceBand: "high",
      details: {
        family: "accessibility",
        kind: "contrast_failures",
        ruleExamples: ["color-contrast"]
      },
      evidence: {
        counts: {
          representativeAxeExampleCount: 1
        },
        entities: {},
        fetchQuality: "verified_content",
        flags: ["representative_accessibility_examples_retained"],
        pageUrls: ["https://example.com/"],
        snippets: ["Representative color contrast failures were retained."],
        sourceUrls: []
      },
      severity: "low",
      summary: "Representative color contrast failures were retained."
    })
  ]);

  const finding = projection.findings.find(
    (candidate) => candidate.id === "sensitive_data_collection_with_third_party_tracking_present"
  );

  assert.ok(finding);
  assert.equal(finding?.section, "Privacy & Tracking");
  assert.equal(finding?.severity, "medium");
  assert.ok(finding?.shortSummary.includes("log.intellimize.co"));
  assert.match(finding?.shortSummary ?? "", /review whether any field values are transmitted/i);
  assert.deepEqual(
    finding?.evidenceDetails?.runtimeRequestUrls,
    ["https://log.intellimize.co/logger"]
  );
  assert.deepEqual(finding?.evidenceDetails?.sensitiveDataTypes, ["phone"]);
  assert.deepEqual(finding?.evidenceDetails?.sensitiveFieldContexts, [
    "field:intellimizeClientIp",
    "location:request body"
  ]);
  assert.ok(
    projection.topFindings.some(
      (candidate) => candidate.id === "sensitive_data_collection_with_third_party_tracking_present"
    )
  );
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
  assert.ok(
    projection.trace.packets.some(
      (packet) =>
        packet.unifiedFindingId === "sensitive_data_collection_with_third_party_tracking_present" &&
        packet.executiveFindingId === "sensitive_data_collection_with_third_party_tracking_present" &&
        packet.inTopFindings
    )
  );
});

test("surfaces sensitive-data tracking in regulatory lenses", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("sensitive_data_collection_with_third_party_tracking_present", {
      confidenceBand: "high",
      details: {
        family: "sensitive_data",
        kind: "sensitive_data_collection_with_third_party_tracking_present",
        dataTypes: ["phone_detected"]
      },
      evidence: {
        counts: {},
        entities: {
          request_domains: ["log.intellimize.co"],
          request_urls: ["https://log.intellimize.co/logger"],
          runtimeRequestUrls: ["https://log.intellimize.co/logger"],
          sensitive_data_types: ["phone_detected"],
          sensitive_source_fields: ["intellimizeClientIp"],
          sensitive_source_locations: ["request_body"],
          third_party_domains: ["log.intellimize.co"],
          vendors: ["log.intellimize.co"]
        },
        fetchQuality: "thin_content",
        flags: ["commerce.high_sensitivity_data_collection_detected"],
        pageUrls: [],
        snippets: ["intellimizeClientIp=***-***-4248"],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Sensitive-data collection with third-party tracking was retained."
    })
  ]);

  const lenses = buildRegulatoryLenses(projection.findings, {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 1
  });

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.ok(gdprLens?.findings.some((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"));
  assert.equal(gdprLens?.summary, "Sensitive-data collection and tracking exposure are the main issue.");
  assert.ok(cpraLens?.findings.some((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"));
  assert.equal(cpraLens?.summary, "Sensitive-data collection and downstream third-party exposure drive this score.");
  assert.ok(ftcLens?.findings.some((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"));
  assert.equal(
    ftcLens?.summary,
    "Sensitive-data collection alongside third-party tracking should be reviewed for unfairness or deception risk."
  );
});
