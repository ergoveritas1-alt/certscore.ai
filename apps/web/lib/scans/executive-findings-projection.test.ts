import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRegulatoryLenses,
  buildRegulatoryLensesFromUnifiedPackets
} from "../../components/scans/executive-summary-card";
import { getSampleFindingById } from "../marketing/sample-finding-json";
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
    concernContext: {
      assertionLevels: ["strong"],
      evidenceStrengthFlags: ["direct_runtime"],
      externalSurfacingEligibilities: ["eligible"],
      negativeEvidenceFlags: [],
      originTypes: ["snapshot_signal"],
      promotionEligibilities: ["eligible"]
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

test("access-limited coverage packet does not project into canonical top findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("access_limited_no_reliable_findings", {
      presentationDecision: {
        confidenceRationale: "Access was blocked before reliable public-page evidence was retained.",
        downgradeReasons: [],
        rationale: "coverage status only",
        status: "surface",
        verificationLabel: "Limited",
        verificationState: "blocked"
      },
      severity: "medium",
      sourceRefs: [{ kind: "signal", key: "access_limited_no_reliable_findings", source: "runtime_artifact_signal" }],
      surfacingDecision: {
        decisionState: "confirmed",
        policyVersion: "test",
        reportLane: "confidence_and_coverage",
        reportable: true,
        supports: [],
        unifiedFindingId: "access_limited_no_reliable_findings",
        usedFamilyDefault: true,
        usedFindingOverride: false,
        appliedRules: ["family.coverage_gap.default"],
        decisionReasons: ["coverage status card only"],
        family: "coverage_gap",
        surfaceTier: "section"
      }
    })
  ]);

  assert.equal(
    projection.findings.some((finding) => finding.id === "access_limited_no_reliable_findings"),
    false
  );
  assert.equal(
    projection.topFindings.some((finding) => finding.id === "access_limited_no_reliable_findings"),
    false
  );
  assert.deepEqual(projection.trace.projectedFindingIds, []);
});

test("visual no-go packet prevents executive projection of placeholder-page findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("scan_quality_visual_no_go", {
      presentationDecision: {
        confidenceRationale: "WS01 visual access review classified the capture as a maintenance page.",
        downgradeReasons: [],
        rationale: "normal public page was not verified",
        status: "surface",
        verificationLabel: "Direct",
        verificationState: "verified"
      },
      severity: "high",
      sourceRefs: [{ kind: "signal", key: "scan_quality.visual_maintenance_or_unavailable", source: "runtime_artifact_signal" }],
      surfacingDecision: {
        decisionState: "review",
        policyVersion: "test",
        reportLane: "confidence_and_coverage",
        reportable: true,
        supports: [],
        unifiedFindingId: "scan_quality_visual_no_go",
        usedFamilyDefault: true,
        usedFindingOverride: false,
        appliedRules: ["family.context.default"],
        decisionReasons: ["Visual access review no-go."],
        family: "context",
        surfaceTier: "secondary"
      }
    }),
    makePacket("preconsent_tracking", {
      presentationDecision: {
        confidenceRationale: "Runtime evidence was retained on the captured page.",
        downgradeReasons: [],
        rationale: "tracking before consent",
        status: "surface",
        verificationLabel: "Direct",
        verificationState: "verified"
      },
      severity: "high",
      sourceRefs: [{ kind: "signal", key: "privacy.trackers_before_consent_detected", source: "runtime_artifact_signal" }],
      surfacingDecision: {
        decisionState: "confirmed",
        policyVersion: "test",
        reportLane: "main",
        reportable: true,
        supports: [],
        unifiedFindingId: "preconsent_tracking",
        usedFamilyDefault: true,
        usedFindingOverride: false,
        appliedRules: ["family.consent_tracking.default"],
        decisionReasons: ["Runtime evidence retained."],
        family: "consent_tracking",
        surfaceTier: "section"
      }
    })
  ]);

  assert.deepEqual(projection.findings.map((finding) => finding.id), ["scan_quality_visual_no_go"]);
  assert.deepEqual(projection.topFindings.map((finding) => finding.id), ["scan_quality_visual_no_go"]);
  assert.equal(projection.topFindings[0]?.label, "Normal public site was not reached");
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
});

function makePolicyRuntimeConflictPacket(
  overrides: Partial<UnifiedFindingDisplayPacket> = {},
  detailOverrides: Record<string, unknown> = {},
  entityOverrides: Record<string, unknown> = {}
) {
  const runtimeUrl = "https://connect.facebook.net/en_US/fbevents.js";
  return makePacket("consent_gated_tracking_claim_conflict", {
    confidenceBand: "high",
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: true,
      hasCorroboratedPositiveSurfaceEvidence: true,
      hasDirectRuntimeEvidence: true,
      hasKeyPageDiscoveryEvidence: true,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: true,
      hasPacketBackedEvidence: true,
      hasPolicyTextEvidence: true,
      hasReadableSurfaceSnippetEvidence: true,
      hasStructuredValidationEvidence: true,
      isFallbackOnly: false,
      issueCount: 1,
      signalCount: 1,
      sourceCount: 2,
      sourceKinds: ["validation"],
      validationCount: 1
    },
    details: {
      family: "contradiction",
      kind: "consent_gated_tracking_claim_conflict",
      claim: "Optional analytics and advertising cookies are controlled by cookie preferences and consent.",
      contradictionBasis: "The policy says optional tracking follows cookie preferences, but tracking began before consent.",
      bridgeGeneratedBy: "wc01.test",
      bridgeMappingType: "deterministic_policy_runtime_mapping",
      bridgeMappingVersion: "policy_behavior_conflict_map:v1",
      bridgeRuleId: "test.policy_behavior_cookie_preferences_preconsent_v1",
      conflictBridgeReasoning: "Cookie preference policy evidence is paired with concrete pre-consent tracker request evidence.",
      conflictSupportsPromotion: true,
      conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
      contradictionPromotionEligible: true,
      contradictionReviewStatus: "complete",
      policyAnchorRef: "policy:privacy#cookies",
      policyClaimType: "cookie_preferences_available",
      policySnippet: "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
      policySourceUrl: "https://example.com/privacy",
      runtimeAnchorRef: `request:${runtimeUrl}`,
      runtimeEvidenceArtifacts: [runtimeUrl],
      runtimeObservationType: "marketing_vendor_fired_pre_consent",
      runtimePhase: "pre_consent",
      sourceEvidenceIds: ["policy:privacy#cookies", `request:${runtimeUrl}`],
      vendors: ["Meta Pixel"],
      ...detailOverrides
    },
    evidence: {
      counts: {},
      entities: {
        policyConfidence: 0.8,
        runtimeBehaviorArtifacts: [
          {
            artifactType: "request",
            host: "connect.facebook.net",
            id: `request:${runtimeUrl}`,
            phase: "pre_consent",
            timestampMs: 640,
            url: runtimeUrl,
            vendor: "Meta Pixel"
          }
        ],
        runtimeConfidence: 0.9,
        runtimeRequestUrls: [runtimeUrl],
        runtimeVendors: ["Meta Pixel"],
        ...entityOverrides
      } as unknown as Record<string, string[]>,
      fetchQuality: null,
      flags: ["policy_runtime.consent_gated_tracking_claim_conflict"],
      pageUrls: ["https://example.com/privacy"],
      snippets: [
        "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
        "Cookie preference policy evidence is paired with concrete pre-consent tracker request evidence."
      ],
      sourceUrls: ["https://example.com/privacy", runtimeUrl]
    },
    sourceRefs: [
      {
        kind: "validation",
        ruleKey: "runtime_privacy.consent_gated_tracking_claim_conflict",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      }
    ],
    severity: "high",
    summary: "Policy and runtime behavior conflict.",
    ...overrides
  });
}

function makeCpraPacket(input: {
  optOutControlFound?: string;
  optOutUiResult: string;
  policyCbaLanguage?: string;
}) {
  return makePacket("cpra_cba_opt_out_missing", {
    confidenceBand: "high",
    details: { family: "consent_tracking", kind: "cpra_cba_opt_out_missing" },
    evidence: {
      counts: {},
      entities: {
        directAdvertisingSharingVendors: ["The Trade Desk"],
        choiceControlsInspected: ["true"],
        optOutControlFound: input.optOutControlFound ? [input.optOutControlFound] : [],
        optOutUiResult: [input.optOutUiResult],
        policyCbaLanguage: [input.policyCbaLanguage ?? "full_cba_language"]
      },
      fetchQuality: null,
      flags: ["privacy.cpra_cba_opt_out_missing"],
      pageUrls: ["https://example.com/"],
      snippets: [],
      sourceUrls: []
    },
    severity: "high",
    summary: "Cross-context behavioral advertising vendors were retained with incomplete opt-out evidence."
  });
}

test("projects surfaced unified findings into executive findings and regulatory lenses", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {
          cmpVisibleMs: 0,
          firstCookieSeenMs: 0,
          firstRequestMs: 712,
          firstThirdPartyRequestMs: 1500,
          preconsentViolationCount: 2
        },
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
	      details: {
	        family: "contradiction",
	        kind: "policy_behavior_conflict",
	        claim: "Optional analytics and advertising cookies are controlled by cookie preferences and consent.",
	        contradictionBasis: "The policy says optional tracking follows cookie preferences, but tracking began before consent.",
	        bridgeGeneratedBy: "wc01.test",
	        bridgeMappingType: "deterministic_policy_runtime_mapping",
	        bridgeMappingVersion: "policy_behavior_conflict_map:v1",
	        bridgeRuleId: "test.policy_behavior_cookie_preferences_preconsent_v1",
	        conflictBridgeReasoning: "Cookie preference policy evidence is paired with concrete pre-consent tracker request evidence.",
	        conflictSupportsPromotion: true,
	        conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
	        contradictionPromotionEligible: true,
	        contradictionReviewStatus: "complete",
	        policyAnchorRef: "policy:privacy#cookies",
	        policyClaimType: "cookie_preferences_available",
	        policySnippet: "We use optional analytics and advertising cookies only after you set cookie preferences or consent.",
	        policySourceUrl: "https://example.com/privacy",
	        runtimeAnchorRef: "request:https://connect.facebook.net/en_US/fbevents.js",
	        runtimeEvidenceArtifacts: ["https://connect.facebook.net/en_US/fbevents.js"],
	        runtimeObservationType: "marketing_vendor_fired_pre_consent",
	        runtimePhase: "pre_consent",
	        sourceEvidenceIds: ["policy:privacy#cookies", "request:https://connect.facebook.net/en_US/fbevents.js"],
	        vendors: ["Meta Pixel"]
	      },
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
  assert.equal(preconsentFinding?.evidenceDetails?.runtimeVendors, undefined);
  assert.equal(preconsentFinding?.evidenceDetails?.runtimeRequestUrls, undefined);
  assert.equal(preconsentFinding?.evidenceDetails?.sourceUrls, undefined);
  assert.equal(preconsentFinding?.evidenceDetails?.pageUrls, undefined);
  assert.equal(preconsentFinding?.evidenceDetails?.consentState?.userConsentActionObserved, false);
  assert.equal(preconsentFinding?.evidenceDetails?.consentState?.trackingOccurredBeforeConsentChoice, true);
  assert.deepEqual(
    preconsentFinding?.evidenceDetails?.vendors?.map((vendor) => vendor.name),
    ["Meta Pixel"]
  );
  assert.deepEqual(
    preconsentFinding?.evidenceDetails?.relatedOrInferredVendors?.map((vendor) => vendor.name),
    ["Google Analytics"]
  );
  assert.deepEqual(preconsentFinding?.evidenceDetails?.representativeRequests?.map((request) => request.url), [
    "https://connect.facebook.net/en_US/fbevents.js"
  ]);
  assert.deepEqual(preconsentFinding?.evidenceDetails?.counts, {
    totalPreConsentThirdPartyTrackingRequests: 2,
    representativePreConsentTrackingRequests: 1,
    uniquePreConsentTrackingVendorsObserved: 1,
    preConsentTrackingCookies: 0,
    identifierLikeRequests: 0
  });
  assert.equal(preconsentFinding?.evidenceVersion, "1.1");
  assert.deepEqual(preconsentFinding?.evidenceDetails?.scanContext, {
    pageUrl: "https://example.com/",
    scanMode: "initial_page_load",
    interactionBeforeFinding: false
  });
  assert.deepEqual(preconsentFinding?.evidenceDetails?.timing, {
    pageStartMs: 0,
    firstRequestMs: 712,
    firstThirdPartyRequestMs: 1500,
    firstThirdPartyTrackingRequestMs: 1500,
    firstCookieSeenMs: 0,
    firstTrackingCookieSeenMs: null
  });
  assert.equal(
    preconsentFinding?.evidenceDetails?.identifierEvidence?.addressingOrSignalingTransmittedByRequest,
    true
  );
  assert.match(
    preconsentFinding?.evidenceDetails?.identifierEvidence?.interpretation ?? "",
    /network-level addressing information/i
  );
  assert.doesNotMatch(
    preconsentFinding?.evidenceDetails?.identifierEvidence?.interpretation ?? "",
    /violation|liability|illegal|non-compliant/i
  );
  assert.deepEqual(preconsentFinding?.evidenceDetails?.timingAnalysis, {
    trackingBeforeConsentWindow: true,
    basis: "First third-party tracking request (1500ms) occurred after CMP became visible (0ms) and before any recorded consent interaction."
  });
  assert.equal(
    preconsentFinding?.evidenceDetails?.requestSelectionNote,
    "Representative requests are capped examples and are not exhaustive."
  );
  assert.deepEqual(preconsentFinding?.evidenceDetails?.policyEvidence, { evaluated: false });
  assert.ok(
    preconsentFinding?.evidencePreview.some((entry) =>
      entry.startsWith("Representative pre-consent tracking request:")
    )
  );
  assert.match(preconsentFinding?.shortSummary ?? "", /before any recorded consent choice/);
  assert.equal(preconsentFinding?.id, "pre_consent_tracking_detected");
  assert.equal(preconsentFinding?.label, "Third-party tracking observed before recorded consent");
  assert.match(preconsentFinding?.shortSummary ?? "", /Meta Pixel/);
  assert.match(preconsentFinding?.shortSummary ?? "", /1500ms/);
  assert.doesNotMatch(
    `${preconsentFinding?.label ?? ""} ${preconsentFinding?.shortSummary ?? ""} ${preconsentFinding?.whyItMatters ?? ""}`,
    /violates?|violation|liability|illegal|deceptive|manipulative|non-compliant/i
  );
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

test("does not project high-risk findings when the evidence contract failed upstream", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      concernContext: {
        assertionLevels: ["weak"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["audit_only"],
        negativeEvidenceFlags: ["missing_preconsent_sequence_evidence"],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["internal_only"]
      },
      details: { family: "consent_tracking", kind: "preconsent_tracking" }
    })
  ]);

  assert.deepEqual(projection.findings, []);
  assert.deepEqual(projection.trace.projectedFindingIds, []);
});

test("projects third-party cookie pre-consent when preconsent packet retains cookie timing evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {
          preConsentTrackingCookies: 2,
          preconsentViolationCount: 2
        },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstCmpVisibleMs: 0,
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 1052
            })
          ],
          preconsent_cookie_evidence: [
            JSON.stringify({
              category: "advertising",
              cookieInitiatorVendor: "Meta Pixel",
              cookieName: "_fbp",
              domain: "facebook.com",
              expiresDays: 90,
              nonEssential: true,
              party: "third_party",
              setAtMs: 3831,
              timingEvidence: "before_consent_cookie_write"
            })
          ],
          runtimeVendors: ["Meta Pixel"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected", "privacy.third_party_cookie_set_before_consent"],
        pageUrls: ["https://example.com/"],
        snippets: ["Third-party cookies were retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);

  const projectedIds = projection.findings.map((finding) => finding.id);
  assert.ok(projectedIds.includes("pre_consent_tracking_detected"));
  assert.ok(projectedIds.includes("third_party_cookie_pre_consent"));
  assert.deepEqual(
    projection.findings.find((finding) => finding.id === "pre_consent_tracking_detected")?.evidenceDetails?.preConsentCookieExamples,
    [
      {
        cookieName: "_fbp",
        domain: "facebook.com",
        category: "advertising",
        setAtMs: 3831,
        firstSeenMs: 3831,
        expiresDays: 90,
        sourceVendor: "Meta Pixel",
        initiatorUrl: null,
        consentActionMs: null,
        noConsentActionObserved: true,
        setBeforeConsent: true,
        timingEvidence: "before_consent_cookie_write"
      }
    ]
  );
  assert.equal(
    projection.findings.find((finding) => finding.id === "third_party_cookie_pre_consent")?.evidenceDetails?.cookieEvidence?.observed,
    true
  );
  assert.deepEqual(
    projection.findings.find((finding) => finding.id === "third_party_cookie_pre_consent")?.evidenceDetails?.cookieEvidence?.consentTimeline,
    {
      firstCmpVisibleMs: 0,
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: 1052
    }
  );
});

test("projects third-party cookie pre-consent from retained third-party cookie evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {
          preconsentViolationCount: 1
        },
        entities: {
          preconsent_cookie_categories: ["advertising"],
          preconsent_cookie_evidence: [
            JSON.stringify({
              category: "advertising",
              cookieName: "MUID",
              domain: ".bing.com",
              nonEssential: true,
              party: "third_party",
              timingEvidence: "before_consent_cookie_write"
            })
          ],
          preconsent_cookie_names: ["MUID"],
          preconsent_cookie_timing_evidence: ["before_consent_cookie_write"],
          preconsent_nonessential_cookie_names: ["MUID"],
          runtimeVendors: ["Microsoft Advertising"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://example.com/"],
        snippets: ["Tracking cookies were retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "third_party_cookie_pre_consent");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.cookieEvidence?.observed, true);
});

test("projects structured third-party cookie pre-consent without request urls but not from bare booleans", () => {
  const structuredProjection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: { preconsentViolationCount: 1 },
        entities: {
          preconsent_cookie_evidence: [
            JSON.stringify({
              beforeConsent: true,
              category: "advertising",
              cookieInitiatorVendor: "Amazon Ads",
              cookieName: "ad-privacy",
              cookiePartyType: "third_party",
              domain: ".amazon-adsystem.com",
              responseHost: "amazon-adsystem.com",
              thirdParty: true
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected", "privacy.third_party_cookie_set_before_consent"],
        pageUrls: ["https://example.com/"],
        snippets: ["Third-party cookies were retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);

  assert.ok(structuredProjection.findings.some((finding) => finding.id === "third_party_cookie_pre_consent"));

  const booleanOnlyProjection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {},
        entities: {},
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected", "privacy.third_party_cookie_set_before_consent"],
        pageUrls: ["https://example.com/"],
        snippets: ["A boolean cookie flag was retained."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);

  assert.equal(booleanOnlyProjection.findings.some((finding) => finding.id === "third_party_cookie_pre_consent"), false);
});

test("keeps official executive findings in top findings while preserving consent dark-pattern umbrella", () => {
  const expectedExecutiveFindingIds = [
    "asymmetric_consent_ui",
    "content_obstructed_by_overlay",
    "forced_consent_interaction",
    "identifier_transmission_detected",
    "multi_vendor_tracking_detected",
    "non_cookie_tracking_detected",
    "reject_option_missing_or_hidden",
    "telemetry_rich_identification_observed"
  ];
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_button_missing", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "reject_button_missing" },
      evidence: {
        counts: {},
        entities: {
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              availability: "hidden",
              preferencesRequiredBeforeReject: true,
              rejectAvailableOnFirstLayer: false,
              rejectClickDepth: 2
            })
          ],
          rejectDepthClass: ["absent"]
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_reject_button_missing"],
        pageUrls: ["https://example.com/"],
        snippets: ["Consent surface observed, but the reject option was not visible."],
        sourceUrls: []
      },
      severity: "high",
      summary: "Reject option was missing from the observed consent surface."
    }),
    makePacket("content_obstructed_by_overlay", {
      confidenceBand: "high",
      severity: "high"
    }),
    makePacket("accept_more_prominent_than_reject", {
      confidenceBand: "high",
      evidence: {
        counts: {},
        entities: {
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              choiceAsymmetry: "material",
              rejectClickDepth: 2,
              visualHierarchyScore: 2
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "high"
    }),
    makePacket("accept_only_banner", {
      confidenceBand: "high",
      evidence: {
        counts: {},
        entities: {
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              availability: "not_found",
              rejectAvailableOnFirstLayer: false
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "high"
    }),
    makePacket("forced_consent_wall", {
      confidenceBand: "high",
      evidence: {
        counts: {},
        entities: {
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              availability: "hidden",
              preferencesRequiredBeforeReject: true,
              rejectAvailableOnFirstLayer: false,
              rejectClickDepth: 2
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "high"
    }),
    makePacket("identifier_transmission_detected", {
      confidenceBand: "high",
      severity: "high"
    }),
    makePacket("multi_vendor_tracking_detected", {
      confidenceBand: "high",
      severity: "high"
    }),
    makePacket("non_cookie_tracking_detected", {
      confidenceBand: "high",
      severity: "high"
    }),
    makePacket("telemetry_rich_identification_observed", {
      confidenceBand: "high",
      severity: "high"
    }),
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high"
    })
  ]);

  for (const findingId of expectedExecutiveFindingIds) {
    assert.ok(projection.findings.some((finding) => finding.id === findingId));
  }
  for (const findingId of [
    "asymmetric_consent_ui",
    "forced_consent_interaction",
    "reject_option_missing_or_hidden"
  ]) {
    assert.ok(projection.topFindings.some((finding) => finding.id === findingId));
  }
  for (const findingId of [
    "content_obstructed_by_overlay",
    "identifier_transmission_detected",
    "multi_vendor_tracking_detected",
    "non_cookie_tracking_detected",
    "telemetry_rich_identification_observed"
  ]) {
    assert.equal(projection.topFindings.some((finding) => finding.id === findingId), false);
  }
  assert.ok(projection.findings.some((finding) => finding.id === "consent_dark_patterns_detected"));
  assert.ok(projection.topFindings.some((finding) => finding.id === "consent_dark_patterns_detected"));
});

test("projects concrete reject-missing dark-pattern evidence into the umbrella executive finding", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_button_missing", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "reject_button_missing" },
      evidence: {
        counts: {},
        entities: {
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              availability: "not_found",
              rejectAvailableOnFirstLayer: false
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_reject_button_missing"],
        pageUrls: ["https://example.com/"],
        snippets: ["Reject required a deeper preferences path while accept was available on the first layer."],
        sourceUrls: []
      },
      severity: "high",
      summary: "Reject option was missing from the first consent layer."
    })
  ]);

  assert.ok(projection.findings.some((finding) => finding.id === "reject_option_missing_or_hidden"));
  const umbrellaFinding = projection.findings.find((finding) => finding.id === "consent_dark_patterns_detected");
  assert.equal(umbrellaFinding?.label, "Consent choice architecture review signals");
  assert.equal(
    umbrellaFinding?.shortSummary,
    "The retained consent interaction structure shows reject was not available on the first layer."
  );
  assert.doesNotMatch(
    `${umbrellaFinding?.label ?? ""} ${umbrellaFinding?.shortSummary ?? ""} ${umbrellaFinding?.whyItMatters ?? ""}`,
    /dark pattern|violates?|violation|liability|illegal|deceptive|manipulative|non-compliant/i
  );
  assert.ok(projection.topFindings.some((finding) => finding.id === "consent_dark_patterns_detected"));
});

test("missing consent preference reopen control projects as lifecycle review, not dark-pattern finding", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("consent_control_not_reopenable", {
      confidenceBand: "moderate",
      details: { family: "consent_tracking", kind: "consent_control_not_reopenable" },
      evidence: {
        counts: {},
        entities: {
          consentControlLifecycleEvidence: [
            JSON.stringify({
              cmpReopenControlObserved: false,
              trackingRequiringConsentReviewObserved: true,
              controlsSearched: ["footer links", "cookie settings", "privacy settings", "CMP widget"],
              cookiePreferencesLinkObserved: false,
              coverageStatus: "usable",
              footerLinksInspected: ["Privacy Policy", "Terms of Use", "Contact"],
              footerPreferenceLinkObserved: false,
              initialConsentLayerObserved: true,
              pagesChecked: ["https://example.com/"],
              privacySettingsControlObserved: false,
              withdrawalTextObserved: false
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy_settings_control_not_observed"],
        pageUrls: ["https://example.com/"],
        snippets: [
          "No obvious cookie preferences, privacy settings, or consent-preference reopen control was observed on the scanned public pages."
        ],
        sourceUrls: []
      },
      severity: "medium",
      summary: "No obvious consent-preference reopen control was observed."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "consent_preference_reopen_control_not_observed");
  assert.ok(finding);
  assert.equal(finding.label, "Consent preference reopen control not observed");
  assert.equal(finding.severity, "medium");
  assert.equal(finding.confidence, "good");
  assert.equal(finding.directVsInferred, "inferred");
  assert.match(finding.shortSummary, /Manual review should confirm/i);
  assert.doesNotMatch(finding.shortSummary, /dark pattern|reject was not available/i);
  assert.equal(projection.findings.some((entry) => entry.id === "consent_dark_patterns_detected"), false);
  assert.equal(
    projection.topFindingEligibility.consent_preference_reopen_control_not_observed?.matchedCriteria.includes("runtime_request_anchor"),
    false
  );
});

test("missing consent preference reopen control without consent or tracking context is audit-only", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("consent_control_not_reopenable", {
      details: { family: "consent_tracking", kind: "consent_control_not_reopenable" },
      evidence: {
        counts: {},
        entities: {
          consentControlLifecycleEvidence: [
            JSON.stringify({
              trackingRequiringConsentReviewObserved: false,
              controlsSearched: ["footer links", "cookie settings"],
              coverageStatus: "usable",
              footerLinksInspected: ["Privacy Policy"],
              initialConsentLayerObserved: false,
              pagesChecked: ["https://example.com/"]
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy_settings_control_not_observed"],
        pageUrls: ["https://example.com/"],
        snippets: [],
        sourceUrls: []
      },
      severity: "medium"
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "consent_preference_reopen_control_not_observed");
  assert.ok(finding);
  assert.equal(projection.topFindingEligibility.consent_preference_reopen_control_not_observed?.eligibility, "audit_only");
  assert.equal(projection.topFindings.some((entry) => entry.id === "consent_preference_reopen_control_not_observed"), false);
});

test("projects reject path evidence from packet entities and records reject subtype", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_button_missing", {
      concernContext: undefined,
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "reject_button_missing" },
      evidence: {
        counts: {
          consentGovernancePolicySurfaceCount: 0
        },
        entities: {
          consentControlLifecycleEvidence: [
            JSON.stringify({
              cookiePreferencesLinkObserved: true,
              controlsSearched: ["Cookie Preferences"],
              coverageStatus: "usable",
              footerLinksInspected: ["Cookie Preferences"],
              footerPreferenceLinkObserved: true,
              initialConsentLayerObserved: true,
              pagesChecked: ["https://example.com/"],
              privacySettingsControlObserved: true
            })
          ],
          consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
          consentSurfaceDiagnostics: [
            JSON.stringify({
              bannerRendered: true,
              hydrationSettleWaitMs: 1500,
              candidateButtons: [
                { label: "Accept all", visible: true, interactable: true },
                { label: "Manage choices", visible: true, interactable: true }
              ],
              viewportStatus: "visible_in_viewport"
            })
          ],
          consentSurfaceObserved: ["true"],
          rejectPathDepthAndAvailability: [
            JSON.stringify({
              acceptClickDepth: 1,
              bannerLayerInspected: true,
              choiceAsymmetry: "material",
              evidenceRefs: ["consent-ui-screenshot.png"],
              preferencesRequiredBeforeReject: true,
              rejectAvailableOnFirstLayer: false,
              rejectClickDepth: 2,
              scrollRequired: false
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_reject_button_missing"],
        pageUrls: ["https://example.com/"],
        snippets: [
          "Consent governance disclosure note: retained public materials did not clearly explain how users can revisit, change, withdraw, retain, renew, expire, or understand consent choices."
        ],
        sourceUrls: []
      },
      severity: "high",
      summary: "Reject option required a preferences path."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "reject_option_missing_or_hidden");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.consentUiEvidence?.rejectOptionSubtype, "reject_requires_preferences_path");
  assert.equal(finding.evidenceDetails?.counts, undefined);
  assert.equal(finding.evidenceDetails?.evidenceSnippets, undefined);
  assert.equal(
    finding.evidenceDetails?.consentUiEvidence?.basis,
    "Retained consent UI path evidence showed no first-layer reject/refusal action; reject required the preferences path and was observed at click depth 2."
  );
  assert.deepEqual(finding.evidenceDetails?.consentUiEvidence?.firstLayerControls, [
    { label: "Accept all", visible: true, interactable: true, role: null },
    { label: "Manage choices", visible: true, interactable: true, role: null }
  ]);
  assert.deepEqual(finding.evidenceDetails?.consentUiEvidence?.runtimePath, {
    acceptClickDepth: 1,
    choiceAsymmetry: "material",
    domDigestAvailable: false,
    evidenceRefs: ["consent-ui-screenshot.png"],
    pathDepthDelta: 1,
    preferencesRequiredBeforeReject: true,
    rejectAvailableOnFirstLayer: false,
    rejectClickDepth: 2,
    screenshotArtifactAvailable: true,
    scrollRequired: false,
    surfaceType: "cookie_banner_or_modal"
  });
  assert.match(
    String(finding.evidenceDetails?.consentUiEvidence?.userChoiceImpact),
    /preferences or manage-choices path/
  );
  assert.equal(
    (finding.evidenceDetails?.consentUiEvidence?.lifecycleReview as Record<string, unknown> | undefined)?.subtype,
    "privacy_settings_control_observed"
  );
});

test("geotrust-style reject path stays medium and does not infer cookie wall without explicit blocking evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_button_missing", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "reject_button_missing" },
      evidence: {
        counts: {},
        entities: {
          consentSurfaceDiagnostics: [
            JSON.stringify({
              bannerRendered: true,
              candidateButtons: [
                { label: "Accept all", visible: true, interactable: true },
                { label: "More choices", visible: true, interactable: true }
              ],
              viewportStatus: "visible_in_viewport"
            })
          ],
          consentSurfaceObserved: ["true"],
          rejectPathDepthAndAvailability: [
            JSON.stringify({
              acceptClickDepth: 1,
              acceptLabel: "Accept all",
              blockedPageInteraction: true,
              choiceAsymmetry: "material",
              manageChoicesLabel: "More choices",
              pageAccessBlockedUntilChoice: true,
              preferencesRequiredBeforeReject: true,
              rejectAvailableOnFirstLayer: false,
              rejectClickDepth: 2,
              surfaceType: "cookie_wall"
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_reject_button_missing"],
        pageUrls: ["https://www.geotrust.com/"],
        snippets: [
          "This site uses cookies for functional, analytics, and advertising purposes. Select More choices to manage settings."
        ],
        sourceUrls: []
      },
      severity: "high",
      summary: "Reject option required a preferences path."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "reject_option_missing_or_hidden");
  assert.ok(finding);
  const runtimePath = finding.evidenceDetails?.consentUiEvidence?.runtimePath as Record<string, unknown> | undefined;
  assert.equal(finding.severity, "medium");
  assert.equal(finding.evidenceDetails?.consentUiEvidence?.rejectOptionSubtype, "reject_requires_preferences_path");
  assert.equal(runtimePath?.surfaceType, "cookie_banner_or_modal");
  assert.equal(runtimePath?.blockedPageInteraction, undefined);
  assert.equal(runtimePath?.pageAccessBlockedUntilChoice, undefined);
  assert.match(
    finding.shortSummary,
    /first observed consent layer presented an 'Accept all' action and a 'More choices' path/i
  );
  assert.match(finding.shortSummary, /functional, analytics, and advertising cookie purposes/i);
  assert.doesNotMatch(`${finding.shortSummary} ${finding.evidenceDetails?.consentUiEvidence?.basis ?? ""}`, /cookie wall|blocked page|page access/i);
});

test("explicit consent blocking evidence may retain cookie wall and page-blocked fields", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("reject_button_missing", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "reject_button_missing" },
      evidence: {
        counts: {},
        entities: {
          consentSurfaceObserved: ["true"],
          rejectPathDepthAndAvailability: [
            JSON.stringify({
              acceptClickDepth: 1,
              acceptLabel: "Accept all",
              blockedPageInteraction: true,
              blockingEvidenceSource: "runtime_consent_ui_probe",
              choiceAsymmetry: "material",
              manageChoicesLabel: "More choices",
              pageAccessBlockedUntilChoice: true,
              preferencesRequiredBeforeReject: true,
              rejectAvailableOnFirstLayer: false,
              rejectClickDepth: 2,
              surfaceType: "cookie_wall"
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_reject_button_missing"],
        pageUrls: ["https://example.com/"],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "Reject option required a preferences path."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "reject_option_missing_or_hidden");
  assert.ok(finding);
  const runtimePath = finding.evidenceDetails?.consentUiEvidence?.runtimePath as Record<string, unknown> | undefined;
  assert.equal(runtimePath?.surfaceType, "cookie_wall");
  assert.equal(runtimePath?.blockedPageInteraction, true);
  assert.equal(runtimePath?.pageAccessBlockedUntilChoice, true);
});

test("projects asymmetric consent UI with path-specific basis and without governance leakage", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("accept_more_prominent_than_reject", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "accept_more_prominent_than_reject" },
      evidence: {
        counts: {
          consentGovernancePolicySurfaceCount: 0
        },
        entities: {
          consentSurfaceDiagnostics: [
            JSON.stringify({
              candidateButtons: [
                { label: "Accept all", visible: true, interactable: true },
                { label: "Preferences", visible: true, interactable: true }
              ]
            })
          ],
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              choiceAsymmetry: "material",
              pageUrl: "https://www.bol.com/nl/nl/",
              preferencesRequiredBeforeReject: true,
              rejectAvailableOnFirstLayer: false,
              rejectClickDepth: 2,
              scrollRequired: true
            })
          ]
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_accept_button_prominence"],
        pageUrls: ["https://www.bol.com/nl/nl/"],
        snippets: [
          "Consent governance disclosure note: retained public materials did not clearly explain how users can revisit, change, withdraw, retain, renew, expire, or understand consent choices."
        ],
        sourceUrls: []
      },
      primaryPageUrl: "https://www.bol.com/nl/nl/",
      severity: "high",
      summary: "The retained consent interaction structure shows accept was materially easier than reject."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "asymmetric_consent_ui");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.counts, undefined);
  assert.equal(finding.evidenceDetails?.evidenceSnippets, undefined);
  assert.equal(finding.evidenceDetails?.scanContext?.pageUrl, "https://www.bol.com/nl/nl/");
  assert.match(
    String(finding.evidenceDetails?.consentUiEvidence?.basis ?? ""),
    /accept required 1 step\(s\), while reject required 2/
  );
  assert.deepEqual(finding.evidenceDetails?.consentUiEvidence?.firstLayerControls, [
    { label: "Accept all", visible: true, interactable: true, role: null },
    { label: "Preferences", visible: true, interactable: true, role: null }
  ]);
  assert.deepEqual(finding.evidenceDetails?.consentUiEvidence?.runtimePath, {
    acceptClickDepth: 1,
    choiceAsymmetry: "material",
    domDigestAvailable: false,
    pathDepthDelta: 1,
    preferencesRequiredBeforeReject: true,
    rejectAvailableOnFirstLayer: false,
    rejectClickDepth: 2,
    scrollRequired: true,
    screenshotArtifactAvailable: false,
    surfaceType: "cookie_banner_or_modal"
  });
  assert.match(
    String(finding.evidenceDetails?.consentUiEvidence?.userChoiceImpact ?? ""),
    /materially different visibility/
  );
});

test("does not project generic accept-only consent signals into the dark-pattern umbrella", () => {
  const weakProjection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("accept_only_banner", {
      evidence: {
        counts: {},
        entities: {},
        fetchQuality: null,
        flags: ["privacy.dark_pattern_accept_only_banner"],
        pageUrls: ["https://example.com/"],
        snippets: ["Promotional or choice architecture may need closer disclosure review."],
        sourceUrls: []
      },
      summary: "Promotional or choice architecture may need closer disclosure review."
    })
  ]);
  const concreteProjection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("accept_only_banner", {
      evidence: {
        counts: {},
        entities: {
          acceptActionLabels: ["accept all"],
          bannerTextSnippet: ["We use cookies to improve your experience. Accept all"],
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              availability: "not_found",
              rejectAvailableOnFirstLayer: false
            })
          ],
          rejectActionLabels: []
        },
        fetchQuality: null,
        flags: ["privacy.dark_pattern_accept_only_banner"],
        pageUrls: ["https://example.com/"],
        snippets: ["Consent banner showed an accept action without a retained reject action."],
        sourceUrls: []
      },
      summary: "Consent banner showed an accept action without a retained reject action."
    })
  ]);

  assert.equal(weakProjection.findings.some((finding) => finding.id === "consent_dark_patterns_detected"), false);
  assert.equal(weakProjection.topFindings.some((finding) => finding.id === "consent_dark_patterns_detected"), false);
  assert.ok(concreteProjection.findings.some((finding) => finding.id === "consent_dark_patterns_detected"));
  assert.ok(concreteProjection.topFindings.some((finding) => finding.id === "consent_dark_patterns_detected"));
});

test("projects RTB cookie sync into executive and privacy regulatory lenses", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("rtb_cookie_sync_observed", {
      confidenceBand: "high",
      details: {
        family: "consent_tracking",
        kind: "rtb_cookie_sync_observed",
        requestUrls: ["https://api.liveramp.com/pixel"],
        vendors: ["LiveRamp"]
      },
      evidence: {
        counts: { rtb_cookie_sync_observation_count: 1 },
        entities: {
          rtbCookieSyncEvidence: [
            JSON.stringify({
              hostname: "api.liveramp.com",
              path_sample: "/pixel",
              query_keys_sample: ["partnerid"],
              reason: "identifier_query",
              runtimePhase: "pre_consent",
              scannedPageUrl: "https://example.com/",
              url_sample: "https://api.liveramp.com/pixel"
            })
          ],
          runtimeRequestUrls: ["https://api.liveramp.com/pixel"],
          runtimeVendors: ["LiveRamp"]
        },
        fetchQuality: null,
        flags: ["preconsent_tracking_detected"],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "Request-level real-time bidding (RTB) or identity-sync evidence was retained."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "rtb_cookie_sync_observed");
  assert.ok(finding);
  assert.equal(finding.section, "Vendors & Requests");
  assert.equal(finding.evidenceVersion, "1.1");
  assert.equal(finding.evidenceDetails?.scanContext?.scanMode, "initial_page_load");
  assert.equal(finding.evidenceDetails?.syncEvidence?.observed, true);
  assert.equal(finding.evidenceDetails?.identifierEvidence?.identifierLikeRequestCount, 1);
  assert.deepEqual(finding.evidenceDetails?.policyEvidence, { evaluated: false });
  assert.equal(finding.evidenceDetails?.rtbCookieSyncEvidence?.[0]?.hostname, "api.liveramp.com");
  assert.equal(finding.evidenceDetails?.rtbCookieSyncEvidence?.[0]?.pageUrl, "https://example.com/");
  assert.equal(finding.evidenceDetails?.rtbCookieSyncEvidence?.[0]?.registrableDomain, "liveramp.com");
  assert.deepEqual(finding.evidenceDetails?.rtbCookieSyncEvidenceSubtypes, ["identifier_query_sync"]);
  assert.equal(finding.evidenceDetails?.rtbCookieSyncSubtypeCounts?.identifier_query_sync, 1);
  assert.deepEqual(finding.evidenceDetails?.rtbCookieSyncIdentifierQueryKeys, ["partnerid"]);
  assert.deepEqual(finding.evidenceDetails?.representativeRequests?.[0]?.queryKeysSample, ["partnerid"]);
  assert.match(finding.shortSummary, /real-time bidding \(RTB\) or identity-sync evidence/);
  assert.match(finding.shortSummary, /identifier or redirect-chain support/);
  assert.ok(projection.topFindings.some((entry) => entry.id === "rtb_cookie_sync_observed"));

  const lenses = buildRegulatoryLenses(projection.findings, {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 1
  });
  assert.ok(lenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((entry) => entry.id === "rtb_cookie_sync_observed"));
  assert.ok(lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA")?.findings.some((entry) => entry.id === "rtb_cookie_sync_observed"));
  assert.equal(lenses.find((lens) => lens.acronym === "FTC")?.findings.some((entry) => entry.id === "rtb_cookie_sync_observed"), false);
});

test("does not leak structured runtime disclosure rows into RTB summary vendor text", () => {
  const disclosureRow = JSON.stringify({
    subtype: "runtime_vendor_not_disclosed",
    observedRuntimeDomains: [],
    observedRuntimeVendors: ["Criteo", "DoubleClick", "DoubleVerify"]
  });
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("rtb_cookie_sync_observed", {
      confidenceBand: "high",
      details: {
        family: "consent_tracking",
        kind: "rtb_cookie_sync_observed",
        requestUrls: ["https://match.adsrvr.org/track/cmf/generic?ttd_pid=abc"],
        vendors: ["The Trade Desk"]
      },
      evidence: {
        counts: { rtb_cookie_sync_observation_count: 1 },
        entities: {
          rtbCookieSyncEvidence: [
            JSON.stringify({
              hostname: "match.adsrvr.org",
              pathSample: "/track/cmf/generic",
              queryKeysSample: ["ttd_pid"],
              reason: "identifier_query",
              runtimePhase: "pre_consent",
              urlSample: "https://match.adsrvr.org/track/cmf/generic?ttd_pid=abc",
              vendor: "The Trade Desk"
            })
          ],
          runtimeVendorDisclosureEvidence: [disclosureRow],
          runtimeVendors: [disclosureRow, "The Trade Desk"]
        },
        fetchQuality: null,
        flags: ["privacy.rtb_cookie_sync_observed"],
        pageUrls: ["https://www.nbcnews.com/"],
        snippets: [],
        sourceUrls: []
      },
      primaryPageUrl: "https://www.nbcnews.com/",
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "rtb_cookie_sync_observed");

  assert.match(finding?.shortSummary ?? "", /The Trade Desk/);
  assert.doesNotMatch(finding?.shortSummary ?? "", /runtime_vendor_not_disclosed|observedRuntimeVendors|\\{/);
  assert.deepEqual(finding?.evidenceDetails?.vendors?.map((vendor) => vendor.name), ["The Trade Desk"]);
});

test("splits RTB cookie-sync direct vendor counts from related redirect and inferred vendor context", () => {
  const broadRuntimeVendors = [
    "Criteo",
    "AppNexus / Xandr",
    "Taboola",
    "The Trade Desk",
    "Rubicon Project",
    ...Array.from({ length: 34 }, (_, index) => `Related Adtech ${index + 1}`)
  ];
  const makeSyncRow = (
    hostname: string,
    pathSample: string,
    urlSample: string,
    vendor: string,
    redirectTargetHost: string,
    queryKeysSample: string[] = ["uid"]
  ) => JSON.stringify({
    hostname,
    pathSample,
    queryKeysSample,
    reason: "identifier_query",
    redirectTargetHost,
    runtimePhase: "pre_consent",
    scannedPageUrl: "https://www.nbcnews.com/",
    urlSample,
    vendor
  });

  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("rtb_cookie_sync_observed", {
      confidenceBand: "high",
      details: {
        family: "consent_tracking",
        kind: "rtb_cookie_sync_observed",
        vendors: broadRuntimeVendors
      },
      evidence: {
        counts: { rtb_cookie_sync_observation_count: 12 },
        entities: {
          rtbCookieSyncEvidence: [
            makeSyncRow("gum.criteo.com", "/sync", "https://gum.criteo.com/sync?uid=abc", "Criteo", "id.rlcdn.com"),
            makeSyncRow("ib.adnxs.com", "/setuid", "https://ib.adnxs.com/setuid?uid=abc", "AppNexus / Xandr", "sync.taboola.com"),
            makeSyncRow("la-match.taboola.com", "/sync", "https://la-match.taboola.com/sync?uid=abc", "Taboola", "cm.g.doubleclick.net"),
            makeSyncRow("match.adsrvr.org", "/track/cmf/generic", "https://match.adsrvr.org/track/cmf/generic?ttd_pid=abc", "The Trade Desk", "eus.rubiconproject.com", ["ttd_pid"]),
            makeSyncRow("eus.rubiconproject.com", "/usync.html", "https://eus.rubiconproject.com/usync.html?p=abc", "Rubicon Project", "x.bidswitch.net", ["p"]),
            makeSyncRow("gum.criteo.com", "/sync", "https://gum.criteo.com/sync?uid=def", "Criteo", "match.adsrvr.org"),
            makeSyncRow("ib.adnxs.com", "/setuid", "https://ib.adnxs.com/setuid?uid=def", "AppNexus / Xandr", "sync.outbrain.com"),
            makeSyncRow("la-match.taboola.com", "/sync", "https://la-match.taboola.com/sync?uid=def", "Taboola", "id.rlcdn.com"),
            makeSyncRow("match.adsrvr.org", "/track/cmf/generic", "https://match.adsrvr.org/track/cmf/generic?ttd_pid=def", "The Trade Desk", "sync.taboola.com", ["ttd_pid"]),
            makeSyncRow("eus.rubiconproject.com", "/usync.html", "https://eus.rubiconproject.com/usync.html?p=def", "Rubicon Project", "cm.g.doubleclick.net", ["p"]),
            makeSyncRow("gum.criteo.com", "/sync", "https://gum.criteo.com/sync?uid=ghi", "Criteo", "eus.rubiconproject.com"),
            makeSyncRow("ib.adnxs.com", "/setuid", "https://ib.adnxs.com/setuid?uid=ghi", "AppNexus / Xandr", "x.bidswitch.net")
          ],
          runtimeVendors: broadRuntimeVendors
        },
        fetchQuality: null,
        flags: ["privacy.rtb_cookie_sync_observed"],
        pageUrls: ["https://www.nbcnews.com/"],
        snippets: [],
        sourceUrls: [
          "https://gum.criteo.com/sync?uid=abc",
          "https://ib.adnxs.com/setuid?uid=abc",
          "https://la-match.taboola.com/sync?uid=abc",
          "https://match.adsrvr.org/track/cmf/generic?ttd_pid=abc",
          "https://eus.rubiconproject.com/usync.html?p=abc"
        ]
      },
      primaryPageUrl: "https://www.nbcnews.com/",
      severity: "high",
      summary: "Request-level real-time bidding (RTB) or identity-sync evidence was retained."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "rtb_cookie_sync_observed");

  assert.ok(finding);
  assert.ok(projection.topFindings.some((entry) => entry.id === "rtb_cookie_sync_observed"));
  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.nbcnews.com/");
  assert.equal(finding?.evidenceDetails?.counts?.totalRtbCookieSyncObservations, 12);
  assert.equal(finding?.evidenceDetails?.counts?.representativeSyncRequests, 8);
  assert.equal(finding?.evidenceDetails?.counts?.uniqueDirectSyncVendorsObserved, 5);
  assert.equal(finding?.evidenceDetails?.counts?.uniqueRelatedOrRedirectHostsObserved, 7);
  assert.equal(finding?.evidenceDetails?.counts?.uniqueRelatedOrInferredSyncVendors, 34);
  assert.equal(finding?.evidenceDetails?.counts?.strongSyncEvidenceRows, 12);
  assert.equal(finding?.evidenceDetails?.counts?.syncPathOnlyRows, 0);
  assert.equal(finding?.evidenceDetails?.counts?.uniqueSyncVendorsObserved, undefined);
});

test("projects cross-domain identifier sharing rows into executive evidence details", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("cross_domain_identifier_sharing_observed", {
      confidenceBand: "high",
      evidence: {
        counts: {},
        entities: {
          crossDomainIdentifierSharingCategories: ["identity_graph"],
          crossDomainIdentifierSharingDestinations: ["liveramp.com"],
          crossDomainIdentifierSharingEvidence: [
            JSON.stringify({
              destinationClassification: "identity_graph",
              destinationDomain: "api.liveramp.com",
              destinationEtldPlusOne: "liveramp.com",
              identifierClass: "durable_id",
              key: "partnerid",
              pageUrl: "https://example.com/",
              repeatedAcrossEtlds: ["liveramp.com"],
              requestUrlRedacted: "https://api.liveramp.com/pixel?partnerid=%5Bredacted%5D",
              scannedPageUrl: "https://example.com/",
              valueHash: "a".repeat(64)
            })
          ]
        },
        fetchQuality: null,
        flags: ["direct_runtime"],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "Identifier-like values were observed in retained identity-sync request evidence."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "cross_domain_identifier_sharing_observed");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.scanContext?.pageUrl, "https://example.com/");
  assert.equal(finding.evidenceDetails?.counts?.crossDomainIdentifierEvidenceRows, 1);
  assert.equal(finding.evidenceDetails?.counts?.crossDomainIdentifierDestinations, 2);
  assert.deepEqual(finding.evidenceDetails?.trackingEvidence?.identifierKeys, ["partnerid"]);
  assert.deepEqual(finding.evidenceDetails?.trackingEvidence?.destinationDomains, ["liveramp.com", "api.liveramp.com"]);
  assert.equal(finding.evidenceDetails?.crossDomainIdentifierSharingEvidence?.[0]?.destinationDomain, "api.liveramp.com");
  assert.deepEqual(finding.evidenceDetails?.representativeRequests?.[0]?.queryKeysSample, ["partnerid"]);
  assert.equal(finding.evidenceDetails?.identifierEvidence?.identifierLikeRequestCount, 1);
  assert.equal(finding.evidenceDetails?.runtimeRequestUrls?.[0], "https://api.liveramp.com/pixel?partnerid=%5Bredacted%5D");
  assert.ok(finding.evidencePreview.some((entry) => entry.includes("liveramp.com")));
  assert.ok(finding.evidencePreview.some((entry) => entry.includes("partnerid")));
  assert.ok(finding.evidencePreview.some((entry) => entry.includes("%5Bredacted%5D")));
});

test("keeps cross-domain identifier sharing scan context on audited page when row page URL is an endpoint", () => {
  const endpointUrl = "https://pbs.yahoo.com/setuid [query_redacted=true query_keys=bidder,uid,gdpr,us_privacy]";
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("cross_domain_identifier_sharing_observed", {
      confidenceBand: "high",
      evidence: {
        counts: {},
        entities: {
          crossDomainIdentifierSharingCategories: ["identity_graph", "advertising"],
          crossDomainIdentifierSharingDestinations: ["adnxs.com", "yahoo.com", "amazon-adsystem.com", "rlcdn.com"],
          crossDomainIdentifierSharingEvidence: [
            JSON.stringify({
              classificationReason: "identifier_query_redirect_chain",
              destinationClassification: "rtb_identity",
              destinationDomain: "ib.adnxs.com",
              destinationEtldPlusOne: "adnxs.com",
              entropyScore: 3.8,
              identifierClass: "durable_id",
              key: "uid",
              pageUrl: endpointUrl,
              redirectChainProvenance: "retained_redirect_chain",
              repeatedAcrossEtlds: ["adnxs.com", "yahoo.com"],
              requestUrlRedacted: "https://ib.adnxs.com/prebid/setuid?uid=%5Bredacted%5D",
              valueHash: "a".repeat(64),
              valueLength: 24
            }),
            JSON.stringify({
              classificationReason: "identifier_query_redirect_chain",
              destinationClassification: "rtb_identity",
              destinationDomain: "pbs.yahoo.com",
              destinationEtldPlusOne: "yahoo.com",
              entropyScore: 3.5,
              identifierClass: "durable_id",
              key: "uid",
              pageUrl: endpointUrl,
              redirectChainProvenance: "retained_redirect_chain",
              repeatedAcrossEtlds: ["adnxs.com", "yahoo.com"],
              requestUrlRedacted: endpointUrl,
              valueHash: "b".repeat(64),
              valueLength: 22
            }),
            JSON.stringify({
              classificationReason: "identifier_query_redirect_chain",
              destinationClassification: "advertising",
              destinationDomain: "aax-eu.amazon-adsystem.com",
              destinationEtldPlusOne: "amazon-adsystem.com",
              entropyScore: 3.1,
              identifierClass: "partner_id",
              key: "pid",
              pageUrl: endpointUrl,
              repeatedAcrossEtlds: ["amazon-adsystem.com", "rlcdn.com"],
              requestUrlRedacted: "https://aax-eu.amazon-adsystem.com/s/dcm?pid=%5Bredacted%5D",
              valueHash: "c".repeat(64),
              valueLength: 20
            }),
            JSON.stringify({
              classificationReason: "identifier_query_redirect_chain",
              destinationClassification: "identity_graph",
              destinationDomain: "id.rlcdn.com",
              destinationEtldPlusOne: "rlcdn.com",
              entropyScore: 3.6,
              identifierClass: "partner_id",
              key: "partner_uid",
              pageUrl: endpointUrl,
              repeatedAcrossEtlds: ["amazon-adsystem.com", "rlcdn.com"],
              requestUrlRedacted: "https://id.rlcdn.com/464246.gif?partner_uid=%5Bredacted%5D",
              valueHash: "d".repeat(64),
              valueLength: 26
            })
          ]
        },
        fetchQuality: null,
        flags: ["direct_runtime"],
        pageUrls: ["https://www.nbcnews.com/", endpointUrl],
        snippets: [],
        sourceUrls: [endpointUrl]
      },
      primaryPageUrl: endpointUrl,
      sourceUrl: endpointUrl,
      severity: "high",
      summary: "Identifier-like values were observed in retained identity-sync request evidence."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "cross_domain_identifier_sharing_observed");

  assert.ok(finding);
  assert.ok(projection.topFindings.some((entry) => entry.id === "cross_domain_identifier_sharing_observed"));
  assert.equal(finding.evidenceDetails?.scanContext?.pageUrl, "https://www.nbcnews.com/");
  assert.equal(finding.evidenceDetails?.counts?.crossDomainIdentifierEvidenceRows, 4);
  assert.deepEqual(finding.evidenceDetails?.trackingEvidence?.identifierKeys, ["uid", "pid", "partner_uid"]);
  assert.ok(finding.evidenceDetails?.runtimeRequestUrls?.some((url) => url.includes("pbs.yahoo.com/setuid")));
  assert.ok(finding.evidenceDetails?.representativeRequests?.some((request) => request.url.includes("ib.adnxs.com/prebid/setuid")));
  assert.notEqual(finding.evidenceDetails?.scanContext?.pageUrl, endpointUrl);
});

test("projects policy runtime conflicts with compact canonical evidence references", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("consent_gated_tracking_claim_conflict", {
      confidenceBand: "high",
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["policy_text", "direct_runtime", "structured_validation"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: [],
        originTypes: ["validation_rule"],
        promotionEligibilities: ["eligible"]
      },
      details: {
        family: "contradiction",
        kind: "consent_gated_tracking_claim_conflict",
        claim: "The policy surface describes cookie, tracking, or privacy-choice controls available to visitors.",
        contradictionBasis:
          "The policy and consent surfaces describe visitor choice controls, but non-essential marketing requests were observed before a visitor choice was completed.",
        policyClaimType: "cookie_preferences_available",
        runtimeObservationType: "marketing_vendor_fired_pre_consent",
	        runtimePhase: "pre_consent",
	        bridgeGeneratedBy: "wc01.test",
	        bridgeMappingType: "deterministic_policy_runtime_mapping",
	        bridgeMappingVersion: "policy_behavior_conflict_map:v1",
	        bridgeRuleId: "test.policy_behavior_cookie_preferences_preconsent_v1",
	        conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
        conflictBridgeReasoning:
          "Choice-control policy evidence is paired with concrete pre-consent runtime request URLs and attributed non-essential vendors.",
        conflictSupportsPromotion: true,
        contradictionReviewStatus: "complete",
        contradictionPromotionEligible: true,
	        policySnippet:
	          "Cookie notice says visitors can manage cookie preferences and choose whether analytics and marketing cookies are enabled.",
	        policySourceUrl: "https://privacy.klaviyo.com/policies/?name=klaviyo-cookie-notice",
	        policyAnchorRef: "policy:klaviyo-cookie-notice#settings",
	        runtimeAnchorRef: "request:https://js.hs-scripts.com/48163345.js",
	        runtimeEvidenceArtifacts: [
          "https://js.hs-scripts.com/48163345.js",
          "https://static-tracking.klaviyo.com/onsite/js/example.js"
        ],
	        sourceEvidenceIds: [
	          "policy:klaviyo-cookie-notice#settings",
	          "request:https://js.hs-scripts.com/48163345.js"
	        ],
	        vendors: ["HubSpot", "Klaviyo"]
      },
      evidence: {
        entities: {
          runtimeRequestUrls: [
            "https://js.hs-scripts.com/48163345.js",
            "https://static-tracking.klaviyo.com/onsite/js/example.js"
          ],
          runtimeVendors: ["HubSpot", "Klaviyo"]
        },
        fetchQuality: null,
        flags: ["policy_runtime.consent_gated_tracking_claim_conflict"],
        pageUrls: ["https://privacy.klaviyo.com/policies/?name=klaviyo-cookie-notice"],
        snippets: [
          "Cookie notice says visitors can manage cookie preferences and choose whether analytics and marketing cookies are enabled.",
          "Choice-control policy evidence is paired with concrete pre-consent runtime request URLs and attributed non-essential vendors."
        ],
        sourceUrls: [
          "https://privacy.klaviyo.com/policies/?name=klaviyo-cookie-notice",
          "https://js.hs-scripts.com/48163345.js"
        ]
      },
      sourceRefs: [
        {
          kind: "validation",
          ruleKey: "runtime_privacy.consent_gated_tracking_claim_conflict",
          title: "Consent-gated tracking claim conflicts with runtime behavior"
        }
      ],
      severity: "high",
      summary: "Policy and runtime behavior conflict."
    })
  ]);

  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");
  const compact = finding?.evidenceDetails?.policyRuntimeConflict;
  assert.equal(compact?.policyAnchor.claimType, "cookie_preferences_available");
  assert.equal(compact?.policyAnchor.sourceUrl, "https://privacy.klaviyo.com/policies/?name=klaviyo-cookie-notice");
  assert.equal(compact?.runtimeAnchor.observationType, "marketing_vendor_fired_pre_consent");
  assert.deepEqual(compact?.runtimeAnchor.requestUrls, [
    "https://js.hs-scripts.com/48163345.js",
    "https://static-tracking.klaviyo.com/onsite/js/example.js"
  ]);
  assert.deepEqual(compact?.runtimeAnchor.vendors, ["HubSpot", "Klaviyo"]);
  assert.equal(compact?.conflictBridge.supportsPromotion, true);
  assert.equal(compact?.evidenceSufficiency.reviewStatus, "complete");
  assert.equal(compact?.evidenceSufficiency.promotionEligible, true);
  assert.deepEqual(compact?.references.validationRuleKeys, [
    "runtime_privacy.consent_gated_tracking_claim_conflict"
  ]);
});

test("policy runtime contradiction with full anchors renders as strong self-proving evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([makePolicyRuntimeConflictPacket()]);
  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.ok(finding);
  assert.equal(finding.label, "Policy/runtime behavior conflict");
  assert.equal(finding.severity, "high");
  assert.equal(finding.confidence, "strong");
  assert.equal(finding.evidenceDetails?.policyEvidence?.evaluated, true);
  assert.equal(finding.evidenceDetails?.policyRuntimeConflict?.policyAnchor.sourceUrl, "https://example.com/privacy");
  assert.equal(finding.evidenceDetails?.policyRuntimeConflict?.runtimeAnchor.firstSeenMs, 640);
  assert.match(finding.shortSummary, /Public disclosures describe cookie, device, or third-party data collection/);
  assert.match(finding.shortSummary, /runtime evidence observed Meta Pixel at connect\.facebook\.net fired at 640ms before consent interaction/);
  assert.match(finding.shortSummary, /Review whether the implementation, consent flow, and disclosures align/);
  assert.deepEqual(finding.evidencePreview, [
    'Policy claim: "We use optional analytics and advertising cookies only after you set cookie preferences or consent."',
    "Policy source: https://example.com/privacy",
    "Runtime event: Meta Pixel at connect.facebook.net fired at 640ms before consent interaction.",
    "Bridge: Cookie preference policy evidence is paired with concrete pre-consent tracker request evidence."
  ]);
});

test("generic policy runtime alignment review bridge remains audit-only in executive projection", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket(
      { unifiedFindingId: "policy_behavior_conflict" },
      {
        bridgeMappingType: "deterministic_policy_runtime_review_mapping",
        conflictBridgeReasoning: "Policy disclosure anchor and concrete runtime behavior indicate a policy/runtime alignment review area.",
        conflictSupportsPromotion: false,
        conflictType: null,
        contradictionPromotionEligible: false,
        kind: "policy_behavior_conflict"
      }
    )
  ]);

  assert.equal(
    projection.findings.some((item) => item.id === "policy_behavior_contradiction_detected"),
    false
  );
  assert.equal(
    projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"),
    false
  );
});

test("policy runtime alignment from broad disclosure and request volume is not contradiction-promoted", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_behavior_conflict", {
      confidenceBand: "high",
      confidenceInputs: {
        evidenceQualityFlags: [],
        hasConcretePayloadEvidence: false,
        hasCorroboratedPositiveSurfaceEvidence: true,
        hasDirectRuntimeEvidence: true,
        hasKeyPageDiscoveryEvidence: true,
        hasMultipleHumanFacingUrls: false,
        hasPageAttribution: true,
        hasPacketBackedEvidence: true,
        hasPolicyTextEvidence: true,
        hasReadableSurfaceSnippetEvidence: true,
        hasStructuredValidationEvidence: true,
        isFallbackOnly: false,
        issueCount: 0,
        signalCount: 1,
        sourceCount: 2,
        sourceKinds: ["signal"],
        validationCount: 0
      },
      details: {
        family: "contradiction",
        kind: "policy_behavior_conflict"
      },
      evidence: {
        counts: {
          thirdPartyCookieCount: 88,
          thirdPartyRequestCount: 488,
          thirdPartyRequestDomainCount: 112
        },
        entities: {
          policyEvidence: [
            JSON.stringify({
              evaluated: true,
              cookieOrPrivacyPolicyFound: true,
              relevantDisclosureFound: true,
              disclosureGapObserved: false
            })
          ],
          runtimeDomains: ["gum.criteo.com", "aax-eu.amazon-adsystem.com"],
          runtimeVendors: ["Criteo", "Amazon Ads"]
        },
        fetchQuality: null,
        flags: ["policy_runtime_alignment_review_signal"],
        pageUrls: ["https://www.nbcnews.com/"],
        snippets: ["Public privacy disclosures were evaluated."],
        sourceUrls: ["https://www.nbcnews.com/privacy"]
      },
      primaryPageUrl: "https://www.nbcnews.com/",
      severity: "high",
      summary: "Runtime third-party request volume was high."
    })
  ]);

  assert.equal(
    projection.findings.some((item) => item.id === "policy_behavior_contradiction_detected"),
    false
  );
  assert.equal(
    projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"),
    false
  );
});

test("generic policy runtime alignment review with no runtime anchor is not projected when retained policy evidence found no disclosure gap", () => {
  const retainedNoGapPolicyEvidence = JSON.stringify({
    evaluated: true,
    cookieOrPrivacyPolicyFound: true,
    relevantDisclosureFound: true,
    disclosureGapObserved: false
  });
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket(
      { unifiedFindingId: "policy_behavior_conflict" },
      {
        bridgeMappingType: "deterministic_policy_runtime_review_mapping",
        conflictBridgeReasoning: "Policy disclosure anchor and concrete runtime behavior indicate a policy/runtime alignment review area.",
        conflictSupportsPromotion: false,
        conflictType: null,
        contradictionPromotionEligible: false,
        kind: "policy_behavior_conflict",
        runtimeEvidenceArtifacts: [],
        runtimeObservationType: null,
        vendors: []
      },
      { policyEvidence: [retainedNoGapPolicyEvidence], runtimeRequestUrls: [], runtimeVendors: [] }
    )
  ]);

  assert.equal(
    projection.findings.some((item) => item.id === "policy_behavior_contradiction_detected"),
    false
  );
  assert.equal(
    projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"),
    false
  );
});

test("policy runtime disclosure mismatch promotes only with retained unmatched evidence and rationale", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_behavior_conflict", {
      confidenceBand: "high",
      confidenceInputs: {
        evidenceQualityFlags: [],
        hasConcretePayloadEvidence: false,
        hasCorroboratedPositiveSurfaceEvidence: true,
        hasDirectRuntimeEvidence: true,
        hasKeyPageDiscoveryEvidence: true,
        hasMultipleHumanFacingUrls: false,
        hasPageAttribution: true,
        hasPacketBackedEvidence: true,
        hasPolicyTextEvidence: true,
        hasReadableSurfaceSnippetEvidence: true,
        hasStructuredValidationEvidence: true,
        isFallbackOnly: false,
        issueCount: 0,
        signalCount: 1,
        sourceCount: 2,
        sourceKinds: ["signal"],
        validationCount: 0
      },
      details: {
        family: "contradiction",
        kind: "policy_behavior_conflict"
      },
      evidence: {
        counts: {},
        entities: {
          policyEvidence: [
            JSON.stringify({
              evaluated: true,
              cookieOrPrivacyPolicyFound: true,
              relevantDisclosureFound: true,
              disclosureGapObserved: true
            })
          ],
          runtimeVendorDisclosureEvidence: [
            JSON.stringify({
              subtype: "runtime_vendor_not_disclosed",
              observedRuntimeVendors: ["Criteo", "Amazon Ads"],
              observedRuntimeDomains: ["gum.criteo.com", "aax-eu.amazon-adsystem.com"],
              unmatchedRuntimeVendors: ["Criteo"],
              unmatchedRuntimeDomains: ["gum.criteo.com"],
              policySurfacesSearched: [
                {
                  type: "privacy_policy",
                  url: "https://www.example.com/privacy",
                  snippet: "We list advertising and analytics partners in our privacy policy.",
                  reached: true,
                  searchedTerms: ["Criteo"],
                  matchedVendorNames: ["Amazon Ads"],
                  unmatchedVendorNames: ["Criteo"]
                }
              ],
              matchedVendorDisclosureCount: 1,
              unmatchedVendorDisclosureCount: 1,
              mismatchRationale: "Criteo runtime request evidence was retained, but the reached privacy policy surface did not disclose Criteo or its domain in the retained comparison.",
              coverageStatus: "usable",
              evidenceConfidence: "strong",
              directVsInferred: "direct",
              parentFindingId: "policy_behavior_conflict"
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.example.com/"],
        snippets: [],
        sourceUrls: ["https://www.example.com/privacy", "https://gum.criteo.com/sync"]
      },
      primaryPageUrl: "https://www.example.com/",
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.ok(finding);
  assert.equal(finding.label, "Policy/runtime alignment review");
  assert.equal(finding.confidence, "good");
  assert.equal(finding.severity, "medium");
  assert.match(finding.shortSummary, /Criteo/);
  assert.match(finding.shortSummary, /not clearly reflected/);
  assert.ok(projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"));
});

test("policy runtime disclosure mismatch downgrades when disclosureGapObserved is false", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_behavior_conflict", {
      confidenceBand: "high",
      confidenceInputs: {
        evidenceQualityFlags: [],
        hasConcretePayloadEvidence: false,
        hasCorroboratedPositiveSurfaceEvidence: true,
        hasDirectRuntimeEvidence: true,
        hasKeyPageDiscoveryEvidence: true,
        hasMultipleHumanFacingUrls: false,
        hasPageAttribution: true,
        hasPacketBackedEvidence: true,
        hasPolicyTextEvidence: true,
        hasReadableSurfaceSnippetEvidence: true,
        hasStructuredValidationEvidence: true,
        isFallbackOnly: false,
        issueCount: 0,
        signalCount: 1,
        sourceCount: 2,
        sourceKinds: ["signal"],
        validationCount: 0
      },
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      evidence: {
        counts: {},
        entities: {
          policyEvidence: [
            JSON.stringify({
              evaluated: true,
              cookieOrPrivacyPolicyFound: true,
              relevantDisclosureFound: true,
              disclosureGapObserved: false
            })
          ],
          runtimeVendorDisclosureEvidence: [
            JSON.stringify({
              subtype: "runtime_vendor_not_disclosed",
              observedRuntimeVendors: ["Criteo"],
              observedRuntimeDomains: ["gum.criteo.com"],
              unmatchedRuntimeVendors: ["Criteo"],
              unmatchedRuntimeDomains: ["gum.criteo.com"],
              policySurfacesSearched: [
                {
                  type: "privacy_policy",
                  url: "https://www.example.com/privacy",
                  snippet: "We disclose advertising and analytics partners.",
                  reached: true,
                  searchedTerms: ["Criteo", "gum.criteo.com"],
                  unmatchedVendorNames: ["Criteo"]
                }
              ],
              unmatchedVendorDisclosureCount: 1,
              mismatchRationale: "Criteo was searched against the retained policy surface.",
              coverageStatus: "usable",
              evidenceConfidence: "strong",
              directVsInferred: "direct",
              parentFindingId: "policy_behavior_conflict"
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.example.com/"],
        snippets: ["We disclose advertising and analytics partners."],
        sourceUrls: ["https://www.example.com/privacy", "https://gum.criteo.com/sync"]
      },
      primaryPageUrl: "https://www.example.com/",
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");
  assert.ok(finding);
  assert.equal(finding.label, "Runtime vendor disclosure specificity review");
  assert.equal(finding.confidence, "moderate");
  assert.equal(finding.directVsInferred, "inferred");
  assert.doesNotMatch(finding.shortSummary, /not clearly reflected/i);
  assert.equal(projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"), false);
});

test("policy runtime summary does not overstate unmatched vendors without retained disclosure comparison evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_behavior_conflict", {
      confidenceBand: "high",
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      evidence: {
        counts: {},
        entities: {
          runtimeVendorDisclosureEvidence: [
            JSON.stringify({
              subtype: "runtime_vendor_not_disclosed",
              observedRuntimeVendors: ["Criteo"],
              observedRuntimeDomains: ["gum.criteo.com"],
              unmatchedRuntimeVendors: [],
              unmatchedRuntimeDomains: [],
              policySurfacesSearched: [{ type: "privacy_policy", url: "https://www.example.com/privacy", reached: true }],
              matchedVendorDisclosureCount: 0,
              unmatchedVendorDisclosureCount: 0,
              mismatchRationale: "",
              coverageStatus: "usable",
              evidenceConfidence: "strong",
              directVsInferred: "direct",
              parentFindingId: "policy_behavior_conflict"
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.example.com/"],
        snippets: [],
        sourceUrls: ["https://www.example.com/privacy"]
      },
      primaryPageUrl: "https://www.example.com/",
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.equal(finding, undefined);
  assert.equal(
    projection.findings.some((item) => /not clearly reflected/i.test(item.shortSummary)),
    false
  );
});

test("policy runtime vendor mismatch does not promote without retained policy snippet and search match evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_behavior_conflict", {
      confidenceBand: "high",
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      evidence: {
        counts: {},
        entities: {
          runtimeVendorDisclosureEvidence: [
            JSON.stringify({
              subtype: "runtime_vendor_not_disclosed",
              observedRuntimeVendors: ["Criteo"],
              observedRuntimeDomains: ["gum.criteo.com"],
              unmatchedRuntimeVendors: ["Criteo"],
              unmatchedRuntimeDomains: ["gum.criteo.com"],
              policySurfacesSearched: [
                {
                  type: "privacy_policy",
                  url: "https://www.example.com/privacy",
                  reached: true,
                  searchedTerms: ["Criteo"]
                }
              ],
              unmatchedVendorDisclosureCount: 1,
              mismatchRationale: "Criteo was not found.",
              coverageStatus: "usable",
              evidenceConfidence: "strong",
              directVsInferred: "direct",
              parentFindingId: "policy_behavior_conflict"
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.example.com/"],
        snippets: [],
        sourceUrls: ["https://www.example.com/privacy"]
      },
      primaryPageUrl: "https://www.example.com/",
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");
  assert.equal(finding, undefined);
});

test("NBCUniversal-style broad relevant disclosures do not become contradiction top finding", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_behavior_conflict", {
      confidenceBand: "high",
      confidenceInputs: {
        evidenceQualityFlags: [],
        hasConcretePayloadEvidence: false,
        hasCorroboratedPositiveSurfaceEvidence: true,
        hasDirectRuntimeEvidence: true,
        hasKeyPageDiscoveryEvidence: true,
        hasMultipleHumanFacingUrls: false,
        hasPageAttribution: true,
        hasPacketBackedEvidence: true,
        hasPolicyTextEvidence: true,
        hasReadableSurfaceSnippetEvidence: true,
        hasStructuredValidationEvidence: true,
        isFallbackOnly: false,
        issueCount: 0,
        signalCount: 1,
        sourceCount: 3,
        sourceKinds: ["signal"],
        validationCount: 0
      },
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      evidence: {
        counts: {
          thirdPartyCookieCount: 24,
          thirdPartyRequestCount: 312,
          thirdPartyRequestDomainCount: 87
        },
        entities: {
          policyEvidence: [
            JSON.stringify({
              evaluated: true,
              cookieOrPrivacyPolicyFound: true,
              relevantDisclosureFound: true,
              disclosureGapObserved: false,
              policyUrl: "https://www.nbcuniversal.com/privacy/cookies",
              snippet:
                "We and our vendors, advertisers, analytics providers, and other partners use cookies and similar technologies for advertising, analytics, and targeted advertising."
            })
          ],
          runtimeDomains: ["gum.criteo.com", "ib.adnxs.com", "aax-eu.amazon-adsystem.com"],
          runtimeRequestUrls: [
            "https://gum.criteo.com/sync",
            "https://ib.adnxs.com/setuid",
            "https://aax-eu.amazon-adsystem.com/s/dcm"
          ],
          runtimeVendors: ["Criteo", "AppNexus", "Amazon Ads"]
        },
        fetchQuality: null,
        flags: ["policy_runtime_alignment_review_signal"],
        pageUrls: ["https://www.nbcnews.com/"],
        snippets: [
          "We and our vendors, advertisers, analytics providers, and other partners use cookies and similar technologies for advertising, analytics, and targeted advertising."
        ],
        sourceUrls: ["https://www.nbcuniversal.com/privacy/cookies"]
      },
      primaryPageUrl: "https://www.nbcnews.com/",
      severity: "high",
      summary: "Runtime third-party vendors were observed with broad retained disclosure context."
    })
  ]);

  assert.equal(projection.findings.some((item) => item.id === "policy_behavior_contradiction_detected"), false);
  assert.equal(projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"), false);
});

test("specific policy runtime contradiction still projects when a retained no-gap disclosure review is present", () => {
  const retainedNoGapPolicyEvidence = JSON.stringify({
    evaluated: true,
    cookieOrPrivacyPolicyFound: true,
    relevantDisclosureFound: true,
    disclosureGapObserved: false
  });
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket({}, {}, { policyEvidence: [retainedNoGapPolicyEvidence] })
  ]);
  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.ok(finding);
  assert.equal(finding.label, "Policy/runtime behavior conflict");
  assert.ok(projection.topFindings.some((item) => item.id === "policy_behavior_contradiction_detected"));
});

test("policy runtime contradiction missing policy snippet is not projected", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket({}, { policySnippet: null }, { policyConfidence: 0.8 })
  ]);
  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.equal(finding, undefined);
});

test("policy runtime contradiction missing policy URL is not projected", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket({}, { policySourceUrl: null })
  ]);
  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.equal(finding, undefined);
});

test("policy runtime contradiction missing timing and consent phase is not projected", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket(
      {},
      { runtimePhase: null },
      {
        runtimeBehaviorArtifacts: [
          {
            artifactType: "request",
            host: "connect.facebook.net",
            id: "request:https://connect.facebook.net/en_US/fbevents.js",
            phase: "unknown",
            timestampMs: null,
            url: "https://connect.facebook.net/en_US/fbevents.js",
            vendor: "Meta Pixel"
          }
        ]
      }
    )
  ]);
  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.equal(finding, undefined);
});

test("policy runtime contradiction without retained matching runtime phase is not projected", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket(
      {},
      { runtimePhase: null },
      {
        runtimeBehaviorArtifacts: [
          {
            artifactType: "request",
            host: "connect.facebook.net",
            id: "request:https://connect.facebook.net/en_US/fbevents.js",
            phase: "unknown",
            timestampMs: 640,
            url: "https://connect.facebook.net/en_US/fbevents.js",
            vendor: "Meta Pixel"
          }
        ]
      }
    )
  ]);
  const finding = projection.findings.find((item) => item.id === "policy_behavior_contradiction_detected");

  assert.equal(finding, undefined);
});

test("projects confirmed cookie disclosure gaps into executive and privacy regulatory lenses", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("cookie_disclosure_gap", {
      confidenceBand: "high",
      details: {
        family: "rights_gap",
        kind: "cookie_disclosure_gap"
      },
      evidence: {
        counts: {
          unmatched_third_party_cookie_count: 1
        },
        entities: {
          runtime_cookie_names: ["_ga", "_fbp"],
          unmatched_cookie_categories: ["advertising"],
          unmatched_cookie_names: ["_fbp"],
          unmatched_runtime_cookies: [
            JSON.stringify({
              category: "advertising",
              cookieName: "_fbp",
              domain: ".example.com",
              party: "third_party"
            })
          ]
        },
        fetchQuality: null,
        flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
        pageUrls: ["https://example.com/legal/cookie-policy"],
        snippets: ["The retained cookie policy disclosed analytics cookies, but not the observed Meta advertising cookie."],
        sourceUrls: ["https://example.com/legal/cookie-policy"]
      },
      severity: "high",
      summary: "Runtime cookie activity was not covered by the retained cookie policy."
    })
  ]);

  assert.ok(projection.findings.some((entry) => entry.id === "cookie_disclosure_gap"));
  assert.ok(projection.topFindings.some((entry) => entry.id === "cookie_disclosure_gap"));

  const lenses = buildRegulatoryLenses(projection.findings, {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 1
  });
  assert.ok(lenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((entry) => entry.id === "cookie_disclosure_gap"));
  assert.ok(lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA")?.findings.some((entry) => entry.id === "cookie_disclosure_gap"));
  assert.ok(lenses.find((lens) => lens.acronym === "FTC")?.findings.some((entry) => entry.id === "cookie_disclosure_gap"));
});

test("keeps confirmed cookie disclosure gaps in top findings alongside higher-ranked homepage issues", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Trackers fired before consent interaction."
    }),
    makePacket("policy_behavior_conflict", {
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      severity: "high",
      summary: "Observed runtime behavior appears to conflict with policy representations."
    }),
    makePacket("visual_contrast_accessibility_issue", {
      confidenceBand: "high",
      details: { family: "accessibility", kind: "visual_contrast_accessibility_issue" },
      severity: "medium",
      summary: "Automated accessibility issues were retained."
    }),
    makePacket("cookie_disclosure_gap", {
      confidenceBand: "high",
      details: { family: "rights_gap", kind: "cookie_disclosure_gap" },
      evidence: {
        counts: {
          unmatched_third_party_cookie_count: 20
        },
        entities: {
          runtime_cookie_names: ["demdex", "mbox"],
          unmatched_cookie_names: ["demdex", "mbox"]
        },
        fetchQuality: null,
        flags: ["disclosureMismatchExplained", "negativeDisclosureSearchPerformed"],
        pageUrls: ["https://example.com/cookie-policy"],
        snippets: ["Runtime cookies were not covered by the retained cookie policy."],
        sourceUrls: ["https://example.com/cookie-policy"]
      },
      severity: "high",
      summary: "Runtime cookie activity was not covered by the retained cookie policy."
    })
  ]);

  const topFindingIds = projection.topFindings.map((finding) => finding.id);
  assert.ok(topFindingIds.includes("cookie_disclosure_gap"));
  assert.equal(projection.trace.packets.find((packet) => packet.unifiedFindingId === "cookie_disclosure_gap")?.inTopFindings, true);
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
  assert.ok(finding?.evidenceDetails?.evidenceFlags?.includes("nonessential_vendor_persisted_after_reject"));
  assert.equal(finding?.evidenceVersion, "1.1");
  assert.equal(finding?.evidenceDetails?.postRejectEvidence?.trackingPersistedAfterReject, true);
  assert.deepEqual(finding?.evidenceDetails?.rejectSuppressionOutcome, {
    firstPostRejectNonEssentialRequestMs: 842,
    interpretation: "At least one classified non-essential vendor still fired after reject.",
    nonEssentialVendorsPersistedAfterReject: true,
    overallTrackingReducedAfterReject: false,
    persistingNonEssentialVendors: ["Google Ads", "Adobe Analytics"],
    postRejectNonEssentialRequestCount: 1
  });
  assert.equal(finding?.evidenceDetails?.rejectInteraction?.action_type, "reject_all");
  assert.deepEqual(finding?.evidenceDetails?.policyEvidence, { evaluated: false });
  assert.equal(finding?.evidenceDetails?.consentInteraction?.action_type, "reject_all");
  assert.equal(finding?.evidenceDetails?.postRejectNonEssentialRequests?.[0]?.ms_after_reject, 842);
  assert.equal(finding?.evidenceDetails?.suppressionChecks?.reject_click_confirmed, true);
  assert.equal(projection.trace.packets[0]?.executiveFindingId, "reject_tracking_persists_after_reject");
  assert.equal(projection.trace.packets[0]?.inRegulatoryLensInput, true);
});

test("projects confirmed reject-path tracking into top findings and regulatory lenses with clean vendor copy", () => {
  const packet = makePacket("reject_did_not_reduce_tracking", {
    confidenceBand: "high",
    details: {
      family: "consent_tracking",
      kind: "reject_did_not_reduce_tracking",
      requestUrls: ["https://securepubads.g.doubleclick.net/pagead/adview"],
      vendors: ["Google Ads"]
    },
    evidence: {
      counts: {
        consentOptOutClicks: 1
      },
      entities: {
        postRejectNonEssentialRequests: [
          JSON.stringify({
            vendor: "Google Ads",
            hostname: "securepubads.g.doubleclick.net",
            category: "advertising",
            url: "https://securepubads.g.doubleclick.net/pagead/adview",
            ts_ms: 1708,
            ms_after_reject: 708
          })
        ],
        post_reject_tracker_vendors: ["Google Ads"],
        vendorClassifications: [
          JSON.stringify({
            reason: "Google Ads is classified as advertising tracking/measurement rather than essential site operation.",
            vendor: "Google Ads",
            category: "advertising",
            hostname: "securepubads.g.doubleclick.net"
          })
        ]
      },
      fetchQuality: null,
      flags: ["reject_did_not_reduce_tracking", "reject_evidence_confirmed"],
      pageUrls: ["https://example.com/"],
      snippets: ["Reject flow retained tracking after opt-out."],
      sourceUrls: ["https://securepubads.g.doubleclick.net/pagead/adview"]
    },
    severity: "high",
    summary: "The consent audit completed a reject interaction, but these tracker vendors still remained after rejection: Google Ads."
  });
  const projection = projectExecutiveFindingsFromUnifiedPackets([packet]);
  const finding = projection.findings.find((entry) => entry.id === "reject_tracking_persists_after_reject");
  const lenses = buildRegulatoryLensesFromUnifiedPackets([packet], {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 0
  });
  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.ok(finding);
  assert.equal(finding?.shortSummary, "Non-essential tracking requests fired after the reject interaction for Google Ads.");
  assert.ok(!finding?.shortSummary.includes("{"));
  assert.ok(projection.topFindings.some((entry) => entry.id === "reject_tracking_persists_after_reject"));
  assert.equal(projection.trace.packets[0]?.inRegulatoryLensInput, true);
  assert.ok(gdprLens?.findings.some((entry) => entry.id === "reject_tracking_persists_after_reject"));
  assert.equal(cpraLens?.findings.some((entry) => entry.id === "reject_tracking_persists_after_reject"), false);
  assert.ok(ftcLens?.findings.some((entry) => entry.id === "reject_tracking_persists_after_reject"));
});

test("keeps confirmed reject-path tracking in top findings alongside pre-consent and session replay", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("session_replay_observed", {
      confidenceBand: "moderate",
      details: { family: "consent_tracking", kind: "session_replay_observed" },
      severity: "high",
      summary: "Session replay was observed."
    }),
    makePacket("reject_did_not_reduce_tracking", {
      confidenceBand: "high",
      details: {
        family: "consent_tracking",
        kind: "reject_did_not_reduce_tracking",
        vendors: ["Google Ads"]
      },
      evidence: {
        entities: {
          postRejectNonEssentialRequests: [
            JSON.stringify({
              vendor: "Google Ads",
              hostname: "securepubads.g.doubleclick.net",
              category: "advertising",
              ms_after_reject: 1226
            })
          ],
          post_reject_tracker_vendors: ["Google Ads"]
        },
        fetchQuality: null,
        flags: ["reject_did_not_reduce_tracking", "reject_evidence_confirmed"],
        pageUrls: ["https://example.com/"],
        snippets: ["Reject flow retained tracking after opt-out."],
        sourceUrls: ["https://securepubads.g.doubleclick.net/pagead/adview"]
      },
      severity: "high",
      summary: "Tracking requests still appeared after the reject interaction."
    }),
    makePacket("visual_contrast_accessibility_issue", {
      confidenceBand: "high",
      details: { family: "accessibility", kind: "visual_contrast_accessibility_issue" },
      severity: "high",
      summary: "Automated accessibility issues observed."
    })
  ]);

  assert.ok(projection.topFindings.some((entry) => entry.id === "pre_consent_tracking_detected"));
  assert.ok(projection.topFindings.some((entry) => entry.id === "session_recording_services_detected"));
  assert.ok(projection.topFindings.some((entry) => entry.id === "reject_tracking_persists_after_reject"));
});

test("suppresses reject-path tracking projection when post-reject timing is missing", () => {
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

  assert.ok(!projection.findings.some((entry) => entry.id === "reject_tracking_persists_after_reject"));
  assert.equal(projection.trace.packets[0]?.executiveFindingId, null);
  assert.equal(projection.trace.packets[0]?.inTopFindings, false);
});

test("does not project retired scanner-level financial promotion into executive findings", () => {
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

  assert.equal(projection.findings.some((finding) => finding.id === "leveraged_or_high_risk_product_promotion"), false);
  assert.equal(projection.topFindings.some((finding) => finding.id === "leveraged_or_high_risk_product_promotion"), false);
});

test("does not project retired financial companion findings into executive findings", () => {
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
    projection.findings
      .map((finding) => finding.id)
      .filter((id) =>
        [
          "guaranteed_outcome_claim_detected",
          "regulatory_registration_disclosure_absent",
          "unsubstantiated_testimonial_near_performance_claim"
        ].includes(id)
      ),
    []
  );
  assert.deepEqual(
    projection.topFindings
      .map((finding) => finding.id)
      .filter((id) =>
        [
          "guaranteed_outcome_claim_detected",
          "regulatory_registration_disclosure_absent",
          "unsubstantiated_testimonial_near_performance_claim"
        ].includes(id)
      ),
    []
  );
});

test("projects concrete sportsbook offer evidence into high-risk disclosure finding", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("high_risk_product_risk_disclosure_missing", {
      details: { family: "financial_promotion", kind: "high_risk_product_risk_disclosure_missing" },
      evidence: {
        counts: {},
        entities: {
          offerSnippets: ["Get $1,000 in bonus bets when you sign up."],
          primaryOfferSnippet: ["Get $1,000 in bonus bets when you sign up."],
          responsibleGamblingDisclosureAdjacent: ["false"],
          termsDisclosureAdjacent: ["false"]
        },
        fetchQuality: null,
        flags: ["financial.high_risk_product_risk_disclosure_missing"],
        pageUrls: ["https://example.com/sportsbook"],
        snippets: ["Get $1,000 in bonus bets when you sign up."],
        sourceUrls: ["https://example.com/sportsbook"]
      },
      summary: "Sportsbook offer language was observed."
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "high_risk_product_risk_disclosure_missing");

  assert.ok(finding);
  assert.deepEqual(finding?.evidenceDetails?.offerSnippets, ["Get $1,000 in bonus bets when you sign up."]);
  assert.ok(finding?.evidenceDetails?.disclosureFindings?.includes("Clear adjacent disclosure evidence was not retained with the offer snippet."));
});

test("does not project retired concrete sportsbook offer evidence into high-risk promotion finding", () => {
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

  assert.equal(projection.findings.some((finding) => finding.id === "leveraged_or_high_risk_product_promotion"), false);
});

test("projects active financial companion findings into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("guaranteed_or_high_return_claims_present", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "guaranteed_or_high_return_claims_present" },
      severity: "high",
      summary: "High return language surfaced."
    }),
    makePacket("performance_claims_without_context", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "performance_claims_without_context" },
      severity: "high",
      summary: "Performance claim appeared without context."
    }),
    makePacket("high_risk_product_risk_disclosure_missing", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "high_risk_product_risk_disclosure_missing" },
      severity: "high",
      summary: "High-risk product disclosure was not retained."
    }),
  ]);

  assert.deepEqual(
    projection.findings.map((finding) => finding.id).sort(),
    [
      "guaranteed_or_high_return_claims_present",
      "high_risk_product_risk_disclosure_missing",
      "performance_claims_without_context"
    ]
  );
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
  assert.equal(projection.topFindings.some((finding) => finding.id === "guaranteed_or_high_return_claims_present"), false);
  assert.equal(projection.topFindings.filter((finding) => finding.section === "Financial & Claims").length, 0);
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
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {
          fingerprintAttributeCategories: ["canvas_webgl", "audio"],
          fingerprintingRuntimeEvidence: [
            JSON.stringify({
              attributeCategories: ["canvas_webgl", "audio"],
              requestUrl: "https://fp.example.test/collect?device_fingerprint=abc",
              tier: 2
            })
          ]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://fp.example.test/collect?device_fingerprint=abc"]
      },
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
      evidence: {
        counts: {},
        entities: {
          consentUiPathEvidence: [
            JSON.stringify({
              acceptClickDepth: 1,
              choiceAsymmetry: "material",
              rejectClickDepth: 2,
              visualHierarchyScore: 2
            })
          ]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
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
      summary: "Microsoft Clarity session replay service signals were observed."
    })
  ]);

  const topFindingIds = projection.topFindings.map((finding) => finding.id);
  assert.ok(topFindingIds.includes("session_recording_services_detected"));
  assert.ok(topFindingIds.includes("asymmetric_consent_ui"));
  assert.equal(
    projection.topFindings.find((finding) => finding.id === "session_recording_services_detected")?.shortSummary,
    "Microsoft Clarity session replay service signals were observed during runtime collection."
  );
});

test("keeps uncorroborated tier-2 fingerprinting evidence out of executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2,
          mergedSignalConfidence: 1
        },
        entities: {
          fingerprintAttributeCategories: ["timezone_locale", "storage", "fonts_plugins"],
          fingerprintingSignals: ["timezone_locale", "storage", "fonts_plugins"]
        },
        flags: [],
        pageUrls: [],
        snippets: [
          "Observed coordinated browser or device attribute collection consistent with fingerprinting review risk."
        ],
        sourceUrls: []
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(!projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});

test("projects tier-2 fingerprinting-related telemetry only with corroborating tracking findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          deviceDataLikeRequestCount: 1,
          fingerprintTier: 2,
          mergedSignalConfidence: 1
        },
        entities: {
          fingerprintAttributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
          fingerprintingSignals: ["canvas_webgl", "audio", "fonts_plugins"]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "fingerprinting_related_signals_observed");
  assert.ok(finding);
  assert.equal(finding.label, "Fingerprinting-related signals observed");
  assert.equal(finding.severity, "medium");
  assert.equal(
    finding.shortSummary,
    "Multi-signal browser/device telemetry was retained for fingerprinting review, but retained evidence does not establish identity-oriented fingerprinting."
  );
  assert.equal(
    finding.evidenceDetails?.telemetryEvidence?.basis,
    "Multi-signal browser/device telemetry was retained for fingerprinting review, but identity-oriented fingerprinting was not established."
  );
});

test("keeps fingerprinting-related review wording below probable language", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: { fingerprintTier: 2, mergedSignalConfidence: 1 },
        entities: {
          fingerprintAttributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
          fingerprintingSignals: ["canvas_webgl", "audio", "fonts_plugins"]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.nytimes.com/"],
        snippets: ["Browser/device signals were consistent with likely fingerprinting."],
        sourceUrls: ["https://config.aps.amazon-adsystem.com/configs/3030"]
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);
  const finding = projection.findings.find((entry) => entry.id === "fingerprinting_related_signals_observed");
  const serialized = JSON.stringify(finding);

  assert.ok(finding);
  assert.doesNotMatch(serialized, /likely fingerprinting|probable fingerprinting/i);
  assert.match(serialized, /potential fingerprinting review signal|multi-signal browser\/device telemetry/i);
  assert.match(serialized, /does not establish identity-oriented fingerprinting/i);
});

test("keeps probable fingerprinting wording for strong high-entropy evidence with outbound correlation", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          deviceDataLikeRequestCount: 1,
          fingerprintTier: 2,
          mergedSignalConfidence: 1
        },
        entities: {
          fingerprintAttributeCategories: [
            "audio",
            "canvas_webgl",
            "fonts_plugins",
            "hardware",
            "timezone_locale",
            "storage",
            "input_touch",
            "network_device_state",
            "screen_viewport"
          ],
          fingerprintingRuntimeEvidence: [
            JSON.stringify({
              attributeCategories: ["canvas_webgl", "audio", "fonts_plugins", "hardware"],
              requestUrl: "https://fp.example.test/collect?device_fingerprint=abc",
              tier: 2
            })
          ]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://fp.example.test/collect?device_fingerprint=abc"]
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "probable_fingerprinting");
  assert.ok(finding);
  assert.ok(!projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
  assert.match(finding.shortSummary, /Probable browser\/device fingerprinting behavior was observed/);
  assert.match(finding.shortSummary, /fraud prevention or security/);
  const strongPreview = finding.evidencePreview.find((entry) => entry.startsWith("Stronger retained primitives:")) ?? "";
  assert.match(strongPreview, /canvas\/WebGL access/);
  assert.match(strongPreview, /audio environment access/);
  assert.match(strongPreview, /font\/plugin enumeration/);
  assert.match(strongPreview, /hardware\/device attribute collection/);
  const genericPreview = finding.evidencePreview.find((entry) => entry.startsWith("Additional browser context:")) ?? "";
  assert.match(genericPreview, /timezone\/locale/);
  assert.match(genericPreview, /storage capability/);
  assert.match(genericPreview, /touch\/input capability/);
  assert.match(genericPreview, /network\/device state/);
  assert.match(genericPreview, /screen\/viewport/);
  assert.deepEqual(finding.evidenceDetails?.telemetryEvidence?.strongFingerprintSignals, [
    "audio",
    "canvas_webgl",
    "fonts_plugins",
    "hardware"
  ]);
  assert.deepEqual(finding.evidenceDetails?.telemetryEvidence?.genericFingerprintSignals, [
    "timezone_locale",
    "storage",
    "input_touch",
    "network_device_state",
    "screen_viewport"
  ]);
});

test("annotates tier-2 fingerprinting promoted by known bot-defense vendor evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {
          fingerprintAttributeCategories: [
            "screen_viewport",
            "hardware",
            "storage",
            "fonts_plugins",
            "network_device_state",
            "timezone_locale",
            "input_touch",
            "canvas_webgl"
          ],
          fingerprintingRuntimeEvidence: [
            JSON.stringify({
              host: "client.px-cloud.net",
              requestUrl: "https://client.px-cloud.net/PXXljWHHUe/main.min.js"
            })
          ]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://client.px-cloud.net/PXXljWHHUe/main.min.js"]
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "probable_fingerprinting");
  assert.ok(finding);
  assert.equal(
    finding.evidenceDetails?.telemetryEvidence?.fingerprintPromotionAnnotation,
    "tier_2_runtime_vendor_promoted"
  );
  assert.equal(finding.evidenceDetails?.telemetryEvidence?.fingerprintPurposeFraming, "security_or_bot_defense_possible");
  assert.match(finding.shortSummary, /known bot-defense\/fingerprinting vendor/);
});

test("keeps strong fingerprinting evidence from blocked surfaces below probable wording", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed"],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {
          fingerprintAttributeCategories: [
            "screen_viewport",
            "hardware",
            "storage",
            "fonts_plugins",
            "network_device_state",
            "timezone_locale",
            "input_touch",
            "canvas_webgl"
          ],
          fingerprintingRuntimeEvidence: [
            JSON.stringify({
              host: "client.px-cloud.net",
              requestUrl: "https://client.px-cloud.net/PXXljWHHUe/main.min.js"
            })
          ]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://client.px-cloud.net/PXXljWHHUe/main.min.js"]
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});

test("keeps explicit thin/block-page fingerprinting context below probable wording", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {
          blockPageClassification: ["empty_or_thin_block_page"],
          fingerprintAttributeCategories: [
            "screen_viewport",
            "hardware",
            "storage",
            "fonts_plugins",
            "network_device_state",
            "timezone_locale",
            "input_touch",
            "canvas_webgl"
          ],
          fingerprintingRuntimeEvidence: [
            JSON.stringify({
              host: "client.px-cloud.net",
              requestUrl: "https://client.px-cloud.net/PXXljWHHUe/main.min.js"
            })
          ]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://client.px-cloud.net/PXXljWHHUe/main.min.js"]
      },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});

test("suppresses blocked fingerprinting-related telemetry without retained review context", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed"],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {},
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Bare fingerprinting tier marker observed."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(!projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});

test("keeps canvas-only fingerprinting evidence below probable wording", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {
          fingerprintAttributeCategories: ["canvas_webgl"]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Fingerprinting review signal."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(!projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});

test("keeps Clarity and GTM without strong primitives as generic browser telemetry", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 2
        },
        entities: {
          fingerprintAttributeCategories: ["timezone_locale", "screen_viewport", "storage"],
          runtimeVendors: ["Microsoft Clarity", "Google Tag Manager"]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Browser telemetry observed."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  const finding = projection.findings.find((entry) => entry.id === "fingerprinting_related_signals_observed");
  assert.equal(finding, undefined);
});

test("keeps tier-3 primitive noise below probable fingerprinting without a strong runtime cluster", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: {
          fingerprintTier: 3
        },
        entities: {
          fingerprintAttributeCategories: ["audio", "fonts_plugins", "hardware"]
        },
        flags: [],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Browser primitive noise observed."
    })
  ]);

  assert.ok(!projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
  assert.ok(!projection.findings.some((finding) => finding.id === "fingerprinting_related_signals_observed"));
});

test("projects blocking overlay context without violation framing", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("blocking_overlay_observed", {
      confidenceBand: "moderate",
      details: { family: "context", kind: "blocking_overlay_observed" },
      evidence: {
        counts: {},
        entities: {
          blockingOverlayEvidence: [
            JSON.stringify({
              acceptPresent: true,
              interactionBlocked: true,
              managePresent: true,
              overlayType: "cookie_wall",
              pageAccessBlockedUntilChoice: true,
              rejectDepthClass: "second_layer",
              rejectPresent: false
            })
          ],
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

  assert.equal(projection.findings.some((entry) => entry.id === "blocking_overlay_observed"), false);
  assert.equal(projection.topFindings.some((entry) => entry.id === "blocking_overlay_observed"), false);
  assert.ok(projection.findings.some((entry) => entry.id === "forced_consent_interaction"));
  assert.ok(projection.findings.some((entry) => entry.id === "consent_dark_patterns_detected"));
  assert.ok(projection.findings.some((entry) => entry.id === "reject_option_missing_or_hidden"));
  const forcedConsent = projection.findings.find((entry) => entry.id === "forced_consent_interaction");
  assert.equal(forcedConsent?.section, "Consent Experience");
  assert.ok(!/violation/i.test(`${forcedConsent?.label} ${forcedConsent?.whyItMatters}`));
  assert.equal(projection.topFindings.some((entry) => entry.id === "forced_consent_interaction"), true);
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
          sessionReplayEvidenceSummary: [
            JSON.stringify({
              collectionEndpointObserved: true,
              libraryOnly: false,
              maskingOrExclusionObserved: false,
              sensitiveSurfaceOverlap: false
            })
          ],
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
  assert.equal(finding?.evidenceVersion, "1.1");
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.observed, true);
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.collectionEndpointObserved, true);
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.libraryOnly, false);
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.maskingOrExclusionObserved, false);
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.sensitiveSurfaceOverlap, false);
  assert.equal(finding?.evidenceDetails?.inputSurfaceEvidence?.evaluated, false);
  assert.deepEqual(finding?.evidenceDetails?.policyEvidence, { evaluated: false });
  assert.deepEqual(finding?.evidenceDetails?.runtimeRequestUrls, [
    "https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"
  ]);
  assert.ok(finding?.evidencePreview.includes("Runtime vendor: Qualtrics SiteIntercept"));
  assert.equal(
    finding?.shortSummary,
    "Qualtrics SiteIntercept session replay service signals were observed during runtime collection."
  );
});

test("keeps session replay scan context on audited page and reconciles same-scan preconsent vendor timing", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: {
        family: "consent_tracking",
        kind: "preconsent_tracking",
        vendors: ["Microsoft Clarity"]
      },
      evidence: {
        counts: { firstThirdPartyTrackingRequestMs: 3831 },
        entities: {
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              requestUrl: "https://www.clarity.ms/tag/m97n86hou6",
              hostname: "www.clarity.ms",
              vendor: "Microsoft Clarity",
              vendorCategory: "session_replay",
              classification: "non_essential",
              essentiality: "non_essential",
              confidence: 0.95,
              runtimePhase: "pre_consent",
              firstObservedMs: 3831
            })
          ],
          preconsent_tracker_vendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.kbdlab.io/"],
        snippets: [],
        sourceUrls: ["https://www.clarity.ms/tag/m97n86hou6"]
      },
      primaryPageUrl: "https://www.kbdlab.io/",
      severity: "high"
    }),
    makePacket("session_replay_observed", {
      confidenceBand: "moderate",
      details: {
        family: "consent_tracking",
        kind: "session_replay_observed",
        requestUrls: [
          "https://www.clarity.ms/tag/m97n86hou6",
          "https://scripts.clarity.ms/0.8.64/clarity.js",
          "https://c.clarity.ms/c.gif"
        ],
        vendors: ["Microsoft Clarity"]
      },
      evidence: {
        counts: { representativeSessionReplayRequests: 4 },
        entities: {
          sessionReplayEvidenceSummary: [
            JSON.stringify({
              artifactCount: 1,
              collectionEndpointObserved: true,
              libraryOnly: false,
              maskingOrExclusionObserved: false,
              sensitiveSurfaceOverlap: false
            })
          ],
          runtimeVendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.session_replay_runtime_detected", "privacy.session_replay_runtime_vendors"],
        pageUrls: ["https://www.kbdlab.io/", "https://www.clarity.ms/"],
        snippets: [],
        sourceUrls: ["https://www.clarity.ms/tag/m97n86hou6", "https://scripts.clarity.ms/0.8.64/clarity.js"]
      },
      primaryPageUrl: "https://www.clarity.ms/",
      summary: "Session replay runtime detected."
    })
  ]);

  const finding = projection.topFindings.find((candidate) => candidate.id === "session_recording_services_detected");
  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.kbdlab.io/");
  assert.equal(finding?.evidenceDetails?.counts?.representativeSessionReplayRequests, 3);
  assert.equal(finding?.evidenceDetails?.vendors?.[0]?.preConsent, true);
  assert.equal(finding?.evidenceDetails?.representativeRequests?.[0]?.preConsent, true);
  assert.deepEqual(finding?.evidenceDetails?.sessionReplayEvidence?.preConsentVendorContext, ["Microsoft Clarity"]);
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.consentPhase, "pre_consent_observed_same_scan");
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.maskingOrExclusionObserved, false);
  assert.equal(finding?.evidenceDetails?.sessionReplayEvidence?.maskingOrExclusionEvidenceStatus, "not_retained_in_packet");
});

test("projects sensitive replay packets into sensitive third-party tracking companion finding", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("possible_session_replay_on_sensitive_input_surface", {
      confidenceBand: "high",
      details: {
        dataTypes: ["postal_code_detected"],
        family: "sensitive_data",
        kind: "possible_session_replay_on_sensitive_input_surface"
      },
      evidence: {
        counts: {},
        entities: {
          request_domains: ["api.example.com"],
          request_urls: ["https://api.example.com/location?zipcode=64118"],
          runtimeRequestUrls: ["https://edge.fullstory.com", "https://api.example.com/location?zipcode=64118"],
          runtimeVendors: ["FullStory"],
          sensitive_data_types: ["postal_code_detected"],
          sensitive_source_fields: ["zipcode"],
          sensitive_source_locations: ["url_query"],
          session_replay_runtime_vendors: ["FullStory"]
        },
        fetchQuality: null,
        flags: ["commerce.high_sensitivity_data_collection_detected"],
        pageUrls: [],
        snippets: ["zipcode=64***18"],
        sourceUrls: []
      },
      severity: "medium",
      summary: "FullStory session replay was observed on a sensitive-data input surface."
    })
  ]);

  assert.ok(projection.findings.some((finding) => finding.id === "possible_session_replay_on_sensitive_input_surface"));
  assert.ok(
    projection.findings.some(
      (finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"
    )
  );
  assert.ok(
    projection.trace.packets.some(
      (packet) =>
        packet.unifiedFindingId === "possible_session_replay_on_sensitive_input_surface" &&
        packet.executiveFindingId === "sensitive_data_collection_with_third_party_tracking_present"
    )
  );
});

test("projects scan-level replay and sensitive-surface co-presence as an official executive top finding", () => {
  const findingId = "session_replay_present_with_sensitive_surfaces_observed";
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket(findingId, {
      confidenceBand: "high",
      details: {
        dataTypes: ["email"],
        family: "sensitive_data",
        kind: findingId
      },
      evidence: {
        counts: {},
        entities: {
          sensitiveFieldEvidence: [
            JSON.stringify({
              dataType: "email",
              signalKey: "commerce.email_input_present",
              sourceField: "email"
            })
          ],
          session_replay_runtime_detected: ["true"],
          session_replay_runtime_vendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: [findingId],
        pageUrls: [],
        snippets: ["Microsoft Clarity observed in the same scan as an email input."],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Session replay was observed in the same scan as a sensitive surface, without same-page or same-flow linkage."
    })
  ]);

  assert.equal(
    projection.findings.some((finding) => finding.id === findingId),
    true
  );
  assert.equal(
    projection.topFindings.some((finding) => finding.id === findingId),
    true
  );
  assert.ok(projection.trace.projectedFindingIds.includes(findingId));
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
});

test("projects policy behavior contradictions as official executive top findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePolicyRuntimeConflictPacket()
  ]);

  assert.ok(projection.findings.some((finding) => finding.id === "policy_behavior_contradiction_detected"));
  assert.equal(
    projection.topFindings.some((finding) => finding.id === "policy_behavior_contradiction_detected"),
    true
  );
});

test("projects representative accessibility packets into DOJ ADA regulatory lens", () => {
  const seriousExampleCount = ADA_ACCESSIBILITY_FIXTURES.seriousAxeExample.accessibilityRuleExamples.length;
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makePacket("visual_contrast_accessibility_issue", {
        details: {
          family: "accessibility",
          kind: "visual_contrast_accessibility_issue",
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
        summary: "Automated accessibility issues were retained from axe examples."
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

test("projects surfaced visual contrast findings with representative axe evidence into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("visual_contrast_accessibility_issue", {
      confidenceBand: "high",
      details: {
        family: "accessibility",
        kind: "visual_contrast_accessibility_issue",
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
          accessibilityAxeEvidence: [
            JSON.stringify({
              description: "Elements must meet minimum color contrast ratio thresholds",
              helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
              impact: "serious",
              nodeCount: 1,
              pageUrl: "https://example.com/",
              representativeNodes: [
                {
                  checks: [
                    {
                      data: {
                        bgColor: "#ffffff",
                        contrastRatio: 2.1,
                        expectedContrastRatio: 4.5,
                        fgColor: "#aaaaaa"
                      },
                      id: "color-contrast",
                      message: "Element has insufficient color contrast of 2.1:1 with expected contrast ratio of 4.5:1"
                    }
                  ],
                  colorContrast: {
                    backgroundColor: "#ffffff",
                    contrastRatio: 2.1,
                    foregroundColor: "#aaaaaa",
                    requiredContrastRatio: 4.5
                  },
                  failureSummary: "Fix any of the following: Element has insufficient color contrast.",
                  htmlSnippet: "<p class=\"low-contrast\">Show more</p>",
                  selectors: ["p.low-contrast"]
                }
              ],
              representativeSelectors: ["p.low-contrast"],
              ruleId: "color-contrast"
            })
          ],
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

  const finding = projection.findings.find((candidate) => candidate.id === "visual_contrast_accessibility_issue");

  assert.ok(finding);
  assert.equal(finding?.section, "Accessibility");
  assert.equal(finding?.severity, "high");
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
  assert.ok(finding?.evidencePreview.some((snippet) => /color-contrast\/wcag2aa/i.test(snippet)));
  assert.ok(finding?.evidenceDetails?.evidenceFlags?.includes("representative_accessibility_examples_retained"));
  const axeEvidence = finding?.evidenceDetails?.accessibilityEvidence?.axeEvidence as
    | Array<{ representativeNodes?: Array<Record<string, unknown>> }>
    | undefined;
  assert.deepEqual(axeEvidence?.[0]?.representativeNodes?.[0]?.colorContrast, {
    backgroundColor: "#ffffff",
    contrastRatio: 2.1,
    foregroundColor: "#aaaaaa",
    requiredContrastRatio: 4.5
  });
  assert.equal(
    axeEvidence?.[0]?.representativeNodes?.[0]?.failureSummary,
    "Fix any of the following: Element has insufficient color contrast."
  );
});

test("keeps retention and accessibility findings in top findings when canonical evidence is retained", () => {
  const accessibilityNode = {
    failureSummary: "Fix any of the following: Element does not have inner text that is visible to screen readers.",
    htmlSnippet: "<button class=\"icon-only\"></button>",
    selectors: ["button.icon-only"]
  };
  const keyboardNode = {
    failureSummary: "Element should be keyboard focusable.",
    htmlSnippet: "<div class=\"carousel\">...</div>",
    selectors: [".carousel"]
  };
  const contrastNode = {
    colorContrast: {
      backgroundColor: "#ffffff",
      contrastRatio: 2.1,
      foregroundColor: "#aaaaaa",
      requiredContrastRatio: 4.5
    },
    failureSummary: "Fix any of the following: Element has insufficient color contrast.",
    htmlSnippet: "<p class=\"low-contrast\">Show more</p>",
    selectors: ["p.low-contrast"]
  };
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("cookie_retention_lifetime_review_signal", {
      details: { family: "consent_tracking", kind: "cookie_retention_lifetime_review_signal" },
      evidence: {
        counts: { cookieRetentionEvidenceCount: 1 },
        entities: {
          cookieRetentionEvidence: [
            JSON.stringify({
              classification: "advertising/marketing",
              cookieName: "_fbp",
              domain: ".example.com",
              durationDays: 540,
              pageUrl: "https://example.com/",
              party: "third_party",
              sourceRequestUrl: "https://connect.facebook.net/en_US/fbevents.js",
              thresholdBasis: "540 days observed against CertScore cookie retention review thresholds.",
              vendor: "Meta"
            })
          ]
        },
        fetchQuality: null,
        flags: ["automated_observation"],
        pageUrls: ["https://example.com/"],
        snippets: ["_fbp on .example.com was observed on https://example.com/ with an expiry around 540 days."],
        sourceUrls: []
      },
      presentationDecision: {
        confidenceRationale: "Concrete runtime cookie evidence retained.",
        downgradeReasons: [],
        rationale: "Runtime cookie retention evidence retained.",
        status: "surface",
        verificationLabel: "Runtime",
        verificationState: "runtime"
      },
      severity: "medium",
      summary: "Long-lived advertising cookie retention evidence was retained."
    }),
    makePacket("keyboard_navigation_accessibility_issue", {
      details: {
        family: "accessibility",
        kind: "keyboard_navigation_accessibility_issue",
        ruleExamples: ["scrollable-region-focusable"]
      },
      evidence: {
        counts: { representativeAxeExampleCount: 1, representativeAxePageCount: 1, representativeAxeRuleCount: 1 },
        entities: {
          accessibilityAxeEvidence: [
            JSON.stringify({
              impact: "serious",
              nodeCount: 1,
              pageUrl: "https://example.com/",
              representativeNodes: [keyboardNode],
              representativeSelectors: [".carousel"],
              ruleId: "scrollable-region-focusable"
            })
          ],
          accessibilityRuleCodes: ["scrollable-region-focusable"],
          accessibilitySelectors: [".carousel"],
          accessibilityImpacts: ["serious"]
        },
        fetchQuality: null,
        flags: ["representative_accessibility_examples_retained"],
        pageUrls: ["https://example.com/"],
        snippets: ["Axe example: scrollable-region-focusable on https://example.com/; selector .carousel; nodes 1; impact serious."],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Concrete keyboard-related axe node evidence was retained."
    }),
    makePacket("semantic_labeling_accessibility_issue", {
      details: {
        family: "accessibility",
        kind: "semantic_labeling_accessibility_issue",
        ruleExamples: ["button-name"]
      },
      evidence: {
        counts: { representativeAxeExampleCount: 1, representativeAxePageCount: 1, representativeAxeRuleCount: 1 },
        entities: {
          accessibilityAxeEvidence: [
            JSON.stringify({
              impact: "serious",
              nodeCount: 2,
              pageUrl: "https://example.com/",
              representativeNodes: [accessibilityNode],
              representativeSelectors: ["button.icon-only"],
              ruleId: "button-name"
            })
          ],
          accessibilityRuleCodes: ["button-name"],
          accessibilitySelectors: ["button.icon-only"],
          accessibilityImpacts: ["serious"]
        },
        fetchQuality: null,
        flags: ["representative_accessibility_examples_retained"],
        pageUrls: ["https://example.com/"],
        snippets: ["Axe example: button-name on https://example.com/; selector button.icon-only; nodes 2; impact serious."],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Concrete semantic labeling axe node evidence was retained."
    }),
    makePacket("visual_contrast_accessibility_issue", {
      details: {
        family: "accessibility",
        kind: "visual_contrast_accessibility_issue",
        ruleExamples: ["color-contrast"]
      },
      evidence: {
        counts: { representativeAxeExampleCount: 1, representativeAxePageCount: 1, representativeAxeRuleCount: 1 },
        entities: {
          accessibilityAxeEvidence: [
            JSON.stringify({
              impact: "serious",
              nodeCount: 1,
              pageUrl: "https://example.com/",
              representativeNodes: [contrastNode],
              representativeSelectors: ["p.low-contrast"],
              ruleId: "color-contrast"
            })
          ],
          accessibilityRuleCodes: ["color-contrast"],
          accessibilitySelectors: ["p.low-contrast"],
          accessibilityImpacts: ["serious"]
        },
        fetchQuality: null,
        flags: ["representative_accessibility_examples_retained"],
        pageUrls: ["https://example.com/"],
        snippets: ["Axe example: color-contrast on https://example.com/; selector p.low-contrast; nodes 1; impact serious."],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Concrete color contrast axe node evidence was retained."
    })
  ]);

  const topFindingIds = projection.topFindings.map((finding) => finding.id);
  assert.ok(topFindingIds.includes("long_lived_cookie_retention_review"));
  assert.ok(topFindingIds.includes("keyboard_navigation_accessibility_issue"));
  assert.ok(topFindingIds.includes("semantic_labeling_accessibility_issue"));
  assert.ok(topFindingIds.includes("visual_contrast_accessibility_issue"));

  const byId = new Map(projection.topFindings.map((finding) => [finding.id, finding]));
  assert.equal(byId.get("long_lived_cookie_retention_review")?.severity, "medium");
  assert.equal(
    byId.get("long_lived_cookie_retention_review")?.evidenceDetails?.counts?.longLivedTrackingCookieCount,
    1
  );
  const keyboardAxeEvidence = byId.get("keyboard_navigation_accessibility_issue")?.evidenceDetails?.accessibilityEvidence?.axeEvidence as
    | Array<{ representativeNodes?: Array<Record<string, unknown>> }>
    | undefined;
  const semanticAxeEvidence = byId.get("semantic_labeling_accessibility_issue")?.evidenceDetails?.accessibilityEvidence?.axeEvidence as
    | Array<{ representativeNodes?: Array<Record<string, unknown>> }>
    | undefined;
  const contrastAxeEvidence = byId.get("visual_contrast_accessibility_issue")?.evidenceDetails?.accessibilityEvidence?.axeEvidence as
    | Array<{ representativeNodes?: Array<Record<string, unknown>> }>
    | undefined;
  assert.equal(
    keyboardAxeEvidence?.[0]?.representativeNodes?.[0]?.htmlSnippet,
    keyboardNode.htmlSnippet
  );
  assert.equal(
    semanticAxeEvidence?.[0]?.representativeNodes?.[0]?.failureSummary,
    accessibilityNode.failureSummary
  );
  assert.deepEqual(
    contrastAxeEvidence?.[0]?.representativeNodes?.[0]?.colorContrast,
    contrastNode.colorContrast
  );
});

test("focus-management projection does not claim reproduced behavior without retained WS01 trace", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("focus_management_issue", {
      confidenceBand: "high",
      details: {
        family: "accessibility",
        kind: "focus_management_issue"
      },
      evidence: {
        counts: {},
        entities: {},
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.wisc.edu/"],
        snippets: ["Behavior-reproduced focus-management evidence was retained from WS01 keyboard interaction tracing."],
        sourceUrls: []
      },
      primaryPageUrl: "https://www.wisc.edu/",
      severity: "medium",
      summary: "Behavior-reproduced focus-management evidence was retained from WS01 keyboard interaction tracing."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "focus_management_issue");
  assert.ok(finding);
  assert.equal(finding.confidence, "moderate");
  assert.equal(projection.topFindingEligibility.focus_management_issue?.eligibility, "surface_only");
  assert.match(finding.shortSummary, /does not include behavior-reproduced keyboard traversal evidence/);
  assert.match(
    String(finding.evidenceDetails?.accessibilityEvidence?.basis ?? ""),
    /does not include behavior-reproduced keyboard traversal evidence/
  );
  assert.equal(projection.topFindings.some((entry) => entry.id === "focus_management_issue"), false);
});

test("focus-management projection keeps WS01 behavior-reproduced traversal evidence attached", () => {
  const focusManagementEvidence = {
    dialogContext: {
      role: "dialog",
      selector: "[role='dialog']"
    },
    evidenceStrength: "behavior_reproduced",
    expected: "Tab navigation should remain contained within an open dialog.",
    focusTrace: [
      {
        action: "snapshot",
        activeElement: { selector: "button[aria-label='Close']", tagName: "button" },
        activeInsideDialog: true,
        step: 0
      },
      {
        action: "press_tab",
        activeElement: { selector: "a[href='/']", tagName: "a" },
        activeInsideDialog: false,
        step: 1
      }
    ],
    issueType: "focus_trap_missing",
    keyboardTraversalEvidence: {
      backgroundFocusEscaped: true,
      reproducedWithKeyboard: true,
      tabStepCount: 1
    },
    observed: "Focus moved to background content while the dialog was still open.",
    pageUrl: "https://www.wisc.edu/",
    source: "ws01_playwright_focus_probe"
  };
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("focus_management_issue", {
      confidenceBand: "high",
      details: {
        family: "accessibility",
        kind: "focus_management_issue"
      },
      evidence: {
        counts: {},
        entities: {
          focusManagementEvidence: [JSON.stringify(focusManagementEvidence)]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.wisc.edu/"],
        snippets: [],
        sourceUrls: []
      },
      primaryPageUrl: "https://www.wisc.edu/",
      severity: "medium",
      summary: "Focus-management issue observed."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "focus_management_issue");
  assert.ok(finding);
  assert.equal(finding.confidence, "strong");
  assert.equal(projection.topFindingEligibility.focus_management_issue?.eligibility, "top_candidate");
  assert.match(finding.shortSummary, /Behavior-reproduced focus-management evidence/);
  assert.match(String(finding.evidenceDetails?.accessibilityEvidence?.basis ?? ""), /Scanner reproduced/);
  assert.deepEqual(
    finding.evidenceDetails?.accessibilityEvidence?.focusManagementEvidence,
    [focusManagementEvidence]
  );
});

test("projects CPRA CBA opt-out missing into executive findings and top findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: { preconsentViolationCount: 3 },
        entities: {
          runtimeVendors: ["Google Ads", "Google Analytics", "Google Tag Manager"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.healthline.com/"],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("cpra_cba_opt_out_missing", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "cpra_cba_opt_out_missing" },
      evidence: {
        counts: {},
        entities: {
          directAdvertisingSharingVendors: ["The Trade Desk", "PubMatic", "LiveRamp"],
          optOutUiResult: ["absent"]
        },
        fetchQuality: null,
        flags: ["privacy.cpra_cba_opt_out_missing"],
        pageUrls: ["https://www.healthline.com/"],
        snippets: ["CPRA CBA opt-out evidence retained with absent opt-out UI."],
        sourceUrls: []
      },
      severity: "high",
      summary: "Cross-context behavioral advertising vendors were retained without a CPRA-specific opt-out mechanism."
    }),
    makePacket("rtb_cookie_sync_observed", {
      confidenceBand: "high",
      details: { family: "commercial", kind: "rtb_cookie_sync_observed" },
      evidence: {
        counts: {},
        entities: {
          vendors: ["DoubleClick / Floodlight", "DoubleVerify", "ID5"]
        },
        fetchQuality: null,
        flags: ["privacy.rtb_cookie_sync_observed"],
        pageUrls: ["https://www.healthline.com/"],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "RTB cookie sync evidence was retained."
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "cpra_cba_opt_out_missing");

  assert.ok(finding);
  assert.equal(finding?.section, "Privacy & Tracking");
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.evidenceVersion, "1.1");
  assert.equal(finding?.label, "CPRA / privacy choice opt-out review signal");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.result, "absent");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.optOutSubtype, "opt_out_absent");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.missingOrAbsent, true);
  assert.equal(finding?.evidenceDetails?.trackingOrSharingContext?.cbaVendorEvidenceObserved, true);
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.gpcScanStateSent, false);
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.gpcHandlingObserved, "not_determined");
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.gpcHandlingBasis, "not_tested");
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.privacyChoiceCompletenessSubtype, "missing");
  const policyEvidence = finding?.evidenceDetails?.policyEvidence as Record<string, unknown> | undefined;
  assert.equal(policyEvidence?.evaluated, false);
  assert.equal(policyEvidence?.framework, "CPRA");
  assert.equal(policyEvidence?.policyCbaLanguage, null);
  assert.ok(projection.topFindings.some((candidate) => candidate.id === "cpra_cba_opt_out_missing"));
  assert.ok(projection.topFindingEligibility.cpra_cba_opt_out_missing?.matchedCriteria.includes("privacy_choice_control_missing"));
  assert.ok(projection.topFindingEligibility.cpra_cba_opt_out_missing?.matchedCriteria.includes("cba_vendor_runtime_context"));
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
  assert.ok(finding?.shortSummary.includes("The Trade Desk"));
});

test("projects CPRA CBA opt-out subtype for partial privacy choice treatment", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("cpra_cba_opt_out_missing", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "cpra_cba_opt_out_missing" },
      evidence: {
        counts: {},
        entities: {
          directAdvertisingSharingVendors: [
            "The Trade Desk",
            "Amazon Ads",
            "Criteo",
            "Google Ads",
            "OpenX",
            "PubMatic",
            "Magnite",
            "Taboola",
            "Yahoo Ads"
          ],
          choiceControlsInspected: ["true"],
          gpcHandlingObserved: ["not_determined"],
          gpcScanStateSent: ["false"],
          optOutControlFound: ["true"],
          optOutUiResult: ["partial_no_icon"],
          policyCbaLanguage: ["full_cba_language"],
          policyUiCongruent: ["true"]
        },
        fetchQuality: null,
        flags: ["privacy.cpra_cba_opt_out_missing"],
        pageUrls: ["https://www.nbcnews.com/"],
        snippets: [],
        sourceUrls: []
      },
      severity: "high",
      summary: "Cross-context behavioral advertising vendors were retained with partial privacy-choice evidence."
    })
  ]);
  const finding = projection.findings.find((candidate) => candidate.id === "cpra_cba_opt_out_missing");

  assert.ok(finding);
  assert.equal(finding?.severity, "medium");
  assert.equal(finding?.shortSummary.includes("missing"), false);
  assert.doesNotMatch(finding?.shortSummary ?? "", /absent|no CPRA-specific opt-out control/i);
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.optOutSubtype, "partial_no_icon");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.result, "partial_no_icon");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.privacyChoiceCompletenessSubtype, "incomplete_or_unconfirmed");
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.privacyChoiceCompletenessSubtype, "incomplete_or_unconfirmed");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.missingOrAbsent, false);
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.incompleteOrUnconfirmed, true);
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.choiceControlsInspected, true);
  assert.equal(finding?.evidenceDetails?.counts?.cbaVendorsObserved, 9);
  assert.equal(finding?.evidenceDetails?.counts?.optOutControlsObserved, 1);
  assert.equal(finding?.evidenceDetails?.trackingOrSharingContext?.cbaVendorEvidenceObserved, true);
  const policyEvidence = finding?.evidenceDetails?.policyEvidence as Record<string, unknown> | undefined;
  assert.equal(policyEvidence?.evaluated, true);
  assert.equal(policyEvidence?.policyCbaLanguage, "full_cba_language");
  assert.equal(policyEvidence?.policyUiCongruent, true);
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.policyUiCongruent, true);
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.gpcScanStateSent, false);
  assert.equal(finding?.evidenceDetails?.jurisdictionOrPolicyContext?.gpcHandlingObserved, "not_determined");
  assert.equal(projection.topFindingEligibility.cpra_cba_opt_out_missing?.eligibility, "top_candidate");
  assert.ok(projection.topFindingEligibility.cpra_cba_opt_out_missing?.matchedCriteria.includes("privacy_choice_control_observed"));
  assert.ok(projection.topFindingEligibility.cpra_cba_opt_out_missing?.matchedCriteria.includes("cpra_completeness_not_confirmed"));
  assert.ok(projection.topFindingEligibility.cpra_cba_opt_out_missing?.missingCorroborators.includes("gpc_handling_test"));
  assert.match(finding?.shortSummary ?? "", /incomplete|not confirmed as CPRA-complete/i);
  assert.doesNotMatch(finding?.evidenceDetails?.optOutControlEvidence?.basis as string, /missing/i);
});

test("projects CPRA CBA opt-out subtype for generic do-not-sell only", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makeCpraPacket({ optOutControlFound: "true", optOutUiResult: "generic_do_not_sell" })
  ]);
  const finding = projection.findings.find((candidate) => candidate.id === "cpra_cba_opt_out_missing");

  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.optOutSubtype, "generic_do_not_sell_only");
  assert.equal(finding?.evidenceDetails?.optOutControlEvidence?.missingOrAbsent, false);
  assert.match(finding?.evidenceDetails?.optOutControlEvidence?.basis as string, /Do Not Share|CBA-specific/i);
});

test("projects remaining top finding families with canonical evidence details", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("third_party_cookie_pre_consent", {
      details: { family: "consent_tracking", kind: "third_party_cookie_pre_consent" },
      evidence: {
        counts: { preconsentCookieCount: 2 },
        entities: {
          preconsent_cookie_evidence: [
            JSON.stringify({
              category: "analytics",
              cookieName: "_ga",
              domain: ".google-analytics.com",
              nonEssential: true,
              party: "third_party",
              timingEvidence: "before_consent_cookie_write",
              vendor: "Google Analytics"
            })
          ],
          runtimeVendors: ["Google Analytics"]
        },
        fetchQuality: null,
        flags: ["privacy.third_party_cookie_pre_consent"],
        pageUrls: ["https://example.com/"],
        snippets: ["Third-party cookies were retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    }),
    makePacket("reject_button_missing", {
      details: { family: "consent_tracking", kind: "reject_button_missing" },
      evidence: {
        counts: {},
        entities: {},
        fetchQuality: null,
        flags: ["privacy.reject_button_missing"],
        pageUrls: ["https://example.com/"],
        snippets: ["Reject option was not visible on the first consent layer."],
        sourceUrls: []
      },
      severity: "high"
    }),
    makePacket("identifier_transmission_detected", {
      details: { family: "consent_tracking", kind: "identifier_transmission_detected" },
      evidence: {
        counts: {},
        entities: {
          runtimeRequestUrls: ["https://tracker.example/collect?uid=abc"],
          runtimeVendors: ["Tracker Example"]
        },
        fetchQuality: null,
        flags: ["privacy.identifier_transmission_detected"],
        pageUrls: ["https://example.com/"],
        snippets: [],
        sourceUrls: []
      },
      severity: "high"
    }),
    makePacket("visual_contrast_accessibility_issue", {
      details: { family: "accessibility", kind: "visual_contrast_accessibility_issue" },
      evidence: {
        counts: { seriousAxeViolationCount: 1 },
        entities: {
          accessibilityAxeEvidence: [
            JSON.stringify({
              description: "Elements must meet minimum color contrast ratio thresholds",
              helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
              impact: "serious",
              nodeCount: 2,
              pageUrl: "https://example.com/",
              representativeSelectors: [".hero-title"],
              ruleId: "color-contrast"
            })
          ]
        },
        fetchQuality: null,
        flags: ["accessibility.representative_barrier"],
        pageUrls: ["https://example.com/"],
        snippets: ["color-contrast failed on button text."],
        sourceUrls: []
      },
      severity: "medium"
    }),
    makePacket("policy_clarity_risk", {
      details: { family: "policy_extraction", kind: "policy_clarity_risk" },
      evidence: {
        counts: {},
        entities: {},
        fetchQuality: null,
        flags: ["policy.clarity_risk"],
        pageUrls: ["https://example.com/privacy"],
        snippets: ["Policy language does not clearly explain advertising sharing choices."],
        sourceUrls: ["https://example.com/privacy"]
      },
      severity: "medium"
    }),
    makePacket("high_risk_product_risk_disclosure_missing", {
      details: { family: "financial_promotion", kind: "high_risk_product_risk_disclosure_missing" },
      evidence: {
        counts: {},
        entities: {},
        fetchQuality: null,
        flags: ["financial.high_risk_product_risk_disclosure_missing"],
        pageUrls: ["https://example.com/invest"],
        snippets: ["Trade leveraged products with high potential upside."],
        sourceUrls: ["https://example.com/invest"]
      },
      severity: "high"
    })
  ]);

  const byId = new Map(projection.findings.map((finding) => [finding.id, finding]));
  assert.equal(byId.get("third_party_cookie_pre_consent")?.evidenceVersion, "1.1");
  assert.equal(byId.get("third_party_cookie_pre_consent")?.evidenceDetails?.cookieEvidence?.observed, true);
  assert.equal(byId.get("reject_option_missing_or_hidden")?.evidenceVersion, "1.1");
  assert.equal(byId.get("reject_option_missing_or_hidden")?.evidenceDetails?.consentUiEvidence?.observed, true);
  assert.equal(byId.get("identifier_transmission_detected")?.evidenceVersion, "1.1");
  assert.equal(byId.get("identifier_transmission_detected")?.evidenceDetails?.telemetryEvidence?.identifierLikeRequestCount, 1);
  assert.equal(byId.get("visual_contrast_accessibility_issue")?.evidenceVersion, "1.1");
  assert.equal(byId.get("visual_contrast_accessibility_issue")?.evidenceDetails?.accessibilityEvidence?.observed, true);
  assert.deepEqual(byId.get("visual_contrast_accessibility_issue")?.evidenceDetails?.accessibilityEvidence?.axeEvidence, [
    {
      ruleId: "color-contrast",
      impact: "serious",
      nodeCount: 2,
      description: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
      pageUrl: "https://example.com/",
      representativeSelectors: [".hero-title"]
    }
  ]);
  assert.equal(byId.has("policy_clarity_risk"), false);
  assert.equal(byId.get("high_risk_product_risk_disclosure_missing")?.evidenceVersion, "1.1");
  assert.equal(byId.get("high_risk_product_risk_disclosure_missing")?.evidenceDetails?.financialClaimsEvidence?.observed, true);
});

test("keeps policy clarity risk out of executive projection on transport-failure coverage", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("policy_clarity_risk", {
      affectedPageCount: 0,
      confidenceBand: "high",
      confidenceInputs: {
        ...makePacket("policy_clarity_risk").confidenceInputs,
        hasDirectRuntimeEvidence: false,
        hasKeyPageDiscoveryEvidence: false,
        hasPolicyTextEvidence: true
      },
      details: {
        family: "policy_extraction",
        kind: "policy_clarity_risk",
        ambiguityScore: 92
      },
      evidence: {
        counts: { pagesScanned: 0 },
        entities: { scanOutcome: ["transport_failure"], coverageLevel: ["limited_none"] },
        fetchQuality: null,
        flags: ["policy.clarity_risk"],
        pageUrls: ["https://example.com/privacy"],
        snippets: ["Policy language is broad and does not clearly describe choices."],
        sourceUrls: ["https://example.com/privacy"]
      },
      primaryPageUrl: null,
      severity: "medium",
      surfacingDecision: {
        ...makePacket("policy_clarity_risk").surfacingDecision,
        family: "policy_extraction",
        reportLane: "confidence_and_coverage",
        surfaceTier: "section"
      }
    })
  ]);

  assert.equal(projection.findings.some((finding) => finding.id === "policy_clarity_risk"), false);
  assert.equal(projection.topFindings.some((finding) => finding.id === "policy_clarity_risk"), false);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, ["policy_clarity_risk"]);
});

test("keeps scanned page URL separate from representative third-party request URLs", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: {
        family: "consent_tracking",
        kind: "preconsent_tracking",
        vendors: ["Microsoft Clarity", "Google Tag Manager", "Microsoft Advertising"]
      },
      evidence: {
        counts: { firstThirdPartyTrackingRequestMs: 120 },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstCmpVisibleMs: 600,
              firstConsentActionMs: null,
              firstCookieSetMs: 140,
              firstNonEssentialRequestMs: 120,
              navigationStartMs: 0
            })
          ],
          preconsent_tracker_evidence_urls: [
            "https://www.clarity.ms/tag/abc123",
            "https://www.googletagmanager.com/gtm.js?id=GTM-ABC",
            "https://bat.bing.com/bat.js"
          ],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              confidence: "high",
              essentiality: "non_essential",
              requestUrl: "https://www.clarity.ms/tag/abc123",
              vendor: "Microsoft Clarity",
              category: "session_replay",
              firstObservedMs: 120
            })
          ],
          preconsent_tracker_vendor_evidence: [
            JSON.stringify({
              url: "https://www.clarity.ms/tag/abc123",
              vendor: "Microsoft Clarity",
              category: "session_replay"
            }),
            JSON.stringify({
              url: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC",
              vendor: "Google Tag Manager",
              category: "session_replay"
            }),
            JSON.stringify({
              url: "https://bat.bing.com/bat.js",
              vendor: "Microsoft Advertising",
              category: "session_replay"
            })
          ],
          preconsent_tracker_vendors: ["Microsoft Clarity", "Google Tag Manager", "Microsoft Advertising"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.kbdlab.io/"],
        snippets: [],
        sourceUrls: ["https://www.clarity.ms/tag/abc123"]
      },
      primaryPageUrl: "https://www.clarity.ms/tag/abc123",
      sourceUrl: "https://www.clarity.ms/tag/abc123",
      severity: "high"
    })
  ]);
  const finding = projection.findings.find((candidate) => candidate.id === "pre_consent_tracking_detected");

  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.kbdlab.io/");
  assert.equal(finding?.evidenceDetails?.timing?.firstNonEssentialRequestMs, 120);
  assert.equal(finding?.evidenceDetails?.timing?.firstCmpVisibleMs, 600);
  assert.deepEqual(finding?.evidenceDetails?.requestClassificationAnchors, [
    {
      requestUrl: "https://www.clarity.ms/tag/abc123",
      hostname: "clarity.ms",
      registrableDomain: "clarity.ms",
      vendor: "Microsoft Clarity",
      category: "session_replay",
      essentiality: "non_essential",
      confidence: "high",
      firstObservedMs: 120
    }
  ]);
  assert.deepEqual(
    finding?.evidenceDetails?.representativeRequests?.map((request) => [request.vendor, request.category]),
    [
      ["Microsoft Clarity", "session_replay"]
    ]
  );
  assert.deepEqual(
    finding?.evidenceDetails?.vendors?.map((vendor) => [vendor.name, vendor.category]),
    [
      ["Microsoft Clarity", "session_replay"]
    ]
  );
  assert.deepEqual(
    finding?.evidenceDetails?.relatedOrInferredVendors?.map((vendor) => [vendor.name, vendor.category]),
    [
      ["Google Tag Manager", "tag_manager"],
      ["Microsoft Advertising", "advertising_measurement"]
    ]
  );
});

test("uses promotion-grade request classifications for pre-consent representative tracking anchors", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: {
        family: "consent_tracking",
        kind: "preconsent_tracking",
        vendors: ["Adobe Analytics", "LiveRamp", "Quantum Metric"]
      },
      evidence: {
        counts: { firstThirdPartyTrackingRequestMs: 229 },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstCmpVisibleMs: null,
              firstConsentActionMs: 7081,
              firstNonEssentialRequestMs: 229
            })
          ],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              requestUrl: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
              hostname: "cdn.cookielaw.org",
              vendor: "OneTrust CMP asset",
              vendorCategory: "cmp",
              classification: "service_classified",
              essentiality: "necessary",
              confidence: 0.99,
              runtimePhase: "pre_consent"
            }),
            JSON.stringify({
              requestUrl: "https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js",
              hostname: "ajax.googleapis.com",
              vendor: "Google Hosted Libraries",
              vendorCategory: "cdn",
              classification: "service_classified",
              essentiality: "necessary",
              confidence: 0.99,
              runtimePhase: "pre_consent"
            }),
            JSON.stringify({
              requestUrl: "https://dpm.demdex.net/id?d_visid_ver=5",
              hostname: "dpm.demdex.net",
              vendor: "Adobe Analytics",
              vendorCategory: "analytics",
              classification: "non_essential",
              essentiality: "non_essential",
              confidence: 0.94,
              runtimePhase: "pre_consent",
              firstObservedMs: 229,
              vendorAttributionBasis: "hostname_match"
            }),
            JSON.stringify({
              requestUrl: "https://idsync.rlcdn.com/123.gif",
              hostname: "idsync.rlcdn.com",
              vendor: "LiveRamp",
              vendorCategory: "advertising",
              classification: "non_essential",
              essentiality: "non_essential",
              confidence: 0.92,
              runtimePhase: "pre_consent",
              firstObservedMs: 1167,
              vendorAttributionBasis: "hostname_match"
            })
          ],
          preconsent_tracker_vendors: ["Adobe Analytics", "LiveRamp", "Quantum Metric"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.fandango.com/"],
        snippets: [],
        sourceUrls: ["https://dpm.demdex.net/id?d_visid_ver=5"]
      },
      primaryPageUrl: "https://maps.googleapis.com/maps/api/js?key=abc&callback=initMap",
      sourceUrl: "https://dpm.demdex.net/id?d_visid_ver=5",
      severity: "high"
    })
  ]);

  const finding = projection.findings.find((candidate) => candidate.id === "pre_consent_tracking_detected");
  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.fandango.com/");
  assert.match(finding?.shortSummary ?? "", /LiveRamp and Adobe Analytics/);
  assert.doesNotMatch(finding?.shortSummary ?? "", /DoubleVerify|Google Ads|Magnite/);
  assert.deepEqual(
    finding?.evidenceDetails?.representativeRequests?.map((request) => ({
      url: request.url,
      vendor: request.vendor,
      category: request.category,
      firstSeenMs: request.firstSeenMs
    })),
    [
      {
        url: "https://idsync.rlcdn.com/123.gif",
        vendor: "LiveRamp",
        category: "advertising",
        firstSeenMs: 1167
      },
      {
        url: "https://dpm.demdex.net/id?d_visid_ver=5",
        vendor: "Adobe Analytics",
        category: "analytics",
        firstSeenMs: 229
      }
    ]
  );
  assert.doesNotMatch(
    JSON.stringify(finding?.evidenceDetails?.representativeRequests ?? []),
    /cookielaw|ajax\.googleapis|OneTrust CMP asset|Google Hosted Libraries/
  );
});

test("labels Bing sync endpoints by endpoint vendor while preserving initiating vendor context", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: {
        family: "consent_tracking",
        kind: "preconsent_tracking",
        vendors: ["Microsoft Clarity", "Microsoft Advertising / Bing UET"]
      },
      evidence: {
        counts: { firstThirdPartyTrackingRequestMs: 3831 },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstCmpVisibleMs: 1200,
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 3831
            })
          ],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              requestUrl: "https://c.bing.com/c.gif?ctsa=mr&CtsSyncId=abc",
              hostname: "c.bing.com",
              vendor: "Microsoft Clarity",
              vendorCategory: "session_replay",
              classification: "non_essential",
              essentiality: "non_essential",
              confidence: 0.95,
              runtimePhase: "pre_consent",
              firstObservedMs: 3831,
              vendorAttributionBasis: "initiator_chain"
            })
          ],
          preconsent_tracker_vendors: ["Microsoft Clarity", "Microsoft Advertising / Bing UET"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.kbdlab.io/"],
        snippets: [],
        sourceUrls: ["https://c.bing.com/c.gif?ctsa=mr&CtsSyncId=abc"]
      },
      primaryPageUrl: "https://www.kbdlab.io/",
      severity: "high"
    })
  ]);

  const request = projection.findings.find((finding) => finding.id === "pre_consent_tracking_detected")?.evidenceDetails?.representativeRequests?.[0];
  assert.equal(request?.vendor, "Microsoft Advertising / Bing UET");
  assert.equal(request?.endpointVendor, "Microsoft Advertising / Bing UET");
  assert.equal(request?.initiatingVendor, "Microsoft Clarity");
  assert.equal(request?.category, "advertising_measurement");
  assert.equal(request?.scannedPageUrl, "https://www.kbdlab.io/");
});

test("keeps direct pre-consent request attribution on hostname-supported vendors for nbcnews-style rows", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: [],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: {
        family: "consent_tracking",
        kind: "preconsent_tracking",
        vendors: ["Google Ads", "Akamai mPulse", "DoubleVerify", "Criteo", "Amazon Ads", "Rubicon Project"]
      },
      evidence: {
        counts: {
          firstThirdPartyTrackingRequestMs: 1005,
          preConsentTrackingCookies: 1,
          totalPreConsentThirdPartyTrackingRequests: 8
        },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 1005
            })
          ],
          preconsent_tracker_vendors: ["Google Ads", "Akamai mPulse", "DoubleVerify", "Criteo", "Amazon Ads", "Rubicon Project"],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              category: "advertising",
              classification: "non_essential",
              collectionEndpointType: "direct_third_party",
              confidence: 0.95,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              hostname: "gum.criteo.com",
              pageUrl: "https://aamt.nbcnews.com/b/ss/nbcnewsprod/1/JS-2.27.0/s12345",
              requestUrl: "https://gum.criteo.com/sync?uid=abc",
              runtimePhase: null,
              timestampMs: 1005,
              vendor: "Google Ads",
              vendorAttributionBasis: "initiator_chain"
            }),
            JSON.stringify({
              category: "advertising",
              classification: "non_essential",
              collectionEndpointType: "direct_third_party",
              confidence: 0.94,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              hostname: "aax-eu.amazon-adsystem.com",
              pageUrl: "https://aamt.nbcnews.com/b/ss/nbcnewsprod/1/JS-2.27.0/s12345",
              requestUrl: "https://aax-eu.amazon-adsystem.com/e/dtb/bid?src=abc",
              runtimePhase: null,
              timestampMs: 1012,
              vendor: "Akamai mPulse",
              vendorAttributionBasis: "container_context"
            }),
            JSON.stringify({
              category: "advertising",
              classification: "non_essential",
              collectionEndpointType: "direct_third_party",
              confidence: 0.93,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              hostname: "eus.rubiconproject.com",
              pageUrl: "https://aamt.nbcnews.com/b/ss/nbcnewsprod/1/JS-2.27.0/s12345",
              requestUrl: "https://eus.rubiconproject.com/usync.html?p=abc",
              runtimePhase: null,
              timestampMs: 1020,
              vendor: "DoubleVerify",
              vendorAttributionBasis: "ecosystem_association"
            })
          ],
          runtimeRequestUrls: [
            "https://gum.criteo.com/sync?uid=abc",
            "https://aax-eu.amazon-adsystem.com/e/dtb/bid?src=abc",
            "https://eus.rubiconproject.com/usync.html?p=abc"
          ],
          runtimeVendors: ["Google Ads", "Akamai mPulse", "DoubleVerify", "Criteo", "Amazon Ads", "Rubicon Project"]
        },
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.nbcnews.com/", "https://aamt.nbcnews.com/b/ss/nbcnewsprod/1/JS-2.27.0/s12345"],
        sourceUrls: ["https://aamt.nbcnews.com/b/ss/nbcnewsprod/1/JS-2.27.0/s12345"]
      },
      primaryPageUrl: "https://www.nbcnews.com/",
      sourceUrl: "https://aamt.nbcnews.com/b/ss/nbcnewsprod/1/JS-2.27.0/s12345",
      severity: "high",
      summary: "Tracker vendors fired before consent interaction."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "pre_consent_tracking_detected");
  const representativeRequests = finding?.evidenceDetails?.representativeRequests ?? [];

  assert.ok(finding);
  assert.ok(projection.topFindings.some((entry) => entry.id === "pre_consent_tracking_detected"));
  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.nbcnews.com/");
  assert.deepEqual(representativeRequests.map((request) => request.vendor), [
    "Criteo",
    "Amazon Ads",
    "Rubicon Project"
  ]);
  assert.deepEqual(representativeRequests.map((request) => request.runtimePhase), [
    "pre_consent",
    "pre_consent",
    "pre_consent"
  ]);
  assert.deepEqual(
    finding?.evidenceDetails?.directlyObservedPreConsentVendors?.map((vendor) => vendor.name),
    ["Criteo", "Amazon Ads", "Rubicon Project"]
  );
  assert.deepEqual(
    finding?.evidenceDetails?.relatedOrInferredVendors?.map((vendor) => vendor.name),
    ["Google Ads", "Akamai mPulse", "DoubleVerify"]
  );
  assert.deepEqual(
    finding?.evidenceDetails?.relatedOrInferredVendors?.map((vendor) => vendor.attributionBasis),
    [
      "related_runtime_vendor_without_public_direct_request_anchor",
      "related_runtime_vendor_without_public_direct_request_anchor",
      "related_runtime_vendor_without_public_direct_request_anchor"
    ]
  );
  assert.equal(finding?.evidenceDetails?.vendorEvidenceCompleteness?.someVendorAnchorsOmittedFromPublicPacket, false);
  assert.doesNotMatch(JSON.stringify(representativeRequests), /"vendor":"Google Ads"|"vendor":"Akamai mPulse"|"vendor":"DoubleVerify"/);
});

test("keeps scanned page URL separate from Amazon Ads config URLs", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: { fingerprintTier: 3, mergedSignalConfidence: 1 },
        entities: {
          fingerprintAttributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
          runtimeRequestUrls: ["https://config.aps.amazon-adsystem.com/configs/3030"],
          runtimeVendors: ["Amazon Ads"]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.nytimes.com/", "https://config.aps.amazon-adsystem.com/configs/3030"],
        snippets: ["Coordinated browser/device collection was retained."],
        sourceUrls: ["https://config.aps.amazon-adsystem.com/configs/3030"]
      },
      primaryPageUrl: "https://www.nytimes.com/",
      sourceUrl: "https://config.aps.amazon-adsystem.com/configs/3030",
      severity: "high"
    })
  ]);
  const finding = projection.findings.find((candidate) => candidate.id === "fingerprinting_related_signals_observed");

  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.nytimes.com/");
  assert.ok(finding?.evidenceDetails?.runtimeRequestUrls?.includes("https://config.aps.amazon-adsystem.com/configs/3030"));
  assert.notEqual(finding?.evidenceDetails?.scanContext?.pageUrl, "https://config.aps.amazon-adsystem.com/configs/3030");
});

test("keeps top-level finding scanContext page URLs on the audited origin", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      details: { family: "consent_tracking", kind: "preconsent_tracking", vendors: ["Microsoft Clarity"] },
      evidence: {
        counts: { firstThirdPartyTrackingRequestMs: 120 },
        entities: {
          preconsent_tracker_evidence_urls: ["https://www.clarity.ms/tag/abc123"],
          preconsent_tracker_vendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.kbdlab.io/", "https://www.clarity.ms/tag/abc123"],
        snippets: [],
        sourceUrls: ["https://www.clarity.ms/tag/abc123"]
      },
      primaryPageUrl: "https://www.kbdlab.io/",
      sourceUrl: "https://www.clarity.ms/tag/abc123",
      severity: "high"
    }),
    makePacket("fingerprinting_observed", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      evidence: {
        counts: { fingerprintTier: 3, mergedSignalConfidence: 1 },
        entities: {
          fingerprintAttributeCategories: ["canvas_webgl", "audio", "fonts_plugins"],
          runtimeRequestUrls: ["https://config.aps.amazon-adsystem.com/configs/3030"],
          runtimeVendors: ["Amazon Ads"]
        },
        fetchQuality: null,
        flags: [],
        pageUrls: ["https://www.nytimes.com/", "https://config.aps.amazon-adsystem.com/configs/3030"],
        snippets: [],
        sourceUrls: ["https://config.aps.amazon-adsystem.com/configs/3030"]
      },
      primaryPageUrl: "https://www.nytimes.com/",
      sourceUrl: "https://config.aps.amazon-adsystem.com/configs/3030",
      severity: "high"
    })
  ]);

  const expectedHosts = new Set(["www.kbdlab.io", "www.nytimes.com"]);
  for (const finding of projection.findings) {
    const pageUrl = finding.evidenceDetails?.scanContext?.pageUrl;
    assert.ok(pageUrl);
    assert.ok(expectedHosts.has(new URL(pageUrl).hostname), `${finding.id} used unexpected scanContext.pageUrl ${pageUrl}`);
    assert.doesNotMatch(pageUrl, /clarity\.ms|amazon-adsystem\.com/i);
  }
});

test("keeps related runtime requests out of direct pre-consent cookie evidence rows", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("third_party_cookie_pre_consent", {
      details: { family: "consent_tracking", kind: "third_party_cookie_pre_consent" },
      evidence: {
        counts: { preconsent_cookie_before_consent_count: 1 },
        entities: {
          preconsent_cookie_evidence: [
            JSON.stringify({
              cookieName: "_clck",
              cookieInitiatorVendor: "Microsoft Clarity",
              category: "session_replay",
              initiatorUrl: "https://www.clarity.ms/tag/abc123",
              nonEssential: true,
              party: "third_party",
              timingEvidence: "before_consent_cookie_write"
            })
          ],
          runtimeRequestUrls: ["https://www.clarity.ms/tag/abc123"],
          runtimeVendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.third_party_cookie_pre_consent"],
        pageUrls: ["https://www.kbdlab.io/"],
        snippets: ["Third-party cookie write was retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);
  const finding = projection.findings.find((candidate) => candidate.id === "third_party_cookie_pre_consent");
  const cookieEvidence = finding?.evidenceDetails?.cookieEvidence;

  assert.equal(finding?.evidenceDetails?.representativeRequests, undefined);
  assert.equal(cookieEvidence?.observed, true);
  assert.deepEqual(cookieEvidence?.cookieWriteEvidence, [
    {
      cookieName: "_clck",
      vendor: "Microsoft Clarity",
      category: "session_replay",
      noConsentActionObserved: true,
      initiatorUrl: "https://www.clarity.ms/tag/abc123",
      sourceRequestUrl: "https://www.clarity.ms/tag/abc123",
      timingStatus: "pre_consent",
      setBeforeConsent: true,
      cookieValueRedacted: true
    }
  ]);
  assert.deepEqual(cookieEvidence?.representativePreConsentRequests, undefined);
  assert.equal((cookieEvidence?.relatedRuntimeRequests as Array<Record<string, unknown>> | undefined)?.[0]?.preConsent, undefined);
  assert.equal((cookieEvidence?.relatedRuntimeRequests as Array<Record<string, unknown>> | undefined)?.[0]?.timingStatus, "unknown");
  assert.equal((cookieEvidence?.relatedRuntimeRequests as Array<Record<string, unknown>> | undefined)?.[0]?.evidenceRole, "related_vendor_request");
});

test("labels Bing and Clarity sync-style related runtime requests with endpoint and initiating vendors", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("third_party_cookie_pre_consent", {
      details: { family: "consent_tracking", kind: "third_party_cookie_pre_consent" },
      evidence: {
        counts: { preconsent_cookie_before_consent_count: 1 },
        entities: {
          preconsent_cookie_evidence: [
            JSON.stringify({
              cookieName: "_clsk",
              cookieInitiatorVendor: "Microsoft Clarity",
              category: "session_replay",
              initiatorUrl: "https://c.clarity.ms/c.gif",
              nonEssential: true,
              party: "third_party",
              timingEvidence: "before_consent_cookie_write"
            })
          ],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              requestUrl: "https://c.clarity.ms/c.gif",
              hostname: "c.clarity.ms",
              vendor: "Microsoft Clarity",
              category: "session_replay_sync",
              resourceType: "image",
              firstObservedMs: 3831,
              timingStatus: "pre_consent",
              runtimePhase: "pre_consent"
            })
          ],
          runtimeRequestUrls: ["https://c.bing.com/c.gif?ctsa=mr&CtsSyncId=abc", "https://c.clarity.ms/c.gif"],
          runtimeVendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.third_party_cookie_pre_consent"],
        pageUrls: ["https://www.kbdlab.io/"],
        snippets: ["Third-party cookie write was retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);
  const finding = projection.findings.find((candidate) => candidate.id === "third_party_cookie_pre_consent");
  const relatedRequests = finding?.evidenceDetails?.cookieEvidence?.relatedRuntimeRequests as Array<Record<string, unknown>> | undefined;
  const bingRequest = relatedRequests?.find((request) => `${request.url}`.includes("c.bing.com"));
  const clarityRequest = relatedRequests?.find((request) => `${request.url}`.includes("c.clarity.ms"));

  assert.equal(bingRequest?.endpointVendor, "Microsoft Advertising / Bing UET");
  assert.equal(bingRequest?.initiatingVendor, "Microsoft Clarity");
  assert.equal(bingRequest?.category, "advertising_measurement");
  assert.equal(bingRequest?.evidenceRole, "related_vendor_request");
  assert.equal(clarityRequest?.endpointVendor, "Microsoft Clarity");
  assert.equal(clarityRequest?.category, "session_replay_sync");
  assert.equal(clarityRequest?.resourceType, "image");
  assert.equal(clarityRequest?.firstSeenMs, 3831);
  assert.equal(clarityRequest?.timingStatus, "pre_consent");
  assert.equal(clarityRequest?.preConsent, true);
  assert.equal(Object.values(clarityRequest ?? {}).some((value) => value === null), false);
});

test("suppresses third-party cookie pre-consent when retained packet has no concrete pre-consent cookie write", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("third_party_cookie_pre_consent", {
      details: { family: "consent_tracking", kind: "third_party_cookie_pre_consent" },
      evidence: {
        counts: {
          preconsent_cookie_before_consent_count: 0,
          total_cookie_count: 56
        },
        entities: {
          preconsent_cookie_evidence: [
            JSON.stringify({
              category: "advertising",
              cookieName: "test_cookie",
              cookieInitiatorVendor: "DoubleClick",
              timingStatus: "pre_consent"
            })
          ],
          runtimeRequestUrls: ["https://securepubads.g.doubleclick.net/pagead/managed/js/gpt.js"],
          runtimeVendors: ["DoubleClick"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.wowhead.com/"],
        snippets: ["Tracking activity was retained before consent."],
        sourceUrls: []
      },
      severity: "high"
    })
  ]);

  assert.equal(projection.findings.some((finding) => finding.id === "third_party_cookie_pre_consent"), false);
  assert.equal(projection.topFindings.some((finding) => finding.id === "third_party_cookie_pre_consent"), false);
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
          samePageOrFlowLinked: ["true"],
          payloadExposureObserved: ["false"],
          rawValuesRetained: ["false"],
          sensitivePayloadViolations: [
            JSON.stringify({
              detectedType: "phone_detected",
              evidenceSource: "sensitive_field_third_party_tracking_correlation",
              evidenceStrength: "form_field_signal",
              matchSnippet: "intellimizeClientIp=***-***-4248",
              pageUrl: "https://example.com/contact",
              payloadExposureObserved: false,
              rawValuesRetained: false,
              requestMethod: "GET",
              requestUrl: "https://log.intellimize.co/logger",
              sameFlowLinkage: {
                fieldPageUrl: "https://example.com/contact",
                requestPageUrl: "https://example.com/contact",
                samePageOrFlow: true,
                userValueObserved: false
              },
              sourceField: "intellimizeClientIp",
              sourceLocation: "request_body",
              sourcePattern: "sensitive_field_evidence",
              vendorHost: "log.intellimize.co",
              vendorName: "Intellimize"
            })
          ],
          vendors: ["log.intellimize.co"]
        },
        fetchQuality: "thin_content",
        flags: ["commerce.high_sensitivity_data_collection_detected"],
        pageUrls: [],
        snippets: ["intellimizeClientIp=***-***-4248"],
        sourceUrls: []
      },
      severity: "medium",
      summary: "Sensitive input evidence was retained alongside third-party tracking."
    }),
    makePacket("visual_contrast_accessibility_issue", {
      confidenceBand: "high",
      details: {
        family: "accessibility",
        kind: "visual_contrast_accessibility_issue",
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
  assert.deepEqual(finding?.evidenceDetails?.sensitiveDataEvidence?.fieldTypes, ["phone"]);
  assert.deepEqual(finding?.evidenceDetails?.sensitiveDataEvidence?.thirdPartyDomains, ["log.intellimize.co"]);
  assert.equal(finding?.evidenceDetails?.sensitiveDataEvidence?.samePageOrFlowLinked, true);
  assert.equal(finding?.evidenceDetails?.sensitiveDataEvidence?.sameFlowBasis, "same_page_or_navigation_flow");
  assert.equal(finding?.evidenceDetails?.sensitiveDataEvidence?.rawValuesRetained, false);
  assert.equal(finding?.evidenceDetails?.sensitiveDataEvidence?.payloadExposureObserved, false);
  assert.equal(
    finding?.evidenceDetails?.sensitiveDataEvidence?.basis,
    "Retained sensitive input metadata was linked to third-party runtime request evidence on the same page or flow. Field values were not retained."
  );
  assert.deepEqual(finding?.evidenceDetails?.sensitiveDataEvidence?.runtimeRequestEvidence, [
    {
      requestUrl: "https://log.intellimize.co/logger",
      requestMethod: "GET",
      vendorHost: "log.intellimize.co",
      vendorName: "Intellimize",
      evidenceSource: "sensitive_field_third_party_tracking_correlation",
      evidenceStrength: "form_field_signal",
      maskingOrExclusionObserved: null,
      rawValuesRetained: false,
      payloadExposureObserved: false
    }
  ]);
  assert.deepEqual(finding?.evidenceDetails?.sensitiveDataEvidence?.sensitiveInputs, [
    {
      detectedType: "phone_detected",
      sourceField: "intellimizeClientIp",
      sourceLocation: "request_body",
      sourcePattern: "sensitive_field_evidence",
      matchSnippet: "intellimizeClientIp=***-***-4248",
      pageUrl: "https://example.com/contact",
      fieldPageUrl: "https://example.com/contact",
      requestPageUrl: "https://example.com/contact",
      samePageOrFlow: true,
      userValueObserved: false
    }
  ]);
  assert.equal(
    finding?.evidenceDetails?.sensitiveDataEvidence?.evidenceBasisType,
    "form_field_metadata_plus_runtime_request_context"
  );
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
      summary: "Sensitive input evidence was retained alongside third-party tracking."
    })
  ]);

  const lenses = buildRegulatoryLenses(projection.findings, {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 1
  });

  const gdprLens = lenses.find((lens) => lens.acronym === "GDPR / ePrivacy");
  const cpraLens = lenses.find((lens) => lens.acronym === "CCPA / CPRA / CIPA");
  const ftcLens = lenses.find((lens) => lens.acronym === "FTC");

  assert.equal(
    gdprLens?.findings.some((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"),
    false
  );
  assert.equal(gdprLens?.summary, "Sensitive-data collection and tracking exposure are the main issue.");
  assert.ok(cpraLens?.findings.some((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"));
  assert.equal(cpraLens?.summary, "Sensitive-data collection and downstream third-party exposure drive this score.");
  assert.ok(ftcLens?.findings.some((finding) => finding.id === "sensitive_data_collection_with_third_party_tracking_present"));
  assert.equal(
    ftcLens?.summary,
    "Sensitive-data collection alongside third-party tracking should be reviewed for consumer-protection context."
  );
});

test("keeps public reference evidence schema separate from runtime report evidence packets", () => {
  const referenceSample = getSampleFindingById("pre_consent_tracking_detected");
  assert.equal((referenceSample?.payload as Record<string, unknown> | undefined)?.evidenceVersion, "2.0");

  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {
          cmpVisibleMs: 0,
          firstRequestMs: 712,
          firstThirdPartyRequestMs: 1500,
          preconsentViolationCount: 2
        },
        entities: {
          runtimeRequestUrls: ["https://analytics.example/collect"],
          runtimeVendors: ["Example Analytics"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://example.com/"],
        snippets: ["Trackers fired before consent interaction."],
        sourceUrls: ["https://analytics.example/collect"]
      },
      severity: "high",
      summary: "2 third-party requests fired before any consent action."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "pre_consent_tracking_detected");

  assert.equal(finding?.evidenceVersion, "1.1");
  assert.equal(finding?.directVsInferred, "direct");
  assert.equal(projection.topFindingEligibility.pre_consent_tracking_detected?.eligibility, "top_candidate");
  assert.ok(
    projection.topFindingEligibility.pre_consent_tracking_detected?.matchedCriteria.includes("runtime_request_anchor")
  );
  assert.equal(
    projection.topFindings.find((entry) => entry.id === "pre_consent_tracking_detected")?.evidenceVersion,
    "1.1"
  );
  assert.equal("evidenceConfidence" in (finding?.evidenceDetails ?? {}), false);
  assert.equal("topFindingCalibration" in (finding?.evidenceDetails ?? {}), false);
});

test("projects pre-consent tracking when tracker requests have timeline and non-essential classification evidence", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: [],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {
          total_tracker_count: 4,
          total_vendor_count: 4,
          third_party_request_count: 37
        },
        entities: {
          consentSurfaceObserved: ["true"],
          consentActionableChoiceObserved: ["true"],
          consentTimeline: [
            JSON.stringify({
              firstCmpVisibleMs: 1200,
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 350,
              firstUserActionMs: null
            })
          ],
          preconsent_tracker_vendors: ["Google Analytics", "Google Tag Manager", "Scorecard Research", "VWO"],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              category: "analytics",
              classificationBasis: "vendor_signature",
              confidence: 0.92,
              essentiality: "non_essential",
              requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
              runtimePhase: "pre_consent",
              vendor: "Google Tag Manager"
            })
          ],
          runtimeRequestUrls: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
          runtimeVendors: ["Google Analytics", "Google Tag Manager", "Scorecard Research", "VWO"]
        },
        flags: ["privacy.preconsent_tracking_detected", "privacy.tracking_before_consent_detected", "cmp_detected"],
        pageUrls: ["https://example.com/"],
        sourceUrls: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"]
      },
      primaryPageUrl: "https://geolocation.onetrust.com/cookieconsentpub/v1/geo/location/dnsfeed",
      severity: "high",
      summary: "Tracker vendors fired before consent interaction."
    })
  ]);

  assert.ok(projection.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(projection.topFindings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  const finding = projection.findings.find((entry) => entry.id === "pre_consent_tracking_detected");
  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://example.com/");
  assert.equal(finding?.evidenceDetails?.representativeRequests?.[0]?.scannedPageUrl, "https://example.com/");
  assert.equal(finding?.evidenceDetails?.representativeRequests?.[0]?.consentSurfaceObserved, true);
});

test("keeps pre-consent tracking eligible while limiting direct vendors to retained request anchors", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: [],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: {
        family: "consent_tracking",
        kind: "preconsent_tracking",
        vendors: ["Google Tag Manager", "Meta Pixel"]
      },
      evidence: {
        counts: {
          firstThirdPartyRequestMs: 1449,
          preconsentViolationCount: 1
        },
        entities: {
          consentSurfaceObserved: ["true"],
          consentTimeline: [
            JSON.stringify({
              firstCmpVisibleMs: 0,
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 1449
            })
          ],
          preconsent_tracker_vendors: ["Google Tag Manager", "Meta Pixel"],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              category: "tag_manager",
              classificationBasis: "vendor_signature",
              confidence: 0.94,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              hostname: "www.googletagmanager.com",
              matchedSignatureId: "google_tag_manager",
              pageUrl: "https://www.caterpillar.com/",
              requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
              runtimePhase: "pre_consent",
              timestampMs: 1449,
              vendor: "Google Tag Manager",
              vendorAttributionBasis: "tracker_signature"
            })
          ],
          runtimeRequestUrls: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
          runtimeVendors: ["Google Tag Manager", "Meta Pixel"]
        },
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://www.caterpillar.com/"],
        sourceUrls: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"]
      },
      primaryPageUrl: "https://www.caterpillar.com/",
      severity: "high",
      summary: "Tracker vendors fired before consent interaction."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "pre_consent_tracking_detected");

  assert.ok(finding);
  assert.ok(projection.topFindings.some((entry) => entry.id === "pre_consent_tracking_detected"));
  assert.deepEqual(
    finding?.evidenceDetails?.directlyObservedPreConsentVendors?.map((vendor) => vendor.name),
    ["Google Tag Manager"]
  );
  assert.deepEqual(finding?.evidenceDetails?.vendors?.map((vendor) => vendor.name), ["Google Tag Manager"]);
  assert.deepEqual(
    finding?.evidenceDetails?.relatedOrInferredVendors?.map((vendor) => vendor.name),
    ["Meta Pixel"]
  );
  assert.deepEqual(finding?.evidenceDetails?.representativeRequests?.map((request) => request.vendor), [
    "Google Tag Manager"
  ]);
  assert.equal(finding?.evidenceDetails?.vendorEvidenceCompleteness?.vendorDisplayLimitedToAnchoredEvidence, true);
  assert.equal(finding?.evidenceDetails?.vendorEvidenceCompleteness?.representativeRequestsCapped, false);
  assert.equal(finding?.evidenceDetails?.vendorEvidenceCompleteness?.directVendorAnchorsOmittedFromPublicPacket, false);
  assert.equal(finding?.evidenceDetails?.vendorEvidenceCompleteness?.someVendorAnchorsOmittedFromPublicPacket, false);
  assert.equal(finding?.evidenceDetails?.vendorEvidenceCompleteness?.relatedVendorAttributionLimitedByAnchors, true);
  assert.match(finding?.evidencePreview?.join(" ") ?? "", /Google Tag Manager/);
  assert.doesNotMatch(finding?.evidencePreview?.join(" ") ?? "", /Meta Pixel/);
});

test("projects first-party proxy pre-consent tracker evidence without using request URL as scan context", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: [],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: {
          preconsentViolationCount: 1
        },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 5936
            })
          ],
          preconsent_tracker_vendors: ["TikTok Pixel", "Google Tag Manager"],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              category: "advertising",
              classificationBasis: "consent_audit_tracker_evidence_url",
              collectionEndpointType: "first_party_collection_proxy",
              confidence: 0.9,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "first_party",
              matchedSignatureId: "tiktok_pixel",
              pageUrl: "https://www.sony.com/en/",
              requestUrl: "https://www.sony.com/akam/13/pixel_18c7aede",
              runtimePhase: "pre_consent",
              timestampMs: 5936,
              vendor: "TikTok Pixel",
              vendorAttributionBasis: "tracker_signature"
            })
          ],
          runtimeRequestUrls: ["https://www.sony.com/akam/13/pixel_18c7aede"],
          runtimeVendors: ["TikTok Pixel", "Google Tag Manager"]
        },
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: [],
        sourceUrls: ["https://www.sony.com/akam/13/pixel_18c7aede"]
      },
      primaryPageUrl: "https://www.sony.com/akam/13/pixel_18c7aede",
      severity: "high",
      summary: "Tracker vendors fired before consent interaction."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "pre_consent_tracking_detected");
  const representativeRequest = finding?.evidenceDetails?.representativeRequests?.[0];

  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.sony.com/en/");
  assert.equal(representativeRequest?.requestUrl, "https://www.sony.com/akam/13/pixel_18c7aede");
  assert.equal(representativeRequest?.collectionEndpointType, "first_party_collection_proxy");
  assert.equal(representativeRequest?.firstPartyOrThirdParty, "first_party");
  assert.equal(representativeRequest?.firstPartyProxyObserved, true);
  assert.equal(representativeRequest?.proxiedVendor, "TikTok Pixel");
  assert.equal(representativeRequest?.matchedSignatureId, "tiktok_pixel");
  assert.deepEqual((finding?.evidenceDetails?.representativeRequests ?? []).map((request) => request.vendor), ["TikTok Pixel"]);
});

test("orders direct adtech anchors before first-party proxy anchors and reads redacted query keys", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      concernContext: {
        assertionLevels: ["strong"],
        evidenceStrengthFlags: ["direct_runtime"],
        externalSurfacingEligibilities: ["eligible"],
        negativeEvidenceFlags: [],
        originTypes: ["snapshot_signal"],
        promotionEligibilities: ["eligible"]
      },
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: { preconsentViolationCount: 5 },
        entities: {
          consentTimeline: [
            JSON.stringify({
              firstConsentActionMs: null,
              firstNonEssentialRequestMs: 1340
            })
          ],
          preconsent_tracker_vendors: ["Meta Pixel", "Google Ads", "Segment", "AppNexus / Xandr", "The Trade Desk"],
          requestPurposeClassificationConfidence: [
            JSON.stringify({
              category: "advertising",
              collectionEndpointType: "first_party_collection_proxy",
              confidence: 0.9,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "first_party",
              matchedSignatureId: "meta_pixel",
              pageUrl: "https://www.latimes.com/",
              requestUrl: "https://libs.platform.latimes.com/reg/tribune/latspot.min.js",
              runtimePhase: "pre_consent",
              timestampMs: 1340,
              vendor: "Meta Pixel",
              vendorAttributionBasis: "tracker_signature"
            }),
            JSON.stringify({
              category: "advertising",
              collectionEndpointType: "direct_third_party",
              confidence: 0.9,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              matchedSignatureId: "google_ads",
              pageUrl: "https://www.latimes.com/",
              requestUrl: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
              runtimePhase: "pre_consent",
              timestampMs: 1342,
              vendor: "Google Ads",
              vendorAttributionBasis: "tracker_signature"
            }),
            JSON.stringify({
              category: "analytics",
              collectionEndpointType: "first_party_collection_proxy",
              confidence: 0.9,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "first_party",
              matchedSignatureId: "segment",
              pageUrl: "https://www.latimes.com/",
              requestUrl: "https://edge.platform.latimes.com/v1/personalize [query_redacted=true query_keys=meterKey,productCode,contentType,paywallTier,pxlId,exp]",
              runtimePhase: "pre_consent",
              timestampMs: 1704,
              vendor: "Segment",
              vendorAttributionBasis: "tracker_signature"
            }),
            JSON.stringify({
              category: "advertising",
              collectionEndpointType: "direct_third_party",
              confidence: 0.9,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              matchedSignatureId: "xandr",
              pageUrl: "https://www.latimes.com/",
              requestUrl: "https://ib.adnxs.com/getuidj [query_redacted=true query_keys=gdpr]",
              runtimePhase: "pre_consent",
              timestampMs: 2639,
              vendor: "AppNexus / Xandr",
              vendorAttributionBasis: "tracker_signature"
            }),
            JSON.stringify({
              category: "advertising",
              collectionEndpointType: "direct_third_party",
              confidence: 0.9,
              essentiality: "non_essential",
              firstPartyOrThirdParty: "third_party",
              matchedSignatureId: "the_trade_desk",
              pageUrl: "https://www.latimes.com/",
              requestUrl: "https://match.adsrvr.org/track/cmf/generic [query_redacted=true query_keys=ttd_pid,ttd_tpi,ttd_puid,gdpr]",
              runtimePhase: "pre_consent",
              timestampMs: 2734,
              vendor: "The Trade Desk",
              vendorAttributionBasis: "tracker_signature"
            })
          ],
          runtimeRequestUrls: [
            "https://libs.platform.latimes.com/reg/tribune/latspot.min.js",
            "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
            "https://edge.platform.latimes.com/v1/personalize [query_redacted=true query_keys=meterKey,productCode,contentType,paywallTier,pxlId,exp]",
            "https://ib.adnxs.com/getuidj [query_redacted=true query_keys=gdpr]",
            "https://match.adsrvr.org/track/cmf/generic [query_redacted=true query_keys=ttd_pid,ttd_tpi,ttd_puid,gdpr]"
          ],
          runtimeVendors: ["Meta Pixel", "Google Ads", "Segment", "AppNexus / Xandr", "The Trade Desk"]
        },
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: [],
        sourceUrls: ["https://edge.platform.latimes.com/v1/personalize [query_redacted=true query_keys=meterKey,productCode,contentType,paywallTier,pxlId,exp]"]
      },
      primaryPageUrl: "https://edge.platform.latimes.com/v1/personalize [query_redacted=true query_keys=meterKey,productCode,contentType,paywallTier,pxlId,exp]",
      severity: "high",
      summary: "Tracker vendors fired before consent interaction."
    })
  ]);

  const finding = projection.findings.find((entry) => entry.id === "pre_consent_tracking_detected");
  const representativeRequests = finding?.evidenceDetails?.representativeRequests ?? [];

  assert.equal(finding?.evidenceDetails?.scanContext?.pageUrl, "https://www.latimes.com/");
  assert.deepEqual(representativeRequests.slice(0, 3).map((request) => request.vendor), [
    "Google Ads",
    "AppNexus / Xandr",
    "The Trade Desk"
  ]);
  assert.deepEqual(representativeRequests[2]?.queryKeysSample, ["ttd_pid", "ttd_tpi", "ttd_puid", "gdpr"]);
  assert.equal(representativeRequests[2]?.identifierLike, true);
  assert.equal(finding?.evidenceDetails?.counts?.identifierLikeRequests, 2);
  assert.ok((finding?.shortSummary ?? "").includes("Google Ads, AppNexus / Xandr, and The Trade Desk"));
});
