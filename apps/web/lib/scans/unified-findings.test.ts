import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnifiedFindingDisplayPackets,
  buildUnifiedFindingPackets,
  getUnifiedFindingCategoryRelation,
  getUnifiedFindingOwnerCategoryId,
  type UnifiedFindingCandidate
} from "./unified-findings";
import { ADA_ACCESSIBILITY_FIXTURES } from "./ada-accessibility.fixtures";
import { buildMergedSignalRecords } from "./merged-signals";
import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";
import { buildSanitizedNetworkEvidenceAuditRecord } from "./sanitized-network-evidence";
import type { ScanValidationFinding } from "./validation-review-linking";

function makeValidationFinding(
  input: Partial<ScanValidationFinding> & Pick<ScanValidationFinding, "id" | "ruleKey" | "title">
): ScanValidationFinding {
  return {
    agreementScore: null,
    category: null,
    description: null,
    evidence: null,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    model: null,
    modelConfidence: null,
    pageUrl: null,
    promptVersion: null,
    rationale: null,
    severity: null,
    subtype: null,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    verdict: null,
    ...input
  };
}

test("collapses signal, issue, and validation sources into one unified finding packet", () => {
  const linkedValidation = makeValidationFinding({
    id: "val-1",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    title: "Trackers observed before consent",
    evidence: {
      consentTimeline: {
        firstCmpVisibleMs: 600,
        firstConsentActionMs: 1200,
        firstNonEssentialRequestMs: 100
      },
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.95,
          essentiality: "non_essential",
          requestUrl: "https://example.com/collect"
        }
      ],
      runtimeVendors: ["Example Analytics"]
    }
  });

  const candidates: UnifiedFindingCandidate[] = [
    {
      description: "Observed before a clear user choice was made.",
      fallbackEvidence: {
        signalKey: "privacy.preconsent_tracking_detected",
        signalValue: true
      },
      linkedValidationFinding: linkedValidation,
      observedValue: "Yes",
      severity: "high",
      signalKey: "privacy.preconsent_tracking_detected",
      signalLabel: "Pre-consent tracking detected",
      signalSource: "snapshot_signal",
      sourceType: "signal",
      title: "Pre-consent tracking detected"
    },
    {
      description: "The first page render triggered tracking activity before a consent interaction was completed.",
      evidence: ["https://example.com/collect"],
      observedValue: "high severity",
      severity: "high",
      sourceType: "issue",
      title: "Trackers fired before consent interaction"
    }
  ];

  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [linkedValidation]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0]?.unifiedFindingId, "preconsent_tracking");
  assert.equal(packets[0]?.severity, "high");
  assert.equal(packets[0]?.confidenceBand, "high");
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "signal"));
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "issue"));
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "validation"));
  assert.equal(packets[0]?.confidenceInputs.validationCount, 1);
  assert.equal(packets[0]?.confidenceInputs.hasStructuredValidationEvidence, true);
  assert.equal(packets[0]?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.deepEqual(
    packets[0]?.concernContext?.originTypes.sort(),
    ["compatibility_signal", "snapshot_signal", "validation_rule"]
  );
  assert.ok(packets[0]?.concernContext?.assertionLevels.some((level) => level === "moderate" || level === "strong"));
});

test("hash-only sanitized network evidence does not create direct runtime uplift", () => {
  const [packet] = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "Observed before a clear user choice was made.",
        fallbackEvidence: {
          sanitizedNetworkEvidence: buildSanitizedNetworkEvidenceAuditRecord({
            entries: [],
            summary: {
              preconsent: {
                requestCount: 0
              }
            }
          }),
          signalKey: "privacy.preconsent_tracking_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: []
  });

  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, false);
  assert.ok(packet?.evidence?.flags?.includes("sanitized_network_evidence_hashed"));
});

test("blocking overlay evidence stays contextual with retained consent controls", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed intrusive or blocking runtime behavior that may interfere with normal page use.",
        fallbackEvidence: {
          hybridConsentSummary: {
            acceptPresent: true,
            bannerPresent: true,
            closePresent: true,
            cmpVendor: "OneTrust",
            managePresent: true,
            pageInteractionBlocked: true,
            rejectPresent: true
          },
          hybridUiSummary: {
            firstVisibleMs: 320,
            forcedActionRequired: false,
            overlayDetected: true,
            scrollLocked: true,
            viewportCoveragePercent: 82
          },
          overlay_blocking_detected: true,
          signalKey: "privacy.overlay_blocking_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.overlay_blocking_detected",
        signalLabel: "Overlay blocking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Overlay blocking detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const [packet] = packets;

  assert.equal(packet?.unifiedFindingId, "blocking_overlay_observed");
  assert.equal(packet?.surfacingDecision.decisionState, "support_only");
  assert.equal(packet?.surfacingDecision.reportLane, "confidence_and_coverage");
  assert.ok(packet?.evidence?.flags?.includes("blocking_overlay_observed"));
  assert.deepEqual(packet?.evidence?.entities?.blockingOverlayType, ["consent_modal"]);
  assert.deepEqual(packet?.evidence?.entities?.rejectDepthClass, ["same_layer"]);
  assert.deepEqual(packet?.evidence?.entities?.overlayVendors, ["OneTrust"]);
  assert.ok(packet?.evidence?.snippets?.some((snippet) => /common, but it increases concern/i.test(snippet)));
});

test("resolves validation-backed unified findings without a direct signal candidate", () => {
  const validationFinding = makeValidationFinding({
    id: "val-2",
    description: "No transfer mechanism was noted in the policy text.",
    ruleKey: "section_review.no_transfer_mechanism_noted",
    severity: "medium",
    title: "No transfer mechanism noted"
  });

  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0]?.unifiedFindingId, "missing_transfer_disclosure");
  assert.equal(packets[0]?.severity, "medium");
  assert.equal(packets[0]?.confidenceBand, "high");
  assert.equal(packets[0]?.confidenceInputs.validationCount, 1);
});

test("resolves financial-review validation findings into the matching unified finding packet", () => {
  const validationFinding = makeValidationFinding({
    id: "val-fin-1",
    description: "The scan retained explicit fee disclosure text on a public-facing pricing or offer page.",
    evidence: {
      financialJudgeVerdict: {
        buyerFacingEligible: false,
        confidence: 0.58,
        evidenceStrength: "moderate",
        rationaleCode: "thin_single_source_evidence",
        retained: true,
        verdict: "keep_audit_only"
      },
      matchedPhrase: "monthly fee",
      matchedSnippet: "A monthly fee of $25 applies to premium managed accounts.",
      pageClassification: "pricing_or_fees",
      pageType: "pricing_page",
      pageUrl: "https://www.example.com/pricing",
      policySnippets: ["A monthly fee of $25 applies to premium managed accounts."],
      signalKey: "commercial.explicit_fee_disclosure_text_present",
      sourceUrls: ["https://www.example.com/pricing"],
      supportingSignals: ["commercial.explicit_fee_disclosure_text_present"],
      unifiedFindingId: "fee_disclosure_present"
    },
    pageUrl: "https://www.example.com/pricing",
    ruleKey: "financial_review.fee_disclosure_present",
    severity: "medium",
    title: "Fee disclosure present",
    verdict: "inconclusive"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "fee_disclosure_present");
  assert.equal(packet?.linkedValidationFinding?.ruleKey, "financial_review.fee_disclosure_present");
  assert.notEqual(packet?.presentationDecision.status, "surface");
});

test("routes corpus-derived financial claim findings through normalized concerns before surfacing", () => {
  const corpusDerivedFindingIds = [
    "financial_urgency_pressure_tactic_detected",
    "simulated_performance_without_disclosure",
    "unqualified_superlative_claim_detected"
  ] as const;

  for (const findingId of corpusDerivedFindingIds) {
    const validationFinding = makeValidationFinding({
      id: `val-${findingId}`,
      description: "The financial claims corpus retained a buyer-facing financial-promotion claim with page evidence.",
      evidence: {
        adjacentDisclosurePresent: false,
        claimText: "Earn 6 figures in 90 days with our trading signals.",
        confidence: 0.82,
        matchedPhrase: "Earn 6 figures in 90 days",
        matchedSnippet: "Earn 6 figures in 90 days with our trading signals.",
        pageClassification: "financial_offer",
        pageType: "lead_generation_offer",
        pageUrl: "https://www.example.com/signals",
        policySnippets: ["Earn 6 figures in 90 days with our trading signals."],
        sourceUrls: ["https://www.example.com/signals"],
        supportingHeadings: ["Trading signal performance"],
        supportingSignals: ["financial.performance_claim_text_present"],
        unifiedFindingId: findingId
      },
      pageUrl: "https://www.example.com/signals",
      ruleKey: `financial_review.${findingId}`,
      severity: "high",
      title: findingId
    });

    const [packet] = buildUnifiedFindingDisplayPackets({
      reviewFindingCandidates: [],
      validationFindings: [validationFinding],
      validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
    });

    assert.equal(packet?.unifiedFindingId, findingId);
    assert.equal(packet?.concernContext?.originTypes.includes("validation_rule"), true, findingId);
    assert.equal(packet?.concernContext?.promotionEligibilities.includes("eligible"), true, findingId);
    assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), true, findingId);
    assert.equal(packet?.sourceRefs.some((sourceRef) => sourceRef.kind === "validation"), true, findingId);
    assert.equal(packet?.presentationDecision.status, "surface", findingId);
    assert.equal(packet?.surfacingDecision.decisionState, "confirmed", findingId);
    assert.ok(packet?.surfacingDecision.appliedRules.includes("evidence.financial.confirmed_negative_risk_with_backing"), findingId);
  }
});

test("blocks raw high-risk financial product signals without offer context", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Options or futures language present.",
        fallbackEvidence: {
          signalKey: "financial.options_or_futures_language_present",
          signalLabel: "Options or futures language present",
          signalValue: true
        },
        observedValue: "Options or futures language present",
        severity: "medium",
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Options or futures language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packets.some((packet) => packet.unifiedFindingId === "leveraged_or_high_risk_product_promotion"),
    false
  );
});

test("does not surface retired raw high-risk financial product signals with offer context", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Options or futures language present.",
        fallbackEvidence: {
          matchedSnippet: "Trade options and futures with margin on our professional investing platform.",
          pageClassification: "financial_offer",
          pageType: "financial_offer",
          pageUrl: "https://example.com/trading/options",
          signalKey: "financial.options_or_futures_language_present",
          signalLabel: "Options or futures language present",
          signalValue: true
        },
        observedValue: "Options or futures language present",
        severity: "medium",
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Options or futures language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packets.some((packet) => packet.unifiedFindingId === "leveraged_or_high_risk_product_promotion"),
    false
  );
});

test("blocks derivatives signals on sportsbook from surfacing as high-risk product promotion", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Options or futures language present.",
        fallbackEvidence: {
          matchedSnippet: "Explore betting options and NFL futures odds on our sportsbook.",
          pageClassification: "financial_offer",
          pageType: "financial_offer",
          pageUrl: "https://example.com/sportsbook",
          signalKey: "financial.options_or_futures_language_present",
          signalLabel: "Options or futures language present",
          signalValue: true
        },
        observedValue: "Options or futures language present",
        severity: "medium",
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Options or futures language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packets.some((p) => p.unifiedFindingId === "leveraged_or_high_risk_product_promotion"),
    false
  );
});

test("surfaces derivatives signals with true financial context as high-risk product promotion", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Perpetuals or derivatives language present.",
        fallbackEvidence: {
          matchedSnippet: "Perpetual swaps with underlying crypto assets and hedging on our derivatives exchange.",
          pageClassification: "financial_offer",
          pageType: "financial_offer",
          pageUrl: "https://example.com/trading/perps",
          signalKey: "financial.perpetuals_or_derivatives_language_present",
          signalLabel: "Perpetuals or derivatives language present",
          signalValue: true
        },
        observedValue: "Perpetuals or derivatives language present",
        severity: "medium",
        signalKey: "financial.perpetuals_or_derivatives_language_present",
        signalLabel: "Perpetuals or derivatives language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Perpetuals or derivatives language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.notEqual(packet?.unifiedFindingId, "leveraged_or_high_risk_product_promotion");
  assert.notEqual(packet?.presentationDecision.status, "surface");
});

test("surfaces bare-word financial signal when domain macro enrichment indicates finance industry", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Options or futures language present.",
        fallbackEvidence: {
          domainIndustryPrimary: "finance",
          matchedSnippet: "We offer options regarding personal information.",
          signalKey: "financial.options_or_futures_language_present",
          signalLabel: "Options or futures language present",
          signalValue: true
        },
        observedValue: "Options or futures language present",
        severity: "medium",
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Options or futures language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.notEqual(packet?.unifiedFindingId, "leveraged_or_high_risk_product_promotion");
  assert.notEqual(packet?.presentationDecision.status, "surface");
});

test("surfaces bare-word financial signal when domain macro enrichment indicates investor promotion", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Perpetuals or derivatives language present.",
        fallbackEvidence: {
          investorOrSecuritiesPromotion: true,
          matchedSnippet: "Future updates will include new features.",
          signalKey: "financial.perpetuals_or_derivatives_language_present",
          signalLabel: "Perpetuals or derivatives language present",
          signalValue: true
        },
        observedValue: "Perpetuals or derivatives language present",
        severity: "medium",
        signalKey: "financial.perpetuals_or_derivatives_language_present",
        signalLabel: "Perpetuals or derivatives language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Perpetuals or derivatives language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.notEqual(packet?.unifiedFindingId, "leveraged_or_high_risk_product_promotion");
  assert.notEqual(packet?.presentationDecision.status, "surface");
});

test("blocks bare-word financial signal on non-financial domain without offer context", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Options or futures language present.",
        fallbackEvidence: {
          domainIndustryPrimary: "ecommerce",
          matchedSnippet: "We offer options regarding personal information.",
          signalKey: "financial.options_or_futures_language_present",
          signalLabel: "Options or futures language present",
          signalValue: true
        },
        observedValue: "Options or futures language present",
        severity: "medium",
        signalKey: "financial.options_or_futures_language_present",
        signalLabel: "Options or futures language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Options or futures language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packets.some((p) => p.unifiedFindingId === "leveraged_or_high_risk_product_promotion"),
    false
  );
});

test("blocks gambling section-review issue without offer evidence", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scanned surface appears to be a sports betting or gambling product. High-risk product marketing should keep age eligibility, responsible-gambling help, bonus terms, and material offer restrictions close to promotional claims.",
        fallbackEvidence: {
          familyPacketFindingId: "high_risk_product_risk_disclosure_missing",
          matchedSnippet:
            "Sports betting or gambling context detected. High-risk product marketing should keep age eligibility, responsible-gambling help, bonus terms, and material offer restrictions close to promotional claims.",
          offerSnippets: [],
          pageClassification: "financial_offer",
          pageType: "financial_offer",
          pageUrl: "https://www.draftkings.com/",
          policySnippets: [
            "Sports betting or gambling context detected. High-risk product marketing should keep age eligibility, responsible-gambling help, bonus terms, and material offer restrictions close to promotional claims."
          ],
          sectionReviewIssue: true,
          sensitive_context_label: "sports betting or gambling site",
          supportingSignals: [
            "financial.high_risk_product_promotion",
            "commercial.gambling_or_sportsbook_context_detected"
          ]
        },
        observedValue: "https://www.draftkings.com/",
        severity: "medium",
        sourceType: "issue",
        title: "High-risk gambling promotion disclosure review"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((p) => p.unifiedFindingId === "high_risk_product_risk_disclosure_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("surfaces gambling section-review issue with offer evidence through high-risk product unified finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "Sportsbook offer language was observed: \"Get $1,000 in bonus bets when you sign up.\" Clear nearby responsible-gambling and terms evidence was not retained with the offer snippet.",
        fallbackEvidence: {
          familyPacketFindingId: "high_risk_product_risk_disclosure_missing",
          matchedSnippet: "Get $1,000 in bonus bets when you sign up.",
          offerSnippets: ["Get $1,000 in bonus bets when you sign up."],
          pageClassification: "financial_offer",
          pageType: "financial_offer",
          pageUrl: "https://www.draftkings.com/",
          policySnippets: ["Get $1,000 in bonus bets when you sign up."],
          primaryOfferSnippet: "Get $1,000 in bonus bets when you sign up.",
          responsibleGamblingDisclosureAdjacent: false,
          sectionReviewIssue: true,
          sensitive_context_label: "sports betting or gambling site",
          supportingSignals: [
            "financial.high_risk_product_promotion",
            "commercial.gambling_or_sportsbook_context_detected"
          ],
          termsDisclosureAdjacent: false
        },
        observedValue: "Get $1,000 in bonus bets when you sign up.",
        severity: "medium",
        sourceType: "issue",
        title: "High-risk gambling promotion disclosure review"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "high_risk_product_risk_disclosure_missing");
  assert.equal(packet?.concernContext?.originTypes.includes("section_review"), true);
  assert.equal(packet?.concernContext?.promotionEligibilities.includes("eligible"), true);
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps direct runtime findings surfaced under thin coverage", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    coverageSummary: {
      legalCoverageScore: 0,
      pagesScanned: 1,
      policyEnrichmentCount: 0,
      verifiedPublicSurfacesCount: 0
    },
    reviewFindingCandidates: [
      {
        description: "The homepage triggered tracking before any consent action.",
        fallbackEvidence: {
          consentTimeline: {
            firstCmpVisibleMs: 600,
            firstConsentActionMs: 1200,
            firstNonEssentialRequestMs: 100
          },
          requestPurposeClassificationConfidence: [
            {
              confidence: 0.95,
              essentiality: "non_essential",
              requestUrl: "https://example.com/collect"
            }
          ],
          runtimeVendors: ["Example Analytics"],
          signalKey: "privacy.preconsent_tracking_detected",
          signalValue: true,
          sourceUrls: ["https://example.com/collect"]
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "preconsent_tracking");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("downgrades absence-style findings under thin coverage", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    coverageSummary: {
      legalCoverageScore: 0,
      pagesScanned: 1,
      policyEnrichmentCount: 0,
      verifiedPublicSurfacesCount: 0
    },
    reviewFindingCandidates: [
      {
        description: "No accessibility support path was detected in the scanned coverage.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_support_path_missing",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "accessibility.accessibility_support_path_missing",
        signalLabel: "Accessibility support path missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility support path missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_missing");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("audit_only"), true);
});

test("suppresses missing-surface packets when a stronger positive surface is already present", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "No privacy contact path was detected in the scanned coverage.",
        fallbackEvidence: {
          signalKey: "privacy.privacy_contact_channel_missing",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.privacy_contact_channel_missing",
        signalLabel: "Privacy contact path missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy contact path missing"
      },
      {
        description: "The privacy policy includes a privacy request contact path.",
        evidence: ["https://example.com/privacy"],
        fallbackEvidence: {
          policySnippet: "Contact us at privacy@example.com for privacy requests.",
          signalKey: "privacy.privacy_contact_path_present",
          signalValue: true,
          sourceUrl: "https://example.com/privacy",
          sourceUrls: ["https://example.com/privacy"]
        },
        observedValue: "privacy@example.com",
        severity: "low",
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalSource: "document_semantic_signal",
        sourceType: "signal",
        title: "Privacy contact path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(
    packets.map((packet) => packet.unifiedFindingId),
    ["privacy_contact_path_present"]
  );
});

test("suppresses missing-surface packets when the positive surface only has page-url attribution", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "No privacy contact path was detected in the scanned coverage.",
        fallbackEvidence: {
          signalKey: "privacy.privacy_contact_channel_missing",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.privacy_contact_channel_missing",
        signalLabel: "Privacy contact path missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy contact path missing"
      },
      {
        description: "The privacy policy includes a privacy request contact path.",
        evidence: ["https://example.com/privacy"],
        fallbackEvidence: {
          policySnippet: "Contact us at privacy@example.com for privacy requests.",
          signalKey: "privacy.privacy_contact_path_present",
          signalLabel: "Privacy contact path present",
          signalValue: true
        },
        observedValue: "privacy@example.com",
        severity: "low",
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalSource: "document_semantic_signal",
        sourceType: "signal",
        title: "Privacy contact path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(
    packets.map((packet) => packet.unifiedFindingId),
    ["privacy_contact_path_present"]
  );
});

test("surfaces privacy-control unified findings from finding-family packets before legacy signal reconstruction", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center",
                  snippet: "Manage Cookies and Your Privacy Choices",
                  supportedSurfaceTypes: ["cookie_policy_or_settings", "privacy_choices"],
                  title: "Privacy Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy_or_settings"]
                },
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "targeted_advertising_choices_present",
                  reason: "Verified privacy-controls evidence includes privacy choices or opt-out language.",
                  sourceSurfaceTypes: ["privacy_choices"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const cookiePacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_present");
  const choicesPacket = packets.find((packet) => packet.unifiedFindingId === "targeted_advertising_choices_present");

  assert.ok(cookiePacket);
  assert.ok(choicesPacket);
  assert.equal(cookiePacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(choicesPacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(cookiePacket?.presentationDecision.status, "audit_only");
  assert.equal(choicesPacket?.presentationDecision.status, "audit_only");
  assert.ok(cookiePacket?.evidence?.snippets?.includes("Manage Cookies and Your Privacy Choices"));
  assert.ok(choicesPacket?.evidence?.snippets?.includes("Manage Cookies and Your Privacy Choices"));
});

test("prefers family-packet candidates over legacy signal candidates for the same packetized finding", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Legacy signal-based cookie policy finding.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/legacy-cookie",
          policyPageType: "cookie_policy",
          signalKey: "disclosure.cookie_policy_present",
          signalValue: true
        },
        linkedValidationFinding: null,
        observedValue: "Legacy Cookie Policy",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie Policy"
      }
    ],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center",
                  snippet: "Manage Cookies and Your Privacy Choices",
                  supportedSurfaceTypes: ["cookie_policy_or_settings"],
                  title: "Privacy Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy_or_settings"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const cookiePacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_present");

  assert.ok(cookiePacket);
  assert.equal(cookiePacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(cookiePacket?.sourceRefs.some((sourceRef) => sourceRef.kind === "signal"), false);
  assert.ok(cookiePacket?.evidence?.pageUrls?.includes("https://www.example.com/privacy-center"));
  assert.equal(cookiePacket?.evidence?.pageUrls?.includes("https://www.example.com/legacy-cookie"), false);
});

test("surfaces privacy-rights unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center",
                  snippet: "You may request access to, deletion of, or correction of your personal information.",
                  supportedSurfaceTypes: ["privacy_rights_dsar"],
                  title: "Privacy Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center"],
                  findingId: "privacy_rights_path_present",
                  reason: "Verified privacy-controls evidence includes rights-request language.",
                  sourceSurfaceTypes: ["privacy_rights_dsar"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const rightsPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_rights_path_present");

  assert.ok(rightsPacket);
  assert.equal(rightsPacket?.primaryPageUrl, "https://www.example.com/privacy-center");
  assert.equal(rightsPacket?.presentationDecision.status, "surface");
  assert.ok(
    rightsPacket?.evidence?.snippets?.includes(
      "You may request access to, deletion of, or correction of your personal information."
    )
  );
});

test("sanitizes packet-backed privacy-rights evidence to prefer canonical non-root urls", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-center/rights",
                  snippet: "Submit a rights request here.",
                  supportedSurfaceTypes: ["privacy_rights_dsar"],
                  supportingRefs: [
                    { url: "https://www.example.com/", refType: "link_text", text: "Privacy", verified: true },
                    {
                      url: "https://privacyportal.onetrust.com/webform/abc",
                      refType: "link_text",
                      text: "Request Form",
                      verified: true
                    }
                  ],
                  title: "Privacy Rights Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-center/rights"],
                  findingId: "privacy_rights_path_present",
                  reason: "Verified privacy-controls evidence includes rights-request language.",
                  sourceSurfaceTypes: ["privacy_rights_dsar"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const rightsPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_rights_path_present");

  assert.ok(rightsPacket);
  assert.deepEqual(rightsPacket?.evidence?.pageUrls, ["https://www.example.com/privacy-center/rights"]);
  assert.deepEqual(rightsPacket?.evidence?.sourceUrls, ["https://www.example.com/privacy-center/rights"]);
});

test("surfaces children-privacy unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "sensitive_context",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-for-children",
                  snippet: "We do not knowingly collect personal information from children under 13.",
                  supportedSurfaceTypes: ["children_privacy"],
                  title: "Children's Privacy Notice"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-for-children"],
                  findingId: "children_privacy_disclosure_present",
                  reason: "Verified sensitive-context evidence includes explicit children's privacy or under-13 disclosure language.",
                  sourceSurfaceTypes: ["children_privacy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((entry) => entry.unifiedFindingId === "children_privacy_disclosure_present");

  assert.ok(packet);
  assert.equal(packet?.primaryPageUrl, "https://www.example.com/privacy-for-children");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/privacy-for-children"]);
  assert.ok(packet?.evidence?.snippets?.includes("We do not knowingly collect personal information from children under 13."));
});

test("surfaces GPC failures from runtime privacy family packets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "runtime_privacy_observability",
              canonicalTargets: [],
              supportedUnifiedFindings: [
                {
                  evidencePayload: {
                    gpcVerification: {
                      status: "ignored",
                      baselineTrackerCount: 3,
                      baselineThirdPartyCookieCount: 4,
                      gpcTrackerCount: 3,
                      gpcThirdPartyCookieCount: 4,
                      trackerCountDelta: 0,
                      thirdPartyCookieCountDelta: 0,
                      evidenceUrls: ["https://example.com/collect"]
                    },
                    sourceUrls: ["https://example.com/collect"]
                  },
                  evidenceUrls: ["https://example.com/collect"],
                  findingId: "gpc_signal_not_honored",
                  reason: "Runtime privacy observability retained a browser-level GPC verification result showing the signal was ignored.",
                  sourceSurfaceTypes: []
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "gpc_signal_not_honored");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://example.com/collect"]);
  assert.equal(packet?.evidence?.counts?.gpcTrackerCount, 3);
});

test("surfaces support-access unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "support_access",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/help",
                  fetchQuality: "verified_content",
                  snippet: "Help Center and Accessibility Support",
                  supportedSurfaceTypes: ["contact_support", "accessibility_support"],
                  title: "Help Center"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/help"],
                  findingId: "contact_support_path_present",
                  reason: "Verified support-access evidence includes help, contact, or feedback language.",
                  sourceSurfaceTypes: ["contact_support"]
                },
                {
                  evidenceUrls: ["https://www.example.com/help"],
                  findingId: "accessibility_support_path_present",
                  reason: "Verified support-access evidence includes accessibility, captioning, or accommodation language.",
                  sourceSurfaceTypes: ["accessibility_support"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const contactPacket = packets.find((packet) => packet.unifiedFindingId === "contact_support_path_present");
  const accessibilityPacket = packets.find((packet) => packet.unifiedFindingId === "accessibility_support_path_present");

  assert.ok(contactPacket);
  assert.ok(accessibilityPacket);
  assert.equal(contactPacket?.primaryPageUrl, "https://www.example.com/help");
  assert.equal(accessibilityPacket?.primaryPageUrl, "https://www.example.com/help");
  assert.equal(contactPacket?.presentationDecision.status, "audit_only");
  assert.equal(accessibilityPacket?.presentationDecision.status, "audit_only");
  assert.equal(contactPacket?.evidence?.fetchQuality, "verified_content");
  assert.ok(contactPacket?.evidence?.snippets?.includes("Help Center and Accessibility Support"));
  assert.ok(accessibilityPacket?.evidence?.snippets?.includes("Help Center and Accessibility Support"));
});

test("surfaces legal-core unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "legal_core",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy",
                  snippet: "Privacy Policy",
                  supportedSurfaceTypes: ["privacy_policy"],
                  title: "Privacy Policy"
                },
                {
                  canonicalUrl: "https://www.example.com/terms",
                  snippet: "Terms and Conditions",
                  supportedSurfaceTypes: ["terms_of_service"],
                  title: "Terms and Conditions"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy"],
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
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const privacyPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_policy_present");
  const termsPacket = packets.find((packet) => packet.unifiedFindingId === "terms_of_service_present");

  assert.ok(privacyPacket);
  assert.ok(termsPacket);
  assert.equal(privacyPacket?.primaryPageUrl, "https://www.example.com/privacy");
  assert.equal(termsPacket?.primaryPageUrl, "https://www.example.com/terms");
  assert.equal(privacyPacket?.presentationDecision.status, "audit_only");
  assert.equal(termsPacket?.presentationDecision.status, "audit_only");
  assert.ok(privacyPacket?.evidence?.snippets?.includes("Privacy Policy"));
  assert.ok(termsPacket?.evidence?.snippets?.includes("Terms and Conditions"));
});

test("synthesizes surface integrity findings from family-packet legal targets with mismatched titles", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "legal_core",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-policy",
                  fetchQuality: "verified_content",
                  snippet: "Privacy Policy for Example Co.",
                  supportedSurfaceTypes: ["privacy_policy"],
                  title: "Affiliate Disclosure | Example Co."
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-policy"],
                  findingId: "privacy_policy_present",
                  reason: "Verified legal-core evidence includes a privacy policy or privacy notice surface.",
                  sourceSurfaceTypes: ["privacy_policy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const mismatchPacket = packets.find((packet) => packet.unifiedFindingId === "surface_title_mismatch");
  const privacyPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_policy_present");

  assert.equal(mismatchPacket?.presentationDecision.status, "surface");
  assert.equal(privacyPacket?.presentationDecision.status, "audit_only");
  assert.equal(privacyPacket?.observedValue, "Privacy Policy for Example Co");
});

test("surfaces commerce-disclosure unified findings from finding-family packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "commerce_disclosures",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/affiliate-policy",
                  snippet: "We may earn a commission from affiliate links.",
                  supportedSurfaceTypes: ["affiliate_disclosure"],
                  title: "Affiliate Policy"
                },
                {
                  canonicalUrl: "https://www.example.com/ads",
                  snippet: "Sponsored content and advertising partners are disclosed here.",
                  supportedSurfaceTypes: ["advertising_disclosure"],
                  title: "Advertising Disclosure"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/affiliate-policy"],
                  findingId: "affiliate_disclosure_present",
                  reason: "Verified commerce-disclosure evidence includes affiliate, partner, commission, or 'we may earn' language.",
                  sourceSurfaceTypes: ["affiliate_disclosure"]
                },
                {
                  evidenceUrls: ["https://www.example.com/ads"],
                  findingId: "third_party_advertising_disclosure_present",
                  reason: "Verified commerce-disclosure evidence includes explicit advertising, ad-partner, or sponsored language.",
                  sourceSurfaceTypes: ["advertising_disclosure"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const affiliatePacket = packets.find((packet) => packet.unifiedFindingId === "affiliate_disclosure_present");
  const adsPacket = packets.find((packet) => packet.unifiedFindingId === "third_party_advertising_disclosure_present");

  assert.ok(affiliatePacket);
  assert.ok(adsPacket);
  assert.equal(affiliatePacket?.primaryPageUrl, "https://www.example.com/affiliate-policy");
  assert.equal(adsPacket?.primaryPageUrl, "https://www.example.com/ads");
  assert.equal(affiliatePacket?.presentationDecision.status, "audit_only");
  assert.equal(adsPacket?.presentationDecision.status, "surface");
  assert.ok(affiliatePacket?.evidence?.snippets?.includes("We may earn a commission from affiliate links."));
  assert.ok(adsPacket?.evidence?.snippets?.includes("Sponsored content and advertising partners are disclosed here."));
});

test("keeps key-page discovery context on coverage-gap packets", () => {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "A key disclosure or support page was detected, but its target URL could not be fetched successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 3,
          keyPageAttemptedUrls: [
            "https://example.com/cookie-policy",
            "https://example.com/privacy/cookies"
          ],
          keyPageDiscoverySource: "footer_link",
          keyPageGuessedOnly: false,
          keyPageStopReason: "http_error",
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalValue: true
        },
        observedValue: "Cookie Policy",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy unavailable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy unavailable"
      }
    ],
    validationFindings: []
  });

  assert.equal(packets[0]?.details?.family, "coverage_gap");
  assert.equal(packets[0]?.details?.pageType, "cookie_policy");
  assert.equal(packets[0]?.details?.attemptCount, 3);
  assert.deepEqual(packets[0]?.details?.attemptedUrls, [
    "https://example.com/cookie-policy",
    "https://example.com/privacy/cookies"
  ]);
  assert.equal(packets[0]?.confidenceInputs.hasKeyPageDiscoveryEvidence, true);
  assert.equal(packets[0]?.confidenceInputs.isFallbackOnly, true);
  assert.equal(packets[0]?.confidenceBand, "moderate");
});

test("marks fallback-only low-confidence packets as audit-only and refines coverage copy", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A key disclosure or support page was detected, but its target URL could not be fetched successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://example.com/cookie-policy"],
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalValue: true
        },
        observedValue: "Cookie Policy",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy unavailable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy unavailable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.suggestedFix ?? "", /repair the cookie policy url/i);
});

test("exposes owner and mirror category relations on unified finding packets", () => {
  const validationFinding = makeValidationFinding({
    id: "val-3",
    ruleKey: "section_review.session_replay_detected_without_disclosure",
    severity: "high",
    title: "Possible undisclosed session replay"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "session_replay_undisclosed");
  assert.equal(getUnifiedFindingOwnerCategoryId(packet!), "policy_to_behavior_contradictions");
  assert.equal(getUnifiedFindingCategoryRelation(packet!, "adtech_analytics_replay_footprint"), "mirror");
  assert.equal(packet?.confidenceInputs.validationCount, 1);
  assert.equal(packet?.confidenceInputs.hasStructuredValidationEvidence, true);
});

test("rolls structured validation evidence into unified finding packets", () => {
  const validationFinding = makeValidationFinding({
    id: "val-4",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    title: "Possible undisclosed session replay",
    evidence: {
      claim: "Policy does not clearly disclose session replay.",
      pageUrl: "https://example.com/privacy",
      relatedVendors: ["Microsoft Clarity"],
      runtimeEvidence: ["Replay script observed during homepage load"],
      supportingSignals: ["session replay tool detected"]
    }
  });

  const [packet] = buildUnifiedFindingPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding]
  });

  assert.equal(packet?.unifiedFindingId, "session_replay_undisclosed");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://example.com/privacy"]);
  assert.equal(packet?.primaryPageUrl, "https://example.com/privacy");
  assert.equal(packet?.affectedPageCount, 1);
  assert.deepEqual(packet?.evidence?.entities?.relatedVendors, ["Microsoft Clarity"]);
  assert.ok(packet?.evidence?.snippets?.includes("Replay script observed during homepage load"));
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.confidenceInputs.hasPageAttribution, true);
  assert.equal(packet?.confidenceInputs.hasPolicyTextEvidence, true);
  assert.equal(packet?.confidenceBand, "high");
});

test("specializes high-sensitivity replay evidence into a sensitive replay packet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Sensitive input and replay tooling were retained together.",
        fallbackEvidence: {
          sensitivePayloadViolations: [
            {
              detectedType: "financial_information",
              evidenceSource: "sensitive_field_session_replay_correlation",
              evidenceStrength: "form_field_signal",
              matchSnippet: "accountNumber=***1234",
              requestUrl: "https://clarity.ms/collect",
              vendorHost: "clarity.ms"
            }
          ],
          signalKey: "commerce.high_sensitivity_data_collection_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalLabel: "High-sensitivity data collection detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "High-sensitivity data collection detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "possible_session_replay_on_sensitive_input_surface");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.confidenceInputs.hasConcretePayloadEvidence, true);
  assert.ok(packet?.evidence?.snippets?.includes("accountNumber=***1234"));
  assert.equal(packet?.evidence?.entities?.sensitivePayloadViolations?.length, 1);
  assert.deepEqual(packet?.evidence?.entities?.request_domains, ["clarity.ms"]);
  assert.deepEqual(packet?.evidence?.entities?.request_urls, ["https://clarity.ms/collect"]);
});

test("surfaces direct session replay observation when runtime vendor provenance is retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The homepage loaded Microsoft Clarity session recording scripts.",
        fallbackEvidence: {
          runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
          runtimeVendors: ["Microsoft Clarity"],
          session_replay_runtime_detected: true,
          session_replay_runtime_vendors: ["Microsoft Clarity"],
          session_replay_vendor_artifact_present: true,
          signalKey: "commerce.session_replay_tool_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "commerce.session_replay_tool_detected",
        signalLabel: "Session replay tool detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Session replay tool detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "session_replay_observed");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "review");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
});

test("specializes high-sensitivity third-party tracking evidence into a sensitive tracking packet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Sensitive input and third-party tracking were retained together.",
        fallbackEvidence: {
          sensitivePayloadViolations: [
            {
              detectedType: "health_information",
              evidenceSource: "sensitive_field_third_party_tracking_correlation",
              evidenceStrength: "suspected",
              matchSnippet: "condition=asthma",
              requestUrl: "https://tracker.example.net/collect",
              vendorHost: "tracker.example.net"
            }
          ],
          runtimeEvidenceArtifacts: ["request:https://tracker.example.net/collect"],
          signalKey: "commerce.high_sensitivity_data_collection_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalLabel: "High-sensitivity data collection detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "High-sensitivity data collection detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "sensitive_data_collection_with_third_party_tracking_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.confidenceInputs.hasConcretePayloadEvidence, true);
  assert.ok(packet?.evidence?.snippets?.includes("condition=asthma"));
  assert.deepEqual(packet?.evidence?.entities?.request_domains, ["tracker.example.net"]);
  assert.deepEqual(packet?.evidence?.entities?.request_urls, ["https://tracker.example.net/collect"]);
});

const sensitiveCollectionPacketCases = [
  {
    detectedType: "ssn",
    label: "SSN collection detected",
    signalKey: "commerce.form_collects_ssn",
    snippet: "Social Security Number"
  },
  {
    detectedType: "government_id",
    label: "Government ID collection detected",
    signalKey: "commerce.form_collects_government_id",
    snippet: "Driver license number"
  },
  {
    detectedType: "health_information",
    label: "Health information collection detected",
    signalKey: "commerce.form_collects_health_information",
    snippet: "Medical condition"
  },
  {
    detectedType: "financial_information",
    label: "Financial information collection detected",
    signalKey: "commerce.form_collects_financial_information",
    snippet: "Bank account number"
  },
  {
    detectedType: "geolocation",
    label: "Geolocation collection detected",
    signalKey: "commerce.form_collects_geolocation",
    snippet: "Use my current location"
  }
] as const;

for (const sensitiveCase of sensitiveCollectionPacketCases) {
  test(`${sensitiveCase.signalKey} with disconnected tracker evidence stays a sensitive collection packet`, () => {
    const [packet] = buildUnifiedFindingDisplayPackets({
      reviewFindingCandidates: [
        {
          description: `${sensitiveCase.label} and third-party tracking were retained together.`,
          fallbackEvidence: {
            retargetingPixelArtifactPresent: true,
            runtimeEvidenceArtifacts: ["request:https://pixel.example.net/collect"],
            sensitiveCollectionDataTypes: [sensitiveCase.detectedType],
            sensitiveCollectionMatchedTexts: [sensitiveCase.snippet],
            sensitiveCollectionSignalKey: sensitiveCase.signalKey,
            sensitivePayloadViolations: [
              {
                detectedType: sensitiveCase.detectedType,
                evidenceSource: "snapshot_signal_match",
                evidenceStrength: "form_field_signal",
                matchSnippet: sensitiveCase.snippet,
                signalKey: sensitiveCase.signalKey
              }
            ],
            signalKey: sensitiveCase.signalKey,
            signalValue: true
          },
          observedValue: "Yes",
          severity: "high",
          signalKey: sensitiveCase.signalKey,
          signalLabel: sensitiveCase.label,
          signalSource: "snapshot_signal",
          sourceType: "signal",
          title: sensitiveCase.label
        }
      ],
      validationFindings: [],
      validationFindingLookup: new Map()
    });

    assert.equal(packet?.unifiedFindingId, "sensitive_collection_surface_observed");
    assert.equal(packet?.presentationDecision.status, "audit_only");
    assert.equal(packet?.confidenceInputs.hasConcretePayloadEvidence, true);
    assert.ok(packet?.evidence?.snippets?.includes(sensitiveCase.snippet));
    assert.deepEqual(packet?.evidence?.entities?.sensitive_data_types, [sensitiveCase.detectedType]);
  });
}

test("retains sensitive collection field evidence as support-only without tracking context", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Sensitive field evidence was retained without replay or tracking context.",
        fallbackEvidence: {
          sensitiveFieldEvidence: [
            {
              confidence: "strong",
              dataType: "government_id",
              inputName: "passport_number",
              labelText: "Passport number",
              matchSnippet: "Passport number",
              pageUrl: "https://example.com/apply",
              signalKey: "commerce.form_collects_government_id"
            }
          ],
          sensitivePayloadViolations: [
            {
              detectedType: "government_id",
              evidenceSource: "sensitive_field_evidence",
              evidenceStrength: "form_field_signal",
              matchSnippet: "Passport number",
              requestUrl: "",
              sourceField: "passport_number",
              sourceLocation: "form_field",
              signalKey: "commerce.form_collects_government_id"
            }
          ],
          sourceUrls: ["https://example.com/apply"],
          signalKey: "commerce.form_collects_government_id",
          signalValue: true,
          unifiedFindingId: "sensitive_collection_surface_observed"
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "commerce.form_collects_government_id",
        signalLabel: "Government ID collection detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Government ID collection detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "sensitive_collection_surface_observed");
  assert.equal(packet?.surfacingDecision.decisionState, "support_only");
  assert.equal(packet?.surfacingDecision.reportLane, "confidence_and_coverage");
  assert.ok(packet?.evidence?.snippets?.includes("Passport number"));
  assert.deepEqual(packet?.evidence?.entities?.sensitive_data_types, ["government_id"]);
});

test("does not surface generic high-sensitivity signal without concrete payload evidence", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "High-sensitivity data collection signal triggered without retained evidence.",
        fallbackEvidence: {
          signalKey: "commerce.high_sensitivity_data_collection_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalLabel: "High-sensitivity data collection detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "High-sensitivity data collection detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.length, 0);
});

test("structured policy enrichment can surface missing data-category disclosure as a unified packet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Primary policy extraction retained no data-category disclosure.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          policyCoverageRatio: 0.72,
          policyDataCategories: [],
          policyExtractionStatus: "fetched",
          policyFieldCoverage: {
            data_categories: { confidence: 0.88, found: false, snippetHash: null }
          },
          policySemanticConfidence: 0.84,
          signalKey: "policySemanticConfidence",
          signalValue: 0.84
        },
        observedValue: null,
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Policy semantic confidence"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "data_categories_disclosure_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("structured policy enrichment can surface missing third-party recipient disclosure as a unified packet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Primary policy extraction retained no recipient or subprocessor disclosure.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          policyCoverageRatio: 0.69,
          policyExtractionStatus: "fetched",
          policySemanticConfidence: 0.82,
          policySubprocessorsListed: false,
          signalKey: "policySemanticConfidence",
          signalValue: 0.82
        },
        observedValue: null,
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Policy semantic confidence"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "third_party_recipient_disclosure_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("structured policy enrichment can surface missing purpose-of-use disclosure as a unified packet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Primary policy extraction retained no clear purpose-of-use disclosure.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          policyCoverageRatio: 0.71,
          policyExtractionStatus: "fetched",
          policyFieldCoverage: {
            processing_purposes: { confidence: 0.83, found: false, snippetHash: null }
          },
          policySemanticConfidence: 0.8,
          signalKey: "policySemanticConfidence",
          signalValue: 0.8
        },
        observedValue: null,
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Policy semantic confidence"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "purpose_of_use_disclosure_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("account-exit validation gaps can specialize into missing cancellation-method disclosure packets", () => {
  const validationFinding = makeValidationFinding({
    id: "cancel-2",
    description: "The retained evidence did not explain how a user would actually cancel or exit.",
    evidence: {
      policyCancellationOrRefundPresent: false,
      subscriptionCancellationPolicyPresent: false,
      cancellationTermsPresent: false
    },
    ruleKey: "section_review.account_exit_terms_missing",
    severity: "medium",
    title: "Account-exit terms missing"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "cancellation_method_disclosure_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps the unified finding name canonical even when validation titles add judgment language", () => {
  const validationFinding = makeValidationFinding({
    id: "val-5",
    ruleKey: "scan_signal.privacy.policy_runtime_functional_misalignment_detected",
    severity: "high",
    title: "High-confidence functional misalignment"
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "functional_misalignment");
  assert.equal(packet?.title, "Functional misalignment");
  assert.equal(packet?.presentation.findingName, "Functional misalignment");
});

test("suppresses generic policy-behavior conflicts when a more specific contradiction is present", () => {
  const validationFinding = makeValidationFinding({
    id: "val-7",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    title: "Possible undisclosed session replay",
    evidence: {
      conflictBridgeReasoning: "Replay runtime evidence was compared against the retained policy disclosure scope.",
      disclosureSearchScopeRetained: true,
      claim: "Policy does not clearly disclose replay tooling.",
      policySourceUrl: "https://example.com/privacy",
      relatedVendors: ["Microsoft Clarity"],
      runtimeEvidence: ["Replay script observed during homepage load"],
      sessionReplayVendors: ["Microsoft Clarity"]
    }
  });

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed runtime behavior appears to conflict with policy representations.",
        observedValue: "Yes",
        severity: "high",
        signalKey: "context.policy_behavior_conflict_detected",
        signalLabel: "Policy/behavior conflict detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Policy/behavior conflict detected"
      },
      {
        description: "Runtime replay evidence was observed without a matching disclosure.",
        linkedValidationFinding: validationFinding,
        observedValue: "Yes",
        severity: "high",
        signalKey: "context.session_replay_without_disclosure_detected",
        signalLabel: "Session replay without disclosure detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Possible undisclosed session replay"
      }
    ],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  const genericPacket = packets.find((packet) => packet.unifiedFindingId === "policy_behavior_conflict");
  const specificPacket = packets.find((packet) => packet.unifiedFindingId === "session_replay_undisclosed");

  assert.equal(genericPacket, undefined);
  assert.equal(specificPacket?.presentationDecision.status, "surface");
});

test("drops weak generic contradiction issues from the report payload when they lack contradiction-grade support", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed adtech vendors include Google Ads.",
        fallbackEvidence: {
          claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
          contradictionBasis: "undisclosed_vendor",
          policySnippet: "We do not share browsing data with undisclosed advertising vendors.",
          pageUrl: "https://www.example.com/privacy",
          policySummaryShort: "We describe advertising, pixels, and related privacy controls in the privacy policy.",
          relatedVendors: ["Google Ads", "Meta Pixel"],
          runtimeEvidenceArtifacts: ["Google Ads tag requested before any disclosed vendor list appeared."],
          runtimeVendors: ["Google Ads", "Meta Pixel"],
          sourceUrls: ["https://www.example.com/privacy"],
          supportingSignals: ["policy_behavior_conflict_candidate"]
        },
        observedValue: "Observed adtech vendors include Google Ads.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "policy_behavior_conflict"), false);
});

test("drops generic policy-behavior conflicts when no explicit contradiction basis is retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed adtech vendors include Google Ads.",
        fallbackEvidence: {
          claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
          pageUrl: "https://www.example.com/privacy",
          policySummaryShort: "We describe advertising, pixels, and related privacy controls in the privacy policy.",
          relatedVendors: ["Google Ads"],
          runtimeVendors: ["Google Ads"],
          sourceUrls: ["https://www.example.com/privacy"],
          supportingSignals: ["policy_behavior_conflict_candidate"]
        },
        observedValue: "Observed adtech vendors include Google Ads.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "policy_behavior_conflict"), false);
});

test("drops generic policy-behavior conflicts when contradiction basis is present but policy snippet is not retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed adtech vendors include Google Ads.",
        fallbackEvidence: {
          claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
          contradictionBasis: "undisclosed_vendor",
          pageUrl: "https://www.example.com/privacy",
          policySummaryShort: "We describe advertising, pixels, and related privacy controls in the privacy policy.",
          relatedVendors: ["Google Ads"],
          runtimeVendors: ["Google Ads"],
          sourceUrls: ["https://www.example.com/privacy"],
          supportingSignals: ["policy_behavior_conflict_candidate"]
        },
        observedValue: "Observed adtech vendors include Google Ads.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "policy_behavior_conflict"), false);
});

test("does not assemble a generic contradiction packet when the only snippet is the generic contradiction claim", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed adtech vendors include Google Ads.",
        fallbackEvidence: {
          claim: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
          contradictionBasis: "undisclosed_vendor",
          policySnippet: "Observed runtime behavior appears to conflict with policy representations about tracking or third-party data use.",
          relatedVendors: ["Google Ads"],
          runtimeVendors: ["Google Ads"],
          supportingSignals: ["policy_behavior_conflict_detected"]
        },
        observedValue: "Observed adtech vendors include Google Ads.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "policy_behavior_conflict"), false);
});

test("surfaces policy behavior conflicts only when the contradiction bundle is complete", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "GPC-enabled session retained tracking behavior.",
        fallbackEvidence: POLICY_BEHAVIOR_CONFLICT_FIXTURES.positiveGpcNotHonored,
        observedValue: "Tracking persisted with GPC enabled",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "policy_behavior_conflict");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.details?.family, "contradiction");
  assert.equal(packet?.details?.policyClaimType, "gpc_honored");
  assert.equal(packet?.details?.runtimeObservationType, "gpc_signal_not_honored");
  assert.equal(packet?.details?.conflictType, "declared_opt_out_honored_but_tracking_persisted_under_opt_out");
  assert.equal(packet?.details?.contradictionReviewStatus, "complete");
});

test("drops Schwab-like policy behavior conflicts from the report payload when no contradiction-grade pair is retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed runtime behavior appears to conflict with policy representations.",
        fallbackEvidence: POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeSchwabLike,
        observedValue: "Possible mismatch",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "policy_behavior_conflict"), false);
});

test("does not preserve loose structured contradiction bundles as generic policy-behavior packets without contradiction-grade support", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed replay tooling during the homepage session.",
        fallbackEvidence: {
          claim: "stale claim",
          contradictionEvidence: {
            claim: "Policy does not clearly disclose replay tooling.",
            policySnippet: "Policy does not clearly disclose replay tooling.",
            policySourceUrl: "https://www.example.com/privacy",
            policySummaryShort: "We describe our privacy controls in the privacy policy.",
            relatedVendors: ["Microsoft Clarity"],
            runtimeEvidenceArtifacts: ["Replay script observed during homepage load"],
            runtimeSummary: "Observed replay tooling during the homepage session.",
            runtimeVendors: ["Microsoft Clarity"],
            sourceUrls: ["https://www.example.com/privacy"],
            supportingSignals: ["session replay tool detected"]
          },
          relatedVendors: ["Some Other Vendor"]
        },
        observedValue: "Observed replay tooling during the homepage session.",
        severity: "high",
        sourceType: "issue",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "policy_behavior_conflict"), false);
});

test("keeps strong corroborated findings surfaced with a confidence rationale", () => {
  const validationFinding = makeValidationFinding({
    id: "val-6",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    title: "Trackers observed before consent",
    evidence: {
      consentTimeline: {
        firstCmpVisibleMs: 600,
        firstConsentActionMs: 1200,
        firstNonEssentialRequestMs: 100
      },
      preconsent_tracker_vendors: ["Meta Pixel"],
      preconsent_tracker_evidence_urls: ["https://example.com/collect"],
      requestPurposeClassificationConfidence: [
        {
          confidence: 0.95,
          essentiality: "non_essential",
          requestUrl: "https://example.com/collect"
        }
      ],
      policySummary: "Tracking is presented as consent-gated."
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed before a clear user choice was made.",
        fallbackEvidence: {
          consentTimeline: {
            firstCmpVisibleMs: 600,
            firstConsentActionMs: 1200,
            firstNonEssentialRequestMs: 100
          },
          preconsent_tracker_evidence_urls: ["https://example.com/collect"],
          preconsent_tracker_vendors: ["Meta Pixel"],
          requestPurposeClassificationConfidence: [
            {
              confidence: 0.95,
              essentiality: "non_essential",
              requestUrl: "https://example.com/collect"
            }
          ],
          signalKey: "privacy.preconsent_tracking_detected",
          signalValue: true
        },
        linkedValidationFinding: validationFinding,
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentationDecision.confidenceRationale ?? "", /high confidence/i);
  assert.match(packet?.presentation.suggestedFix ?? "", /block non-essential trackers/i);
});

test("keeps pre-consent tracking audit-only when concrete runtime vendors and URLs are not retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed before a clear user choice was made.",
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "preconsent_tracking");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.ok(
    packet?.presentationDecision.downgradeReasons.includes(
      "Concrete request or vendor artifacts were not retained for the pre-consent tracking claim."
    )
  );
  assert.equal(packet?.presentation.confidenceScore, "0.45");
});

test("surfaces RTB cookie sync with compact request-level evidence", () => {
  const validationFinding = makeValidationFinding({
    id: "val-rtb-1",
    ruleKey: "runtime_privacy.rtb_cookie_sync_observed",
    severity: "high",
    title: "Adtech identity sync-like request observed",
    evidence: {
      preconsent_tracking_detected: true,
      rtb_cookie_sync_detected: true,
      rtb_cookie_sync_evidence: [
        {
          hostname: "sync-t1.taboola.com",
          pathSample: "/sg/pubmatic-network/1/rtb-h/",
          queryKeysSample: ["gdpr", "uid"],
          reason: "sync_path",
          runtimePhase: "pre_consent",
          statusCode: 302,
          urlSample: "https://sync-t1.taboola.com/sg/pubmatic-network/1/rtb-h/",
          vendor: "PubMatic"
        }
      ],
      rtb_cookie_sync_vendors: ["PubMatic"],
      runtimeRequestUrls: ["https://sync-t1.taboola.com/sg/pubmatic-network/1/rtb-h/"]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "rtb_cookie_sync_observed");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.details?.family, "consent_tracking");
  assert.deepEqual(packet?.details?.family === "consent_tracking" ? packet.details.vendors : [], ["PubMatic"]);
  assert.equal(packet?.evidence?.entities?.rtbCookieSyncEvidence?.length, 1);
  assert.equal(JSON.parse(packet?.evidence?.entities?.rtbCookieSyncEvidence?.[0] ?? "{}").hostname, "sync-t1.taboola.com");
  assert.equal(packet?.evidence?.entities?.rtbCookieSyncEvidence?.[0]?.includes("secret-user-id"), false);
});

test("keeps RTB cookie sync suppressed without concrete sync request evidence", () => {
  const validationFinding = makeValidationFinding({
    id: "val-rtb-weak",
    ruleKey: "runtime_privacy.rtb_cookie_sync_observed",
    severity: "high",
    title: "Adtech identity sync-like request observed",
    evidence: {
      preconsent_tracking_detected: true,
      rtb_cookie_sync_detected: true,
      rtb_cookie_sync_vendors: ["PubMatic", "OpenX"],
      runtimeVendors: ["PubMatic", "OpenX"]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "rtb_cookie_sync_observed");
  assert.notEqual(packet?.presentationDecision.status, "surface");
  assert.ok(packet?.presentationDecision.downgradeReasons.some((reason) => /runtime anchor/i.test(reason)));
});

test("retains pre-consent cookie timing evidence on unified finding packets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The homepage set analytics cookies before any consent action.",
        fallbackEvidence: {
          consentTimeline: {
            firstCmpVisibleMs: 600,
            firstConsentActionMs: 1200,
            firstNonEssentialRequestMs: 100
          },
          preconsent_cookie_categories: ["advertising", "analytics"],
          preconsent_cookie_evidence: [
            {
              category: "advertising",
              cookieName: "_fbp",
              initiatorDomain: "connect.facebook.net",
              initiatorUrl: "https://connect.facebook.net/en_US/fbevents.js",
              initiatorVendor: "Meta Pixel",
              nonEssential: true,
              timingEvidence: "before_consent_cookie_write"
            },
            {
              category: "analytics",
              cookieName: "_ga",
              initiatorDomain: "www.google-analytics.com",
              initiatorUrl: "https://www.google-analytics.com/analytics.js",
              initiatorVendor: "Google Analytics",
              nonEssential: true,
              timingEvidence: "before_consent_cookie_write"
            }
          ],
          preconsent_cookie_initiator_domains: ["connect.facebook.net", "www.google-analytics.com"],
          preconsent_cookie_initiator_urls: ["https://connect.facebook.net/en_US/fbevents.js", "https://www.google-analytics.com/analytics.js"],
          preconsent_cookie_initiator_vendors: ["Meta Pixel", "Google Analytics"],
          preconsent_cookie_names: ["_fbp", "_ga"],
          preconsent_nonessential_cookie_names: ["_fbp", "_ga"],
          preconsent_tracking_detected: true,
          signalKey: "privacy.preconsent_tracking_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "preconsent_tracking");
  assert.deepEqual(packet?.evidence?.entities?.preconsent_cookie_names, ["_fbp", "_ga"]);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_nonessential_cookie_names, ["_fbp", "_ga"]);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_cookie_categories, ["advertising", "analytics"]);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_cookie_initiator_vendors, ["Meta Pixel", "Google Analytics"]);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_cookie_initiator_domains, ["connect.facebook.net", "www.google-analytics.com"]);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_cookie_initiator_urls, [
    "https://connect.facebook.net/en_US/fbevents.js",
    "https://www.google-analytics.com/analytics.js"
  ]);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_cookie_timing_evidence, ["before_consent_cookie_write"]);
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
});

test("keeps blocked contact-path evidence audit-only and strips interstitial snippets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable contact surface.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/contact"],
          policySnippets: [
            "We’re sorry, but we were unable to authorize your request. Please call us at 800-555-1212."
          ],
          signalKey: "disclosure.contact_page_present",
          signalLabel: "Contact page fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/contact"]
        },
        observedValue: "Contact page fetched",
        severity: "medium",
        signalKey: "disclosure.contact_page_present",
        signalLabel: "Contact page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "contact_support_path_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.presentationDecision.verificationState, "blocked");
  assert.equal(packet?.presentationDecision.verificationLabel, "Blocked or interstitial");
  assert.ok(
    packet?.presentationDecision.downgradeReasons.includes(
      "Retained page evidence looked like an authorization wall, challenge page, or other interstitial."
    )
  );
  assert.deepEqual(packet?.evidence?.snippets, ["Contact Us"]);
});

test("uses derived support-surface snippets for packet-backed contact surfaces with multiple first-party urls", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "support_access",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/contact-us",
                  fetchQuality: "blocked_interstitial",
                  snippet: "Example Corp",
                  supportedSurfaceTypes: ["contact_support"],
                  supportingRefs: [{ url: "https://www.example.com/contact" }],
                  title: "Example Corp"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/contact-us", "https://www.example.com/contact"],
                  findingId: "contact_support_path_present",
                  reason: "Verified support-access evidence includes help, contact, or feedback language.",
                  sourceSurfaceTypes: ["contact_support"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "contact_support_path_present");
  assert.equal(packet?.confidenceBand, "high");
  assert.equal(packet?.observedValue, "Detected dedicated contact or support surfaces on first-party URLs.");
  assert.equal(packet?.evidence?.fetchQuality, "thin_content");
  assert.deepEqual(packet?.evidence?.snippets, ["Contact Us"]);
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("promotes corroborated contact surfaces to verified evidence and higher confidence when readable support text is retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "support_access",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/contact-us",
                  fetchQuality: "blocked_interstitial",
                  snippet: "Example Corp",
                  supportedSurfaceTypes: ["contact_support"],
                  supportingRefs: [{ url: "https://www.example.com/contact" }],
                  title: "Example Corp"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidencePayload: {
                    pageUrls: ["https://www.example.com/contact-us", "https://www.example.com/contact"],
                    policySnippets: [
                      "Reach out to Example customer service by phone, chat, or visit your local branch."
                    ],
                    sourceUrls: ["https://www.example.com/contact", "https://www.example.com/contact-us"]
                  },
                  evidenceUrls: ["https://www.example.com/contact-us", "https://www.example.com/contact"],
                  findingId: "contact_support_path_present",
                  reason: "Verified support-access evidence includes help, contact, or feedback language.",
                  sourceSurfaceTypes: ["contact_support"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "contact_support_path_present");
  assert.equal(packet?.evidence?.fetchQuality, "verified_content");
  assert.equal(packet?.observedValue, "Reach out to Example customer service by phone, chat, or visit your local branch.");
  assert.equal(packet?.confidenceBand, "high");
  assert.equal(packet?.presentationDecision.verificationState, "runtime");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps blocked cookie-policy evidence audit-only and strips interstitial snippets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable cookie-policy surface.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/cookies"],
          policySnippets: [
            "We’re sorry, but we were unable to authorize your request. Please call us at 800-555-1212."
          ],
          signalKey: "disclosure.cookie_policy_present",
          signalLabel: "Cookie policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/cookies"]
        },
        observedValue: "Cookie policy fetched",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.evidence?.fetchQuality, "blocked_interstitial");
  assert.deepEqual(packet?.evidence?.snippets, []);
});

test("uses a cookie-specific generic observation when the url is stronger than the retained snippet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable cookie-policy surface.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/legal/cookies"],
          policySnippets: ["Example Corp"],
          signalKey: "disclosure.cookie_policy_present",
          signalLabel: "Cookie policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/legal/cookies"]
        },
        observedValue: "Cookie policy fetched",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.observedValue, "Detected first-party cookie-policy or privacy-controls surface.");
});

test("reanchors cookie-policy presence to retained privacy-notice cookie text and raises confidence", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/legal/cookies",
                  fetchQuality: "blocked_interstitial",
                  snippet: "Example Corp",
                  supportedSurfaceTypes: ["cookie_policy"],
                  supportingRefs: [{ url: "https://www.example.com/privacy-notice" }],
                  title: "Example Corp"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidencePayload: {
                    pageUrls: ["https://www.example.com/legal/cookies", "https://www.example.com/privacy-notice"],
                    policySnippets: [
                      "We use cookies and other tracking technologies, including analytical cookies and marketing cookies. You can review Your Privacy Choices at any time."
                    ],
                    sourceUrls: ["https://www.example.com/privacy-notice", "https://www.example.com/legal/cookies"]
                  },
                  evidenceUrls: ["https://www.example.com/legal/cookies", "https://www.example.com/privacy-notice"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie and tracking disclosures.",
                  sourceSurfaceTypes: ["cookie_policy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "cookie_policy_present");

  assert.equal(packet?.evidence?.fetchQuality, "verified_content");
  assert.equal(
    packet?.observedValue,
    "We use cookies and other tracking technologies, including analytical cookies and marketing cookies. You can review Your Privacy Choices at any time."
  );
  assert.equal(packet?.confidenceBand, "high");
  assert.equal(packet?.presentationDecision.verificationState, "runtime");
});

test("borrows corroborating privacy-controls anchors for cookie-policy packets from the same family packet", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/legal/cookies",
                  fetchQuality: "blocked_interstitial",
                  snippet: "Example Corp",
                  supportedSurfaceTypes: ["cookie_policy_or_settings"],
                  title: "Example Corp"
                },
                {
                  canonicalUrl: "https://www.example.com/privacy-notice",
                  fetchQuality: "verified_content",
                  snippet:
                    "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC.",
                  supportedSurfaceTypes: ["privacy_choices"],
                  title: "Privacy Notice"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/legal/cookies"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy_or_settings"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "cookie_policy_present");

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.presentation.confidenceScore, "0.85");
  assert.equal(packet?.evidence?.fetchQuality, "verified_content");
  assert.equal(packet?.primaryPageUrl, "https://www.example.com/privacy-notice");
  assert.ok(packet?.evidence?.pageUrls?.includes("https://www.example.com/privacy-notice"));
  assert.ok(
    packet?.evidence?.snippets?.includes(
      "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
    )
  );
});

test("repairs weak cookie-policy packets from policy enrichment during display assembly", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.schwab.com/legal/privacy/us-residents",
        policy_summary_short:
          "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
      }
    ],
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.schwab.com/cookies",
                  fetchQuality: "blocked_interstitial",
                  snippet: "Charles Schwab",
                  supportedSurfaceTypes: ["cookie_policy"],
                  title: "Charles Schwab"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.schwab.com/cookies"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "cookie_policy_present");

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.presentation.confidenceScore, "0.85");
  assert.equal(packet?.primaryPageUrl, "https://www.schwab.com/legal/privacy/us-residents");
  assert.equal(packet?.evidence?.fetchQuality, "verified_content");
  assert.ok(packet?.evidence?.pageUrls?.includes("https://www.schwab.com/legal/privacy/us-residents"));
  assert.ok(
    packet?.evidence?.snippets?.includes(
      "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies. Review Your Privacy Choices or browser-based opt-out preference signals such as GPC."
    )
  );
});

test("synthesizes cookie-policy packets from promotion-grade policy enrichment", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        page_type: "cookie_policy",
        page_url: "https://stripe.com/cookie-settings",
        policy_evidence_snippets: {
          cookie_settings:
            "Cookie Settings. You can manage advertising cookies, analytics cookies, and similar tracking technologies from this page.",
          privacy_choices:
            "Your browser privacy preference signal may override your advertising-cookie selection."
        },
        policy_summary_short:
          "Cookie Settings. Manage advertising cookies, analytics cookies, and related privacy choices."
      }
    ],
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "cookie_policy_present");

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "review");
  assert.equal(packet?.primaryPageUrl, "https://stripe.com/cookie-settings");
  assert.equal(packet?.evidence?.fetchQuality, "verified_content");
  assert.ok(packet?.evidence?.pageUrls?.includes("https://stripe.com/cookie-settings"));
  assert.ok(
    packet?.evidence?.snippets?.some((snippet) =>
      /manage advertising cookies, analytics cookies, and similar tracking technologies/i.test(snippet)
    )
  );
});

test("prefers cookie-policy enrichment over privacy-notice cookie support when repairing weak packets", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy-notice",
        policy_summary_short:
          "The privacy notice mentions opt out instructions at the cookie consent center and links to the cookie policy."
      },
      {
        page_type: "cookie_policy",
        page_url: "https://www.example.com/legal/cookie-policy",
        policy_evidence_snippets: {
          cookie_policy:
            "This Cookie Policy explains our cookies, tracking technologies, analytics cookies, marketing cookies, and how to manage your preferences."
        },
        policy_summary_short:
          "This Cookie Policy explains our cookies, tracking technologies, analytics cookies, marketing cookies, and how to manage your preferences."
      }
    ],
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-notice",
                  fetchQuality: "verified_content",
                  snippet: "Opt out instructions are available at the cookie consent center.",
                  supportedSurfaceTypes: ["privacy_choices"],
                  title: "Privacy Notice"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidenceUrls: ["https://www.example.com/privacy-notice"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((item) => item.unifiedFindingId === "cookie_policy_present");

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.primaryPageUrl, "https://www.example.com/legal/cookie-policy");
  assert.deepEqual(packet?.evidence?.pageUrls?.slice(0, 1), ["https://www.example.com/legal/cookie-policy"]);
  assert.ok(
    packet?.evidence?.snippets?.some((snippet) =>
      /This Cookie Policy explains our cookies, tracking technologies/i.test(snippet)
    )
  );
});

test("normalizes legacy family-packet policy evidence keys before assembling unified findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.example.com/privacy-notice",
                  fetchQuality: "verified_content",
                  snippet: "Privacy Notice",
                  supportedSurfaceTypes: ["cookie_policy"],
                  title: "Privacy Notice"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidencePayload: {
                    fetch_quality: "verified_content",
                    page_url: "https://www.example.com/privacy-notice",
                    policy_snippet:
                      "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies.",
                    source_url: "https://www.example.com/privacy-notice"
                  },
                  evidenceUrls: ["https://www.example.com/privacy-notice"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy language.",
                  sourceSurfaceTypes: ["cookie_policy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.evidence?.fetchQuality, "verified_content");
  assert.equal(packet?.primaryPageUrl, "https://www.example.com/privacy-notice");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/privacy-notice"]);
  assert.ok(
    packet?.evidence?.snippets?.includes(
      "How We Use Cookies and Other Tracking Technologies. We use analytical cookies and marketing cookies."
    )
  );
});

test("does not treat insufficient-policy placeholder text as a surfaced cookie-policy snippet", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    scanEvents: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "finding_family_packets",
          packets: [
            {
              familyId: "privacy_controls",
              canonicalTargets: [
                {
                  canonicalUrl: "https://www.schwab.com/cookies",
                  fetchQuality: "verified_content",
                  snippet: "Insufficient policy content fetched for semantic review.",
                  supportedSurfaceTypes: ["cookie_policy"],
                  title: "Cookie Policy"
                }
              ],
              supportedUnifiedFindings: [
                {
                  evidencePayload: {
                    fetchQuality: "verified_content",
                    pageUrls: ["https://www.schwab.com/cookies"],
                    policySnippets: ["Insufficient policy content fetched for semantic review."],
                    sourceUrls: ["https://www.schwab.com/cookies"]
                  },
                  evidenceUrls: ["https://www.schwab.com/cookies"],
                  findingId: "cookie_policy_present",
                  reason: "Verified privacy-controls evidence includes cookie policy or settings language.",
                  sourceSurfaceTypes: ["cookie_policy"]
                }
              ]
            }
          ]
        }
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.deepEqual(packet?.evidence?.snippets ?? [], []);
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps page-specific findings in audit only when page attribution is still missing", () => {
  const validationFinding = makeValidationFinding({
    id: "val-8",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    severity: "high",
    title: "Possible undisclosed session replay",
    evidence: {
      claim: "Policy does not clearly disclose replay tooling.",
      relatedVendors: ["Microsoft Clarity"]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.confidenceInputs.hasPageAttribution, false);
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentationDecision.rationale ?? "", /contradiction findings are main-narrative candidates/i);
});

test("surfaces GPC failures as runtime-backed unified findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A browser-level opt-out preference signal appears not to have been honored during the scan.",
        fallbackEvidence: {
          gpcVerification: {
            status: "ignored",
            baselineTrackerCount: 3,
            baselineThirdPartyCookieCount: 4,
            gpcTrackerCount: 3,
            gpcThirdPartyCookieCount: 4,
            trackerCountDelta: 0,
            thirdPartyCookieCountDelta: 0,
            evidenceUrls: ["https://example.com/collect"]
          },
          signalKey: "privacy.gpc_signal_not_honored",
          signalLabel: "GPC signal not honored",
          signalValue: true,
          sourceUrls: ["https://example.com/collect"]
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.gpc_signal_not_honored",
        signalLabel: "GPC signal not honored",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "GPC signal not honored"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "gpc_signal_not_honored");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.suggestedFix ?? "", /browser-level opt-out/i);
});

test("surfaces accept-only consent UI when retained DOM labels satisfy the evidence contract", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        categoryId: "choice_symmetry_dark_pattern_indicators",
        description: "The retained consent UI text shows an accept control without a same-layer reject or preferences path.",
        fallbackEvidence: {
          accept_only_banner: true,
          consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
          consentSurfaceDiagnostics: {
            bannerRendered: true,
            hydrationSettleWaitMs: 1500,
            candidateButtons: [{ label: "accept all", visible: true, interactable: true }],
            viewportStatus: "visible_in_viewport"
          },
          consentSurfaceObserved: true,
          hybridConsentSummary: {
            acceptActionLabels: ["accept all"],
            acceptPresent: true,
            bannerPresent: true,
            bannerTextSnippet: "We use cookies to improve your experience. Accept all",
            manageActionLabels: [],
            managePresent: false,
            rejectActionLabels: [],
            rejectPresent: false
          },
          hybridConsentVisual: {
            acceptOnly: true
          },
          runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
          pageUrl: "https://example.com/",
          signalKey: "privacy.dark_pattern_accept_only_banner",
          signalLabel: "Accept-only banner detected",
          signalValue: true
        },
        observedValue: "accept all",
        severity: "high",
        signalKey: "privacy.dark_pattern_accept_only_banner",
        signalLabel: "Accept-only banner detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accept-only banner detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accept_only_banner");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://example.com/"]);
});

function buildConsentUxPacketFromEvidence(fallbackEvidence: Record<string, unknown>) {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        categoryId: "choice_symmetry_dark_pattern_indicators",
        description: "The retained consent UI structure was evaluated for first-layer reject availability.",
        fallbackEvidence: {
          pageUrl: "https://example.com/",
          runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
          signalKey: "privacy.dark_pattern_reject_button_missing",
          signalLabel: "Reject button missing",
          signalValue: true,
          ...fallbackEvidence
        },
        observedValue: "material",
        severity: "high",
        signalKey: "privacy.dark_pattern_reject_button_missing",
        signalLabel: "Reject button missing",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Reject button missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  return packet;
}

test("does not promote reject-missing when a stable first-layer reject and allow choice are visible", () => {
  const packet = buildConsentUxPacketFromEvidence({
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_present_first_layer"],
    consentSurfaceObserved: true,
    consentActionableChoiceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Allow analytics"],
      acceptPresent: true,
      bannerPresent: true,
      rejectActionLabels: ["Reject analytics"],
      rejectPresent: true
    },
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [
        { label: "Reject analytics", visible: true, interactable: true },
        { label: "Allow analytics", visible: true, interactable: true }
      ],
      viewportStatus: "visible_in_viewport"
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: true,
      rejectClickDepth: 1,
      status: "available"
    },
    reject_button_missing: true
  });

  assert.equal(packet?.unifiedFindingId, "reject_button_missing");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), false);
});

test("keeps suppressed or previously consented banner states audit-only for consent UX", () => {
  const packet = buildConsentUxPacketFromEvidence({
    consentSurfaceDecisionStates: [
      "prior_consent_or_suppressed_banner_suspected",
      "consent_surface_not_present"
    ],
    consentSurfaceObserved: false,
    consentActionableChoiceObserved: false,
    consentSurfaceDiagnostics: {
      bannerRendered: false,
      hydrationSettleWaitMs: 1500,
      priorConsentOrSuppressedBannerSuspected: true,
      relevantConsentStorageKeys: ["cookie:cs_analytics_consent"],
      cmpStateHints: ["analytics rejected stored before scan"],
      viewportStatus: "not_present"
    },
    rejectPathDepthAndAvailability: {
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: false,
      status: "not_found"
    },
    reject_button_missing: true
  });

  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.ok(packet?.evidence?.entities?.consentSurfaceDecisionStates?.includes("prior_consent_or_suppressed_banner_suspected"));
});

test("promotes accept-only stable consent surface as reject missing", () => {
  const packet = buildConsentUxPacketFromEvidence({
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceObserved: true,
    consentActionableChoiceObserved: true,
    accept_only_banner: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      manageActionLabels: [],
      managePresent: false,
      rejectActionLabels: [],
      rejectPresent: false
    },
    hybridConsentVisual: {
      acceptOnly: true
    },
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      firstObservedBannerMs: 900,
      hydrationSettleWaitMs: 2000,
      candidateButtons: [{ label: "Accept all", visible: true, interactable: true }],
      viewportStatus: "visible_in_viewport"
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: false,
      status: "not_found"
    },
    reject_button_missing: true
  });

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);
});

test("promotes retained reject-path consent evidence without optional viewport diagnostics", () => {
  const packet = buildConsentUxPacketFromEvidence({
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_absent_first_layer"],
    consentSurfaceObserved: true,
    consentActionableChoiceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Accept all"],
      acceptPresent: true,
      bannerPresent: true,
      rejectActionLabels: [],
      rejectPresent: false
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: false,
      rejectClickDepth: 2,
      status: "hidden"
    },
    reject_button_missing: true
  });

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);
  assert.equal(packet?.evidence?.entities?.consentSurfaceDecisionStates?.includes("consent_surface_unstable_or_not_evaluable"), false);
});

test("waits through delayed hydration before evaluating first-layer reject visibility", () => {
  const packet = buildConsentUxPacketFromEvidence({
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_present_first_layer"],
    consentSurfaceObserved: true,
    consentActionableChoiceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Allow analytics"],
      acceptPresent: true,
      bannerPresent: true,
      rejectActionLabels: ["Reject analytics"],
      rejectPresent: true
    },
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      firstObservedBannerMs: 1800,
      hydrationSettleWaitMs: 2500,
      candidateButtons: [
        { label: "Reject analytics", visible: true, interactable: true },
        { label: "Allow analytics", visible: true, interactable: true }
      ],
      viewportStatus: "reachable_via_scroll"
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: true,
      rejectClickDepth: 1,
      status: "available"
    },
    reject_button_missing: true
  });

  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("certscore analytics banner with reject analytics and allow analytics does not surface consent architecture", () => {
  const packet = buildConsentUxPacketFromEvidence({
    consentSurfaceDecisionStates: ["consent_surface_observed", "reject_present_first_layer"],
    consentSurfaceObserved: true,
    consentActionableChoiceObserved: true,
    hybridConsentSummary: {
      acceptActionLabels: ["Allow analytics"],
      acceptPresent: true,
      bannerPresent: true,
      bannerTextSnippet: "Help us improve CertScore with privacy-friendly analytics.",
      rejectActionLabels: ["Reject analytics"],
      rejectPresent: true
    },
    consentSurfaceDiagnostics: {
      bannerRendered: true,
      hydrationSettleWaitMs: 1500,
      candidateButtons: [
        { label: "Reject analytics", visible: true, interactable: true },
        { label: "Allow analytics", visible: true, interactable: true }
      ],
      viewportStatus: "visible_in_viewport"
    },
    rejectPathDepthAndAvailability: {
      acceptClickDepth: 1,
      bannerLayerInspected: true,
      choiceAsymmetry: "material",
      rejectAvailableOnFirstLayer: true,
      rejectClickDepth: 1,
      status: "available"
    },
    reject_button_missing: true
  });

  assert.notEqual(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.promotionEligibilities.includes("eligible"), false);
});

test("keeps weak cookie security attributes support-only by default", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            totalCookiesAnalyzed: 5,
            missingSecureCount: 2,
            missingHttpOnlyCount: 3,
            weakSameSiteCount: 1,
            thirdPartyWeakAttributeCount: 2,
            missingSecureCookieNames: ["_ga"],
            missingHttpOnlyCookieNames: ["_ga", "consent"],
            weakSameSiteCookieNames: ["_ga"],
            thirdPartyWeakAttributeCookieNames: ["_ga"]
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.evidence?.counts?.missingSecureCount, 2);
});

test("surfaces weak cookie security attributes for security-sensitive cookies", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed session cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            totalCookiesAnalyzed: 4,
            missingSecureCount: 1,
            missingHttpOnlyCount: 1,
            weakSameSiteCount: 1,
            missingSecureCookieNames: ["session_id"],
            missingHttpOnlyCookieNames: ["account_token"],
            weakSameSiteCookieNames: ["checkout_session"]
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps weak cookie security attributes audit-only when only HttpOnly examples are retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            missingHttpOnlyCount: 4,
            missingHttpOnlyCookieNames: ["_ga", "_ga_H1SWTMGGJ4"]
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces missing consent surface as a domain-level consent finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "No user-facing consent surface was detected before the site initialized consent-relevant behavior.",
        fallbackEvidence: {
          signalKey: "privacy.consent_surface_missing",
          signalLabel: "Consent surface missing",
          signalValue: true,
          consentMechanismType: "none",
          cookieBannerPresent: false,
          cmpVendorName: null,
          consentInteractionModel: "none"
        },
        observedValue: "No consent surface detected",
        severity: "high",
        signalKey: "privacy.consent_surface_missing",
        signalLabel: "Consent surface missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Consent surface missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_surface_missing");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /visible consent surface/i);
});

test("resolves live-audit reject-path title through validation-backed canonical surfacing", () => {
  const validationFinding = makeValidationFinding({
    id: "val-live-reject",
    ruleKey: "privacy.reject_control_missing_detected",
    severity: "medium",
    title: "Reject-all control missing",
    evidence: {
      uiText: ["Manage preferences", "Accept all"]
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.",
        linkedValidationFinding: validationFinding,
        fallbackEvidence: {
          pageUrl: "https://example.com",
          uiText: ["Manage preferences", "Accept all"]
        },
        observedValue: "Reject path appears less direct than accept path",
        severity: "medium",
        sourceType: "issue",
        title: "Reject path appears less direct than accept path"
      }
    ],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "reject_button_missing");
});

test("keeps consent surface missing audit-only when only weak discovery evidence is retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A consent surface may be missing, but the retained evidence is discovery-only.",
        fallbackEvidence: {
          signalKey: "privacy.consent_surface_missing",
          signalLabel: "Consent surface missing",
          signalValue: true,
          keyPageAttemptCount: 3,
          keyPageDiscoverySource: "footer_link"
        },
        observedValue: "No consent surface detected",
        severity: "high",
        signalKey: "privacy.consent_surface_missing",
        signalLabel: "Consent surface missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Consent surface missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_surface_missing");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces missing accessibility support path as a domain-level accessibility finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "No accessibility-specific support or accommodation contact path was detected during the scan.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_support_path_missing",
          signalLabel: "Accessibility support path missing",
          signalValue: true,
          accessibilityContactMethodPresent: false
        },
        observedValue: "No accessibility support path detected",
        severity: "medium",
        signalKey: "accessibility.accessibility_support_path_missing",
        signalLabel: "Accessibility support path missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility support path missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_missing");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /accessibility support path/i);
});

test("suppresses missing contact page when another support path is already retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A key disclosure or support page surface was not detected during the scan.",
        fallbackEvidence: {
          signalKey: "disclosure.contact_page_surface_missing",
          signalLabel: "Contact page missing",
          signalValue: true
        },
        observedValue: "Contact page missing",
        severity: "medium",
        signalKey: "disclosure.contact_page_surface_missing",
        signalLabel: "Contact page missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page missing"
      },
      {
        description: "The scan retained a visible accessibility support or accommodation path.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_contact_method_present",
          signalLabel: "Accessibility contact method detected",
          signalValue: true,
          accessibilityContactMethodPresent: true,
          pageUrls: ["https://www.example.com/accessibility"]
        },
        observedValue: "Accessibility support path present",
        severity: "low",
        signalKey: "accessibility.accessibility_contact_method_present",
        signalLabel: "Accessibility contact method detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility contact method detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const contactPacket = packets.find((packet) => packet.unifiedFindingId === "contact_page_missing_surface");
  assert.equal(contactPacket?.presentationDecision.status, "audit_only");
});

test("keeps accessibility risk score audit-only without representative axe examples", () => {
  const validationFinding = makeValidationFinding({
    id: "val-accessibility-risk",
    ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
    severity: "medium",
    title: "Accessibility risk score",
    evidence: ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_risk_score");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.equal(packet?.evidence?.flags?.includes("representative_accessibility_examples_retained"), false);
  assert.equal(packet?.evidence?.flags?.includes("accessibility_score_only_audit_context"), false);
  assert.equal(packet?.evidence?.counts?.accessibilityRiskScore, undefined);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_representative_accessibility_examples"), true);
});

test("surfaces split visual contrast finding for a complete moderate axe example", () => {
  const validationFinding = makeValidationFinding({
    id: "val-accessibility-risk",
    ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
    severity: "medium",
    title: "Accessibility risk score",
    evidence: ADA_ACCESSIBILITY_FIXTURES.singleModerateAxeExample
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "visual_contrast_accessibility_issue");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.evidence?.flags?.includes("representative_accessibility_examples_retained"), true);
  assert.equal(packet?.evidence?.flags?.includes("accessibility_examples_below_promotion_threshold"), false);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("accessibility_examples_below_promotion_threshold"), false);
});

test("surfaces split semantic labeling finding when representative axe examples are severe or broadly covered", () => {
  const validationFinding = makeValidationFinding({
    id: "val-accessibility-risk",
    ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
    severity: "medium",
    title: "Accessibility risk score",
    evidence: ADA_ACCESSIBILITY_FIXTURES.seriousAxeExample
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "semantic_labeling_accessibility_issue");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.presentation.confidenceScore, "1.0");
  assert.equal(packet?.evidence?.flags?.includes("contradiction_runtime_artifact_retained"), false);
  assert.equal(packet?.evidence?.flags?.includes("representative_accessibility_examples_retained"), true);
  assert.equal(packet?.evidence?.counts?.representativeAxeExampleCount, 1);
  assert.equal(packet?.evidence?.counts?.representativeAxePageCount, 1);
  assert.equal(packet?.evidence?.counts?.representativeAxeRuleCount, 1);
  assert.deepEqual(packet?.evidence?.entities?.maxAxeImpact, ["serious"]);
  assert.ok(packet?.evidence?.snippets?.some((snippet) => /Representative axe examples: 1 rule across 1 page; max impact: serious\./.test(snippet)));
});

test("keeps contrast count-only evidence audit-only", () => {
  const validationFinding = makeValidationFinding({
    id: "val-contrast-count",
    ruleKey: "accessibility_review.contrast_failures",
    severity: "low",
    title: "Contrast failures",
    evidence: {
      count: 1
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "visual_contrast_accessibility_issue");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_representative_accessibility_examples"), true);
  assert.equal(packet?.evidence?.counts?.count, 1);
});

test("surfaces visual contrast finding with complete representative axe evidence", () => {
  const validationFinding = makeValidationFinding({
    id: "val-contrast-examples",
    ruleKey: "accessibility_review.contrast_failures",
    severity: "high",
    title: "Contrast failures",
    evidence: {
      accessibilityAxeEvidence: [
        {
          description: "Elements must meet minimum color contrast ratio thresholds",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
          impact: "serious",
          nodeCount: 2,
          pageUrl: "https://example.com/",
          representativeSelectors: [".hero-title"],
          ruleId: "color-contrast"
        }
      ],
      accessibilityRuleExamples: [
        {
          description: "Detected 2 elements with insufficient color contrast.",
          help: "Elements must meet minimum color contrast ratio thresholds",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
          impact: "serious",
          nodeCount: 2,
          pageUrl: "https://example.com/",
          representativeSelectors: [".hero-title"],
          ruleCode: "color-contrast",
          ruleGroup: "wcag2aa",
          severity: "high"
        }
      ],
      count: 2
    }
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "visual_contrast_accessibility_issue");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.evidence?.flags?.includes("representative_accessibility_examples_retained"), true);
  assert.equal(packet?.evidence?.counts?.representativeAxeExampleCount, 1);
  assert.deepEqual(
    packet?.evidence?.entities?.accessibilityAxeEvidence?.map((value) => JSON.parse(value)),
    [
      {
        description: "Elements must meet minimum color contrast ratio thresholds",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        impact: "serious",
        nodeCount: 2,
        pageUrl: "https://example.com/",
        representativeSelectors: [".hero-title"],
        ruleId: "color-contrast"
      }
    ]
  );
  assert.ok(
    packet?.evidence?.snippets?.some((snippet) =>
      /Axe example: color-contrast\/wcag2aa on https:\/\/example\.com\/; selector \.hero-title; nodes 2; impact serious; severity high; help: Elements must meet minimum color contrast ratio thresholds\./.test(
        snippet
      )
    )
  );
});

test("surfaces missing sale or sharing controls as a domain-level rights finding", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Retargeting behavior was observed, but no do-not-sell/share control path was detected.",
        fallbackEvidence: {
          signalKey: "privacy.sale_sharing_controls_missing",
          signalLabel: "Sale/sharing controls missing",
          signalValue: true,
          doNotSellLinkPresent: false,
          retargetingPixelDetected: true
        },
        observedValue: "No sale/sharing control path detected",
        severity: "medium",
        signalKey: "privacy.sale_sharing_controls_missing",
        signalLabel: "Sale/sharing controls missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Sale/sharing controls missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "sale_sharing_controls_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /privacy choice/i);
});

test("surfaces CPRA CBA opt-out missing from retained runtime evidence", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "CBA vendors were observed without a CPRA-specific opt-out control.",
        fallbackEvidence: {
          cbaVendorTier1: ["adsrvr.org"],
          cbaVendorTier2: [],
          choiceControlsInspected: true,
          cpraIconDetected: false,
          findingSeverity: "high",
          gpcCbaHonored: false,
          limitation: "homepage_only",
          optOutLinkHref: null,
          optOutLinkText: null,
          optOutUiResult: "absent",
          pageUrl: "https://example.com/",
          policyCbaLanguage: "full_cba_language",
          policyUiCongruent: false,
          scanOriginGeo: null,
          signalKey: "privacy.cpra_cba_opt_out_missing",
          signalValue: true,
          suppressorApplied: null,
          unifiedFindingId: "cpra_cba_opt_out_missing"
        },
        observedValue: "absent",
        severity: "high",
        signalKey: "privacy.cpra_cba_opt_out_missing",
        signalLabel: "CPRA CBA opt-out missing",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "CPRA CBA opt-out missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const [packet] = packets;

  assert.equal(packet?.unifiedFindingId, "cpra_cba_opt_out_missing");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.suggestedFix ?? "", /Your Privacy Choices/i);
});

test("keeps CPRA CBA opt-out missing audit-only when retained evidence is adtech-only", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "CBA vendors were observed without a CPRA-specific opt-out control.",
        fallbackEvidence: {
          cbaVendorTier1: ["adsrvr.org"],
          cbaVendorTier2: [],
          cpraIconDetected: false,
          findingSeverity: "critical",
          gpcCbaHonored: false,
          limitation: "homepage_only",
          optOutLinkHref: null,
          optOutLinkText: null,
          optOutUiResult: "absent",
          pageUrl: "https://example.com/",
          policyCbaLanguage: "absent",
          policyUiCongruent: true,
          scanOriginGeo: null,
          signalKey: "privacy.cpra_cba_opt_out_missing",
          signalValue: true,
          suppressorApplied: null,
          unifiedFindingId: "cpra_cba_opt_out_missing"
        },
        observedValue: "absent",
        severity: "high",
        signalKey: "privacy.cpra_cba_opt_out_missing",
        signalLabel: "CPRA CBA opt-out missing",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "CPRA CBA opt-out missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((candidate) => candidate.unifiedFindingId === "cpra_cba_opt_out_missing");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("audit_only"), true);
});

test("surfaces privacy-rights path present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear policy-based privacy-rights request path.",
        fallbackEvidence: {
          signalKey: "privacy.privacy_rights_path_present",
          signalLabel: "Privacy-rights path present",
          signalValue: true,
          policySnippets: ["You may request access to, delete, or export your information through our Privacy Rights Center."],
          policyRightsSignals: ["access", "delete", "export"],
          pageUrl: "https://www.example.com/privacy"
        },
        observedValue: "Privacy-rights path present",
        severity: "low",
        signalKey: "privacy.privacy_rights_path_present",
        signalLabel: "Privacy-rights path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy-rights path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_rights_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /privacy-rights path/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "You may request access to, delete, or export your information through our Privacy Rights Center."
  ]);
});

test("surfaces privacy contact path present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear privacy-specific contact path in the policy.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["If you have questions about this Privacy Policy, contact us at privacy@example.com."],
          privacyContactChannelType: "email",
          signalKey: "privacy.privacy_contact_path_present",
          signalLabel: "Privacy contact path present",
          signalValue: true
        },
        observedValue: "Privacy contact path present",
        severity: "low",
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy contact path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_contact_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("surfaces privacy policy present from snapshot disclosure evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Privacy Policy | Example"],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Privacy policy fetched",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.presentationDecision.verificationState, "runtime");
  assert.equal(packet?.presentationDecision.verificationLabel, "Runtime evidence");
  assert.deepEqual(packet?.presentationDecision.downgradeReasons, []);
  assert.equal(packet?.evidence?.pageUrls?.[0], "https://www.example.com/privacy");
  assert.match(packet?.presentation.whyThisMatters ?? "", /visible privacy policy surface/i);
});

test("dedupes equivalent privacy policy snippets that differ only by trailing punctuation", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Privacy Policy", "Privacy Policy."],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Privacy policy fetched",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_present");
  assert.deepEqual(packet?.evidence?.snippets, ["Privacy Policy"]);
});

test("surfaces legal entity name present from financial entity evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a public-facing operator identity surface naming the site's legal entity.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/about"],
          policySnippets: ["Example Capital LLC"],
          signalKey: "entity.legal_entity_name_text_present",
          signalLabel: "Legal entity name text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/about"]
        },
        observedValue: "Legal entity name text present",
        severity: "low",
        signalKey: "entity.legal_entity_name_text_present",
        signalLabel: "Legal entity name text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Legal entity name text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "legal_entity_name_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /legal entity name/i);
});

test("surfaces operator contact path present from financial entity evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a public-facing operator contact path.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/contact"],
          policySnippets: ["Contact our operator team at support@example.com"],
          signalKey: "entity.contact_email_present",
          signalLabel: "Contact email present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/contact"]
        },
        observedValue: "Contact email present",
        severity: "low",
        signalKey: "entity.contact_email_present",
        signalLabel: "Contact email present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact email present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "operator_contact_path_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /operator contact path/i);
});

test("keeps legal entity name present audit-only when only thin financial entity evidence is retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a possible operator identity signal.",
        fallbackEvidence: {
          signalKey: "entity.legal_entity_name_text_present",
          signalLabel: "Legal entity name text present",
          signalValue: true
        },
        observedValue: "Legal entity name text present",
        severity: "low",
        signalKey: "entity.legal_entity_name_text_present",
        signalLabel: "Legal entity name text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Legal entity name text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "legal_entity_name_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
});

test("surfaces investment risk disclosure present from financial disclosure evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained explicit risk disclosure text on a public-facing offer or disclosure page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/risk-disclosure"],
          policySnippets: ["Your capital is at risk and you may lose more than your initial investment."],
          signalKey: "financial.loss_risk_disclosure_text_present",
          signalLabel: "Loss-risk disclosure text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/risk-disclosure"]
        },
        observedValue: "Loss-risk disclosure text present",
        severity: "low",
        signalKey: "financial.loss_risk_disclosure_text_present",
        signalLabel: "Loss-risk disclosure text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Loss-risk disclosure text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "investment_risk_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /investment-risk disclosure/i);
});

test("surfaces fee disclosure present from explicit financial fee evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained explicit fee disclosure text on a public-facing pricing or offer page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/pricing"],
          policySnippets: ["A monthly fee of $25 applies to premium managed accounts."],
          signalKey: "commercial.explicit_fee_disclosure_text_present",
          signalLabel: "Explicit fee disclosure text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/pricing"]
        },
        observedValue: "Explicit fee disclosure text present",
        severity: "low",
        signalKey: "commercial.explicit_fee_disclosure_text_present",
        signalLabel: "Explicit fee disclosure text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Explicit fee disclosure text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "fee_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /fee disclosure/i);
});

test("surfaces past performance disclaimer present from exact disclaimer text", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained an explicit past-performance disclaimer on a public-facing strategy or disclosure page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/strategies"],
          policySnippets: ["Past performance does not guarantee future results."],
          signalKey: "financial.past_performance_disclaimer_text_present",
          signalLabel: "Past-performance disclaimer text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/strategies"]
        },
        observedValue: "Past-performance disclaimer text present",
        severity: "low",
        signalKey: "financial.past_performance_disclaimer_text_present",
        signalLabel: "Past-performance disclaimer text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Past-performance disclaimer text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "past_performance_disclaimer_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /past-performance disclaimer/i);
});

test("surfaces APR or interest-rate disclosure present from explicit rate text", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained explicit APR or interest-rate text on a public-facing financial offer page.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/cards/gold"],
          policySnippets: ["Variable APR 24.99% applies after the introductory period."],
          signalKey: "financial.apr_or_interest_rate_disclosure_text_present",
          signalLabel: "APR or interest-rate disclosure text present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/cards/gold"]
        },
        observedValue: "APR or interest-rate disclosure text present",
        severity: "low",
        signalKey: "financial.apr_or_interest_rate_disclosure_text_present",
        signalLabel: "APR or interest-rate disclosure text present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "APR or interest-rate disclosure text present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "apr_or_interest_rate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.match(packet?.presentation.whyThisMatters ?? "", /interest-rate disclosure|APR/i);
});

test("surfaces targeted advertising choices present from a do-not-sell link signal", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy-choices"],
          policySnippets: ["Your Privacy Choices | Example"],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy-choices"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("sanitizes targeted advertising choices evidence to drop weak homepage placeholders", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: [
            "https://www.example.com/",
            "https://www.example.com/privacy",
            "https://www.example.com/#"
          ],
          policySnippets: [
            "Breaking News, Latest News and Videos | Example",
            "Your Privacy Choices"
          ],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: [
            "https://www.example.com/",
            "https://www.example.com/privacy",
            "https://www.example.com/#"
          ]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.example.com/privacy"]);
  assert.deepEqual(packet?.evidence?.snippets, ["Your Privacy Choices"]);
});

test("prefers privacy-choice snippets over generic privacy policy text for targeted advertising choices", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Privacy Policy", "Manage Cookies"],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.deepEqual(packet?.evidence?.snippets, ["Manage Cookies"]);
});

test("normalizes whitespace-heavy targeted advertising snippets before final evidence assembly", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained a reachable targeted-advertising or do-not-sell/share choice path that users can use to manage related privacy controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["\n Manage Cookies\n"],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "targeted_advertising_choices_present");
  assert.deepEqual(packet?.evidence?.snippets, ["Manage Cookies"]);
});

test("reclassifies guessed do-not-sell evidence into a privacy-rights path when no explicit control surface was retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained policy text describing privacy rights, but the guessed do-not-sell path itself was not verified as a reachable user-facing control surface.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/cookies"],
          keyPageGuessedOnly: true,
          pageUrls: ["https://www.example.com/privacy-policy"],
          policySnippets: [
            "CCPA Privacy Rights (Do Not Sell My Personal Information) Under the CCPA, among other rights, consumers may request access to their data."
          ],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy-policy"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_rights_path_present");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/privacy-policy"]);
});

test("keeps affiliate disclosure audit-only when only the path was retained without visible page text", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path that signals when recommendations or links may involve a financial relationship.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/affiliates"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/affiliates"]
        },
        observedValue: "Affiliate disclosure present",
        severity: "medium",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.presentationDecision.verificationState, "runtime");
  assert.equal(packet?.presentationDecision.verificationLabel, "Runtime evidence");
  assert.ok(
    packet?.presentationDecision.downgradeReasons.includes(
      "A likely disclosure URL was discovered, but readable user-facing page content was not verified."
    )
  );
});

test("suppresses weak cookie obstruction when a cookie policy surface is already retained", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/#"],
          signalKey: "disclosure.cookie_policy_structurally_obstructed",
          signalLabel: "Cookie policy structurally obstructed",
          signalValue: true
        },
        observedValue: "Cookie policy structurally obstructed",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_structurally_obstructed",
        signalLabel: "Cookie policy structurally obstructed",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Cookie policy structurally obstructed"
      },
      {
        description: "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/cookies"],
          policySnippets: ["Cookie Settings | Example"],
          signalKey: "disclosure.cookie_policy_present",
          signalLabel: "Cookie policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/cookies"]
        },
        observedValue: "Cookie policy fetched",
        severity: "low",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const obstructionPacket = packets.find((packet) => packet.unifiedFindingId === "cookie_policy_structurally_obstructed");
  assert.equal(obstructionPacket?.presentationDecision.status, "audit_only");
});

test("suppresses weak cookie policy present when only a root placeholder was retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable cookie-policy or cookie-settings surface that users can use to find tracking disclosures and related controls.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/"],
          policySnippets: ["Home | Example"],
          signalKey: "disclosure.cookie_policy_present",
          signalLabel: "Cookie policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/#"]
        },
        observedValue: "Cookie policy fetched",
        severity: "low",
        signalKey: "disclosure.cookie_policy_present",
        signalLabel: "Cookie policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, []);
  assert.match(packet?.presentation.whyThisMatters ?? "", /visible cookie policy or settings surface/i);
});

test("filters machine-readable privacy policy json blobs out of reviewer-facing snippets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface that users and reviewers can use to find core notice disclosures.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: [
            "{\"schemaType\":\"content\",\"schemaVersion\":2,\"notices\":{\"abc\":{\"content\":\"Example\"}}}"
          ],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy fetched",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy"]
        },
        observedValue: "Privacy policy fetched",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_present");
  assert.deepEqual(packet?.evidence?.snippets ?? [], []);
  assert.match(packet?.observedValue ?? "", /reachable privacy-policy surface/i);
});

test("suppresses locale-subdomain terms surfaces when no canonical root-domain terms page was retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.",
        fallbackEvidence: {
          pageUrls: ["https://arabic.example.com/terms"],
          policySnippets: ["شروط الاستخدام"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms page fetched",
          signalValue: true,
          sourceUrls: ["https://arabic.example.com/terms"]
        },
        observedValue: "Terms page fetched",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "terms_of_service_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, []);
});

test("surfaces terms surfaces when fallback evidence retains a canonical root-domain terms url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.",
        fallbackEvidence: {
          pageUrls: ["https://www.cnn.com/terms"],
          policySnippets: ["Terms of Use"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms page fetched",
          signalValue: true,
          sourceUrls: ["https://www.cnn.com/terms"]
        },
        observedValue: "Terms page fetched",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "terms_of_service_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.cnn.com/terms"]);
});

test("prefers resolved non-root help urls over generic help roots in contact evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a visible contact or help path.",
        fallbackEvidence: {
          pageUrls: ["https://help.cnn.com/us", "https://help.cnn.com/"],
          policySnippets: ["CNN | Help Center"],
          signalKey: "disclosure.contact_page_present",
          signalLabel: "Contact page fetched",
          signalValue: true,
          sourceUrls: ["https://help.cnn.com/us", "https://help.cnn.com/"]
        },
        observedValue: "Contact page fetched",
        severity: "medium",
        signalKey: "disclosure.contact_page_present",
        signalLabel: "Contact page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "contact_support_path_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://help.cnn.com/us"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://help.cnn.com/us"]);
});

test("prefers canonical root-domain terms urls over locale alternates in final evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable terms surface that users and reviewers can use to find the site's core legal terms.",
        fallbackEvidence: {
          pageUrls: ["https://www.cnn.com/terms", "https://arabic.cnn.com/terms"],
          policySnippets: ["Terms and Conditions"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms page fetched",
          signalValue: true,
          sourceUrls: ["https://www.cnn.com/terms", "https://arabic.cnn.com/terms"]
        },
        observedValue: "Terms page fetched",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms page fetched",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms page fetched"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "terms_of_service_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.cnn.com/terms"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.cnn.com/terms"]);
});

test("prefers contact-specific snippets over rights snippets for privacy contact path", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear privacy-specific contact path in the policy.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: [
            "If you have questions about this Privacy Policy, contact us at privacy@example.com.",
            "You may request access to, delete, or export your information through our Privacy Rights Center."
          ],
          privacyContactChannelType: "email",
          signalKey: "privacy.privacy_contact_path_present",
          signalLabel: "Privacy contact path present",
          signalValue: true
        },
        observedValue: "Privacy contact path present",
        severity: "low",
        signalKey: "privacy.privacy_contact_path_present",
        signalLabel: "Privacy contact path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy contact path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.evidence?.snippets?.[0], "If you have questions about this Privacy Policy, contact us at privacy@example.com.");
});

test("surfaces privacy-rights path present from the policyRightsSignals report key", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear policy-based privacy-rights request path.",
        fallbackEvidence: {
          signalKey: "policyRightsSignals",
          signalLabel: "Privacy-rights path present",
          signalValue: ["access", "delete", "authorized_agent"],
          policySnippets: ["Use our Privacy Rights Center to submit access and deletion requests."],
          policyRightsSignals: ["access", "delete", "authorized_agent"],
          pageUrl: "https://www.example.com/privacy"
        },
        observedValue: "Privacy-rights path present",
        severity: "low",
        signalKey: "policyRightsSignals",
        signalLabel: "Privacy-rights path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy-rights path present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_rights_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /privacy-rights path/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "Use our Privacy Rights Center to submit access and deletion requests."
  ]);
});

test("suppresses guessed-only cookie policy unavailable findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A guessed cookie policy target could not be retrieved successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://example.com/cookiebeleid", "https://example.com/Cookiebeleid"],
          keyPageGuessedOnly: true,
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalLabel: "Cookie policy not retrievable",
          signalValue: true
        },
        observedValue: "Cookie policy not retrievable",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy not retrievable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy not retrievable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_unavailable");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("suppresses discovery-only cookie policy unavailable findings without strong linked-source evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "A cookie policy target discovered during bounded scanning could not be retrieved successfully.",
        fallbackEvidence: {
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://example.com/cookiebeleid", "https://example.com/Cookiebeleid"],
          keyPageDiscoverySource: "same_brand_subdomain",
          keyPageGuessedOnly: false,
          signalKey: "disclosure.cookie_policy_fetch_failed",
          signalLabel: "Cookie policy not retrievable",
          signalValue: true
        },
        observedValue: "Cookie policy not retrievable",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy not retrievable",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy not retrievable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cookie_policy_unavailable");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("surfaces accessibility support path present from snapshot evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a visible accessibility support or accommodation path.",
        fallbackEvidence: {
          signalKey: "accessibility.accessibility_contact_method_present",
          signalLabel: "Accessibility contact method detected",
          signalValue: true,
          accessibilityContactMethodPresent: true
        },
        observedValue: "Accessibility support path present",
        severity: "low",
        signalKey: "accessibility.accessibility_contact_method_present",
        signalLabel: "Accessibility contact method detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility contact method detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /accessibility support path/i);
});

test("prefers dedicated accessibility urls over generic help urls in final accessibility evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a visible accessibility support or accommodation path.",
        fallbackEvidence: {
          pageUrls: ["https://www.cnn.com/accessibility", "https://help.cnn.com/us"],
          policySnippets: ["Accessibility Video & Closed Captioning for IP-delivered Video | CNN"],
          signalKey: "accessibility.accessibility_contact_method_present",
          signalLabel: "Accessibility contact method detected",
          signalValue: true,
          sourceUrls: ["https://www.cnn.com/accessibility", "https://help.cnn.com/us"]
        },
        observedValue: "Accessibility support path present",
        severity: "low",
        signalKey: "accessibility.accessibility_contact_method_present",
        signalLabel: "Accessibility contact method detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility contact method detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_support_path_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.cnn.com/accessibility"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, ["https://www.cnn.com/accessibility"]);
});

test("keeps weak cookie security attributes audit-only without cookie examples", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Observed cookies appear to rely on weaker security attributes than expected.",
        fallbackEvidence: {
          cookieAttributeSummary: {
            missingSecureCount: 2,
            weakSameSiteCount: 1
          },
          signalKey: "privacy.weak_cookie_security_attributes_detected",
          signalLabel: "Weak cookie security attributes",
          signalValue: true
        },
        observedValue: "Weak cookie security attributes",
        severity: "medium",
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Weak cookie security attributes"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "weak_cookie_security_attributes");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("keeps contradiction findings audit-only without both policy text and concrete runtime evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Compare the supporting evidence against the public-facing policy language and confirm whether the mismatch is real.",
        fallbackEvidence: {
          claim: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
          pageUrl: "https://www.example.com/privacy",
          relatedVendors: ["Adobe Analytics", "Meta Pixel"]
        },
        observedValue: "Consent-gated tracking claim conflict",
        severity: "high",
        sourceType: "issue",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_gated_tracking_claim_conflict");
  assert.equal(packet?.presentationDecision.status, "suppress");
});

test("keeps consent-gated tracking claim conflict audit-only even with partial contradiction support", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Compare the supporting evidence against the public-facing policy language and confirm whether the mismatch is real.",
        fallbackEvidence: {
          claim: "The policy and consent surface imply tracking should begin only after a valid consent interaction.",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["The policy and consent surface imply tracking should begin only after a valid consent interaction."],
          relatedVendors: ["Adobe Analytics", "Meta Pixel"],
          runtimeVendors: ["Adobe Analytics", "Meta Pixel"]
        },
        observedValue: "Consent-gated tracking claim conflict",
        severity: "high",
        sourceType: "issue",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_gated_tracking_claim_conflict");
  assert.equal(packet?.presentationDecision.status, "suppress");
});

test("surfaces consent-gated tracking claim conflict with complete policy anchor, request URL, and bridge evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Google Analytics fired before consent.",
        fallbackEvidence: {
          contradictionEvidence: {
            claim: "Optional analytics cookies only run after consent.",
            contradictionBasis: "Analytics fired before consent.",
            conflictBridge: {
              conflictType: "declared_only_necessary_cookies_before_choice_but_non_essential_tracking_fired",
              reasoning: "The policy says optional analytics cookies only run after consent, but a Google Analytics request fired pre-consent.",
              supportsPromotion: true,
              provenance: {
                bridgeRuleId: "policy_behavior_contradiction:only_necessary_cookies_before_choice:analytics_vendor_fired_pre_consent",
                generatedBy: "wc01.test_fixture",
                mappingType: "deterministic_policy_runtime_mapping",
                mappingVersion: "policy_behavior_conflict_map:v1",
                policyAnchorRef: "https://www.example.com/privacy",
                runtimeAnchorRef: "https://www.google-analytics.com/g/collect?v=2",
                sourceEvidenceIds: [
                  "https://www.example.com/privacy",
                  "https://www.google-analytics.com/g/collect?v=2"
                ]
              }
            },
            evidenceSufficiency: {
              conflictBridgePresent: true,
              policyAnchorPresent: true,
              promotionEligible: true,
              reviewStatus: "complete",
              runtimeAnchorPresent: true
            },
            policyAnchor: {
              claimType: "only_necessary_cookies_before_choice",
              confidence: 0.86,
              extractionStatus: "fetched",
              normalizedClaim: "Optional analytics cookies only run after consent.",
              snippet: "Optional analytics cookies only run after consent.",
              sourceUrl: "https://www.example.com/privacy"
            },
            policySnippet: "Optional analytics cookies only run after consent.",
            policySourceUrl: "https://www.example.com/privacy",
            runtimeAnchor: {
              confidence: 0.82,
              cookies: [],
              observationType: "analytics_vendor_fired_pre_consent",
              phase: "pre_consent",
              requests: ["https://www.google-analytics.com/g/collect?v=2"],
              sourceUrl: "https://www.example.com/",
              storageArtifacts: [],
              vendors: ["Google Analytics"]
            },
            runtimeEvidenceArtifacts: ["https://www.google-analytics.com/g/collect?v=2"],
            runtimeSummary: "Google Analytics request fired before consent.",
            runtimeVendors: ["Google Analytics"],
            sourceUrls: ["https://www.example.com/privacy"],
            supportingSignals: ["consent_gating_claim"]
          }
        },
        observedValue: "Consent-gated tracking claim conflict",
        severity: "high",
        sourceType: "issue",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "consent_gated_tracking_claim_conflict");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.equal(packet?.surfacingDecision.reportable, false);
});

test("surfaces tracking technologies disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing cookies, pixels, tags, beacons, scripts, or similar technologies.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["We use cookies, pixels, tags, beacons, scripts, and similar technologies."],
          signalKey: "privacy.tracking_technologies_disclosure_present",
          signalLabel: "Tracking technologies disclosure present",
          signalValue: true
        },
        observedValue: "Tracking technologies disclosure present",
        severity: "low",
        signalKey: "privacy.tracking_technologies_disclosure_present",
        signalLabel: "Tracking technologies disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Tracking technologies disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "tracking_technologies_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /tracking-technologies disclosure/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "We use cookies, pixels, tags, beacons, scripts, and similar technologies."
  ]);
});

test("surfaces privacy rights path present from policy enrichment evidence", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy",
        policy_dsar_mechanism: "present",
        policy_evidence_snippets: {
          dsar: "To exercise your privacy rights, submit a request to access, delete, or correct your personal information."
        },
        policy_rights_signals: ["access_request", "delete_request"],
        policy_semantic_confidence: 0.82
      }
    ],
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "privacy_rights_path_present");

  assert.equal(packet?.unifiedFindingId, "privacy_rights_path_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.snippets, [
    "To exercise your privacy rights, submit a request to access, delete, or correct your personal information."
  ]);
});

test("surfaces third-party advertising disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing advertising partners or related third-party ad technologies.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["Our advertising partners may use cookies, JavaScript, or web beacons in their respective advertisements and links."],
          signalKey: "privacy.third_party_advertising_disclosure_present",
          signalLabel: "Third-party advertising disclosure present",
          signalValue: true
        },
        observedValue: "Third-party advertising disclosure present",
        severity: "low",
        signalKey: "privacy.third_party_advertising_disclosure_present",
        signalLabel: "Third-party advertising disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Third-party advertising disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "third_party_advertising_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps third-party advertising disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing advertising partners or related third-party ad technologies.",
        fallbackEvidence: {
          policySummaryShort: "Our advertising partners may use cookies, JavaScript, or web beacons in their respective advertisements and links.",
          signalKey: "privacy.third_party_advertising_disclosure_present",
          signalLabel: "Third-party advertising disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Third-party advertising disclosure present",
        severity: "low",
        signalKey: "privacy.third_party_advertising_disclosure_present",
        signalLabel: "Third-party advertising disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Third-party advertising disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "third_party_advertising_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("retains behavioral analytics disclosure evidence from policy enrichment", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing behavioral analytics or replay-style tooling.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policyPositiveSnippetKeys: ["topic:session_replay_disclosure", "session_replay_disclosure"],
          policyPositiveTopic: "behavioral_analytics_disclosure",
          policySnippets: ["On certain pages, we use third-party tools to observe mouse movements, clicks, keystrokes, entered text, and pages visited."],
          signalKey: "privacy.behavioral_analytics_disclosure_present",
          signalLabel: "Behavioral analytics disclosure present",
          signalValue: true
        },
        observedValue: "Behavioral analytics disclosure present",
        severity: "low",
        signalKey: "privacy.behavioral_analytics_disclosure_present",
        signalLabel: "Behavioral analytics disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Behavioral analytics disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "behavioral_analytics_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.match(packet?.presentation.whyThisMatters ?? "", /behavioral analytics/i);
  assert.deepEqual(packet?.evidence?.snippets, [
    "On certain pages, we use third-party tools to observe mouse movements, clicks, keystrokes, entered text, and pages visited."
  ]);
  assert.deepEqual(packet?.evidence?.entities?.policyPositiveSnippetKeys, [
    "topic:session_replay_disclosure",
    "session_replay_disclosure"
  ]);
  assert.ok(packet?.evidence?.flags?.includes("policy_positive_topic:behavioral_analytics_disclosure"));
});

test("surfaces visitor-use analytics tool disclosure from policy enrichment", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://tradingnut.com/legal/privacy",
        policy_evidence_snippets: {
          "topic:session_replay_disclosure":
            "We use analytics tools (e.g., Google Analytics) and session cookies to understand how visitors use our Services."
        }
      }
    ],
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "behavioral_analytics_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "review");
  assert.equal(packet?.primaryPageUrl, "https://tradingnut.com/legal/privacy");
  assert.deepEqual(packet?.evidence?.snippets, [
    "We use analytics tools (e.g., Google Analytics) and session cookies to understand how visitors use our Services."
  ]);
});

test("surfaces behavioral tracking disclosure retained under tracking-technology topic", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://wolfxsignals.com/legal/privacy",
        policy_evidence_snippets: {
          "topic:tracking_technologies_disclosure":
            "Tracking tools such as Google Analytics, Meta Pixel, or others may collect behavioral data anonymously and track your use of the site."
        }
      }
    ],
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "behavioral_analytics_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.primaryPageUrl, "https://wolfxsignals.com/legal/privacy");
  assert.deepEqual(packet?.evidence?.snippets, [
    "Tracking tools such as Google Analytics, Meta Pixel, or others may collect behavioral data anonymously and track your use of the site."
  ]);
});

test("keeps behavioral analytics disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure describing behavioral analytics or replay-style tooling.",
        fallbackEvidence: {
          policySummaryShort:
            "On certain pages, we use third-party tools to observe mouse movements, clicks, keystrokes, entered text, and pages visited.",
          signalKey: "privacy.behavioral_analytics_disclosure_present",
          signalLabel: "Behavioral analytics disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Behavioral analytics disclosure present",
        severity: "low",
        signalKey: "privacy.behavioral_analytics_disclosure_present",
        signalLabel: "Behavioral analytics disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Behavioral analytics disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "behavioral_analytics_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("surfaces affiliate disclosure present from snapshot evidence", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          pageUrl: "https://www.kbdlab.io/affiliate-disclosure",
          policySnippets: ["Affiliate Disclosure | KBD Lab"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const scopePacket = packets.find((packet) => packet.unifiedFindingId === "affiliate_disclosure_scope_limited");
  const affiliatePacket = packets.find((packet) => packet.unifiedFindingId === "affiliate_disclosure_present");
  assert.equal(scopePacket?.presentationDecision.status, "surface");
  assert.equal(affiliatePacket?.presentationDecision.status, "audit_only");
});

test("surfaces affiliate disclosure when retained affiliate summary text is available", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/affiliates"],
          policySummaryShort: "We may earn a commission from purchases made through links on this page.",
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://www.example.com/affiliates",
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.snippets, [
    "We may earn a commission from purchases made through links on this page."
  ]);
});

test("keeps affiliate disclosure page urls user-facing even when source urls retain machine endpoints", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/affiliates"],
          pageUrls: ["https://www.example.com/affiliates"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://www.example.com/affiliates",
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(packet?.evidence?.pageUrls, ["https://www.example.com/affiliates"]);
  assert.deepEqual(packet?.evidence?.sourceUrls, [
    "https://www.example.com/affiliates",
    "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
  ]);
});

test("keeps affiliate disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          policySummaryShort: "We may earn a commission from purchases made through links on this page.",
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "affiliate_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("synthesizes affiliate disclosure scope review when evidence only shows a dedicated disclosure page", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear affiliate disclosure path.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/affiliate-disclosure"],
          policySnippets: ["Affiliate Disclosure | Example"],
          signalKey: "commerce.affiliate_disclosure_present",
          signalLabel: "Affiliate disclosure present",
          signalValue: true
        },
        observedValue: "Affiliate disclosure present",
        severity: "low",
        signalKey: "commerce.affiliate_disclosure_present",
        signalLabel: "Affiliate disclosure present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Affiliate disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const scopePacket = packets.find((packet) => packet.unifiedFindingId === "affiliate_disclosure_scope_limited");
  assert.equal(scopePacket?.presentationDecision.status, "surface");
  assert.match(scopePacket?.presentation.whyThisMatters ?? "", /affiliate disclosure/i);
});

test("synthesizes retained surface title mismatch when the fetched title conflicts with the surface type", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface.",
        fallbackEvidence: {
          keyPageTitleRecords: [
            {
              title: "Affiliate Disclosure | Example",
              url: "https://www.example.com/privacy-policy"
            }
          ],
          pageUrls: ["https://www.example.com/privacy-policy"],
          policySnippets: ["Affiliate Disclosure | Example"],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy surface present",
          signalValue: true
        },
        observedValue: "Privacy policy surface present",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy surface present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy surface present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const mismatchPacket = packets.find((packet) => packet.unifiedFindingId === "surface_title_mismatch");
  assert.equal(mismatchPacket?.presentationDecision.status, "surface");
  assert.deepEqual(mismatchPacket?.evidence?.snippets, ["Affiliate Disclosure | Example"]);
});

test("surface title mismatch prefers legal/privacy attribution when multiple retained surfaces mismatch", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear contact surface.",
        fallbackEvidence: {
          keyPageTitleRecords: [
            {
              title: "Creative Content IP Protection | Example",
              url: "https://www.example.com/contact"
            }
          ],
          pageUrls: ["https://www.example.com/contact"],
          policySnippets: ["Creative Content IP Protection | Example"],
          signalKey: "disclosure.contact_page_present",
          signalLabel: "Contact page present",
          signalValue: true
        },
        observedValue: "Contact page present",
        severity: "low",
        signalKey: "disclosure.contact_page_present",
        signalLabel: "Contact page present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page present"
      },
      {
        description: "The scan retained a reachable privacy-policy surface.",
        fallbackEvidence: {
          keyPageTitleRecords: [
            {
              title: "Creative Content IP Protection | Example",
              url: "https://www.example.com/privacy"
            }
          ],
          pageUrls: ["https://www.example.com/privacy"],
          policySnippets: ["Creative Content IP Protection | Example"],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy surface present",
          signalValue: true
        },
        observedValue: "Privacy policy surface present",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy surface present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy surface present"
      },
      {
        description: "The scan retained a reachable terms surface.",
        fallbackEvidence: {
          keyPageTitleRecords: [
            {
              title: "Creative Content IP Protection | Example",
              url: "https://www.example.com/terms"
            }
          ],
          pageUrls: ["https://www.example.com/terms"],
          policySnippets: ["Creative Content IP Protection | Example"],
          signalKey: "disclosure.terms_of_service_present",
          signalLabel: "Terms surface present",
          signalValue: true
        },
        observedValue: "Terms surface present",
        severity: "low",
        signalKey: "disclosure.terms_of_service_present",
        signalLabel: "Terms surface present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Terms surface present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const mismatchPacket = packets.find((packet) => packet.unifiedFindingId === "surface_title_mismatch");
  assert.equal(mismatchPacket?.primaryPageUrl, "https://www.example.com/privacy");
  assert.equal(mismatchPacket?.sourceUrl, "https://www.example.com/privacy");
  assert.equal(mismatchPacket?.sourceLabel, "Multiple surfaces");
  assert.match(mismatchPacket?.summary ?? "", /Multiple retained disclosure or support surfaces/i);
  assert.deepEqual(mismatchPacket?.evidence?.pageUrls, [
    "https://www.example.com/privacy",
    "https://www.example.com/terms",
    "https://www.example.com/contact"
  ]);
});

test("synthesizes policy clarity risk from boilerplate-heavy legal text", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a reachable privacy-policy surface.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/privacy-policy"],
          policySnippets: [
            "Advertising Partners Privacy Policies",
            "Cookies and Web Beacons",
            "Log Files"
          ],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy surface present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/privacy-policy"]
        },
        observedValue: "Privacy policy surface present",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy surface present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy surface present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const clarityPacket = packets.find((packet) => packet.unifiedFindingId === "policy_clarity_risk");
  assert.equal(clarityPacket?.presentationDecision.status, "surface");
});

test("retains policy enrichment boilerplate evidence for policy clarity risk", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy",
        policy_evidence_snippets: {
          generic_ad_partner_disclosure:
            "Advertising Partners Privacy Policies describe a broad relationship with advertising partners without naming controls or implementation details.",
          generic_cookie_web_beacons:
            "Cookies and Web Beacons are referenced using generic template language that is not tied to the site's observed tracking behavior.",
          generic_log_files:
            "Log Files language describes IP addresses, browser type, and timestamps without a clear retention or sharing explanation."
        },
        policy_semantic_confidence: 0.72,
        policy_snippet_count: 3
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const clarityPacket = packets.find((packet) => packet.unifiedFindingId === "policy_clarity_risk");
  assert.equal(clarityPacket?.presentationDecision.status, "surface");
  assert.ok(clarityPacket?.evidence?.flags?.includes("policy_boilerplate_signals_retained"));
  assert.ok((clarityPacket?.evidence?.entities?.policyBoilerplateSignals?.length ?? 0) >= 2);
});

test("retains policy enrichment evidence for missing privacy contact channel", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy",
        privacy_contact_channel_type: "none",
        policy_evidence_snippets: {
          data_collection:
            "This privacy policy explains how personal information is collected, used, shared, retained, protected, and disclosed to service providers.",
          data_rights:
            "The policy describes user rights and account settings, but the retained text does not identify any dedicated request channel for privacy questions."
        },
        policy_semantic_confidence: 0.72,
        policy_snippet_count: 2
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const contactMissing = packets.find((packet) => packet.unifiedFindingId === "privacy_contact_channel_missing");
  assert.equal(contactMissing?.presentationDecision.status, "surface");
  assert.deepEqual(contactMissing?.evidence?.entities?.privacyContactChannelType, ["none"]);
  assert.equal(contactMissing?.primaryPageUrl, "https://www.example.com/privacy");
});

test("does not retain missing privacy contact when policy text names a privacy contact", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    policyEnrichment: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy",
        privacy_contact_channel_type: "none",
        policy_evidence_snippets: {
          notice_contact: "Contact our privacy team at privacy@example.com for personal information requests."
        },
        policy_semantic_confidence: 0.72,
        policy_snippet_count: 1
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "privacy_contact_channel_missing"), false);
});

test("suppresses fetch-failed coverage gaps when another retained finding already verified the same target url", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear contact path.",
        fallbackEvidence: {
          pageUrls: ["https://www.example.com/contact-us"],
          policySnippets: ["Contact Us | Example"],
          signalKey: "disclosure.contact_page_present",
          signalLabel: "Contact page present",
          signalValue: true,
          sourceUrls: ["https://www.example.com/contact-us"]
        },
        observedValue: "Contact page present",
        severity: "low",
        signalKey: "disclosure.contact_page_present",
        signalLabel: "Contact page present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Contact page present"
      },
      {
        description: "A key disclosure or support page was linked from the scanned site, but automated retrieval of that target was limited during the scan.",
        fallbackEvidence: {
          fetchQuality: "unreachable",
          keyPageAttemptCount: 2,
          keyPageAttemptedUrls: ["https://www.example.com/contact-us", "https://www.example.com/contact"],
          pageUrls: ["https://www.example.com/contact-us", "https://www.example.com/contact"],
          signalKey: "disclosure.contact_page_fetch_failed",
          signalLabel: "Contact page not retrievable",
          signalValue: true,
          sourceUrls: ["https://www.example.com/contact-us", "https://www.example.com/contact"]
        },
        observedValue: "Contact page not retrievable",
        severity: "medium",
        sourceType: "issue",
        title: "Contact page not retrievable"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.ok(packets.some((packet) => packet.unifiedFindingId === "contact_support_path_present"));
  assert.ok(!packets.some((packet) => packet.unifiedFindingId === "contact_page_unavailable"));
});

test("uses retargeting-specific unified finding copy instead of the generic fallback", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          signalKey: "commerce.retargeting_pixel_detected",
          signalLabel: "Retargeting pixel detected",
          signalValue: true
        },
        observedValue: "Retargeting pixel observed",
        severity: "medium",
        signalKey: "commerce.retargeting_pixel_detected",
        signalLabel: "Retargeting pixel detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Retargeting pixel detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "retargeting_pixel_observed");
  assert.match(packet?.presentation.whyThisMatters ?? "", /retargeting-related signal|confirmed against retained runtime artifacts/i);
  assert.match(packet?.presentation.suggestedFix ?? "", /retained detector output|specific retargeting or advertising pixel/i);
});

test("surfaces video content tracking exposure only with same-page Meta evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Meta Pixel was observed on a video content surface.",
        fallbackEvidence: {
          metaPixelPayloadFieldHints: ["ev", "dl", "page_title"],
          metaPixelRequestUrls: ["https://www.facebook.com/tr/?ev=PageView"],
          runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
          runtimeVendors: ["Meta Pixel"],
          samePageVideoTrackingCorrelation: true,
          signalKey: "privacy.video_content_tracking_exposure_detected",
          signalValue: true,
          videoContentSurfaceObserved: true,
          videoPageUrls: ["https://example.com/watch/highlights"],
          videoTitleSnippets: ["Week 1 highlights"]
        },
        observedValue: "Meta Pixel on video surface",
        severity: "high",
        signalKey: "privacy.video_content_tracking_exposure_detected",
        signalLabel: "Video content tracking exposure detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Video content tracking exposure detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "video_content_tracking_exposure");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.assertionLevels.includes("strong"), true);
  assert.deepEqual(packet?.evidence?.entities?.runtimeVendors, ["Meta Pixel"]);
  assert.deepEqual(packet?.evidence?.entities?.videoTitleSnippets, ["Week 1 highlights"]);
  assert.match(packet?.presentation.whyThisMatters ?? "", /VPPA-style privacy exposure/i);
});

test("does not surface video tracking exposure without same-page correlation", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Meta Pixel and video evidence were observed without same-page correlation.",
        fallbackEvidence: {
          metaPixelRequestUrls: ["https://www.facebook.com/tr/?ev=PageView"],
          runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
          runtimeVendors: ["Meta Pixel"],
          samePageVideoTrackingCorrelation: false,
          signalKey: "privacy.video_content_tracking_exposure_detected",
          signalValue: true,
          videoContentSurfaceObserved: true,
          videoPageUrls: ["https://example.com/watch/highlights"]
        },
        observedValue: "Meta Pixel and video evidence",
        severity: "high",
        signalKey: "privacy.video_content_tracking_exposure_detected",
        signalLabel: "Video content tracking exposure detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Video content tracking exposure detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const packet = packets.find((candidate) => candidate.unifiedFindingId === "video_content_tracking_exposure");

  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("audit_only"), true);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_specific_runtime_anchor"), true);
});

test("surfaces cross-domain identifier sharing from concrete runtime evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Identifier-like values were observed in requests to multiple external domains.",
        fallbackEvidence: {
          crossDomainIdentifierSharingDestinationCategories: ["rtb", "identity_graph"],
          crossDomainIdentifierSharingDestinationEtlds: ["adnxs.com", "rlcdn.com"],
          crossDomainIdentifierSharingEvidence: [
            {
              destinationClassification: "rtb",
              destinationDomain: "sync.adnxs.com",
              destinationEtldPlusOne: "adnxs.com",
              identifierClass: "durable_id",
              key: "uid",
              repeatedAcrossEtlds: ["adnxs.com", "rlcdn.com"],
              requestUrlRedacted: "https://sync.adnxs.com/getuid?uid=%5Bredacted%5D",
              valueHash: "a".repeat(64)
            },
            {
              destinationClassification: "identity_graph",
              destinationDomain: "idsync.rlcdn.com",
              destinationEtldPlusOne: "rlcdn.com",
              identifierClass: "durable_id",
              key: "uid",
              repeatedAcrossEtlds: ["adnxs.com", "rlcdn.com"],
              requestUrlRedacted: "https://idsync.rlcdn.com/sync?uid=%5Bredacted%5D",
              valueHash: "a".repeat(64)
            }
          ],
          runtimeEvidenceArtifacts: ["hybrid_runtime_evidence"],
          runtimeEvidenceUrls: [
            "https://sync.adnxs.com/getuid?uid=%5Bredacted%5D",
            "https://idsync.rlcdn.com/sync?uid=%5Bredacted%5D"
          ],
          signalKey: "privacy.cross_domain_identifier_sharing_observed",
          signalValue: true
        },
        observedValue: "Identifiers shared across domains",
        severity: "high",
        signalKey: "privacy.cross_domain_identifier_sharing_observed",
        signalLabel: "Identifiers shared across domains",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Identifiers shared across domains"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cross_domain_identifier_sharing_observed");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.assertionLevels.includes("strong"), true);
  assert.deepEqual(packet?.evidence?.entities?.crossDomainIdentifierSharingDestinations, ["adnxs.com", "rlcdn.com"]);
  assert.match(packet?.observedValue ?? "", /Identifier-like values were observed/i);
  assert.doesNotMatch(packet?.observedValue ?? "", /leakage/i);
});

test("describes single-destination identity sync without claiming multiple external domains", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Identifier-like values were observed in a retained request to an external identity-sync destination.",
        fallbackEvidence: {
          crossDomainIdentifierSharingDestinationCategories: ["identity_graph"],
          crossDomainIdentifierSharingDestinationEtlds: ["liveramp.com"],
          crossDomainIdentifierSharingEvidence: [
            {
              destinationClassification: "identity_graph",
              destinationDomain: "api.liveramp.com",
              destinationEtldPlusOne: "liveramp.com",
              identifierClass: "durable_id",
              key: "partnerid",
              repeatedAcrossEtlds: ["liveramp.com"],
              requestUrlRedacted: "https://api.liveramp.com/pixel?partnerid=%5Bredacted%5D",
              valueHash: "b".repeat(64)
            }
          ],
          signalKey: "privacy.cross_domain_identifier_sharing_observed",
          signalValue: true
        },
        observedValue: "Identifiers shared with identity sync endpoint",
        severity: "high",
        signalKey: "privacy.cross_domain_identifier_sharing_observed",
        signalLabel: "Identifiers shared across domains",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Identifiers shared across domains"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "cross_domain_identifier_sharing_observed");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.observedValue ?? "", /external identity, RTB, or adtech destination \(liveramp\.com\)/i);
  assert.doesNotMatch(packet?.observedValue ?? "", /multiple external domains/i);
});

test("drops weak root-only cookie obstruction urls from final evidence packets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.example.com/#"],
          signalKey: "disclosure.cookie_policy_structurally_obstructed",
          signalLabel: "Cookie policy structurally obstructed",
          signalValue: true
        },
        observedValue: "Cookie policy structurally obstructed",
        severity: "medium",
        signalKey: "disclosure.cookie_policy_structurally_obstructed",
        signalLabel: "Cookie policy structurally obstructed",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Cookie policy structurally obstructed"
      }
    ],
    validationFindings: [
      makeValidationFinding({
        id: "cookie-obstruction-validation",
        evidence: {
          pageUrl: "https://www.example.com/",
          title: "Example homepage"
        },
        pageUrl: "https://www.example.com/",
        ruleKey: "disclosure.cookie_policy_structurally_obstructed",
        title: "Cookie policy structurally obstructed"
      })
    ],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(packet?.evidence?.pageUrls ?? [], []);
  assert.deepEqual(packet?.evidence?.sourceUrls ?? [], []);
  assert.deepEqual(packet?.evidence?.snippets ?? [], []);
});

test("surfaces children's privacy disclosure present from policy enrichment evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a children's privacy disclosure.",
        fallbackEvidence: {
          pageType: "privacy_policy",
          pageUrl: "https://www.example.com/privacy",
          policyChildrenReference: "We do not knowingly collect personal information from children under 13.",
          policySnippets: ["We do not knowingly collect personal information from children under 13."],
          signalKey: "privacy.children_privacy_disclosure_present",
          signalLabel: "Children's privacy disclosure present",
          signalValue: true
        },
        observedValue: "Children's privacy disclosure present",
        severity: "low",
        signalKey: "privacy.children_privacy_disclosure_present",
        signalLabel: "Children's privacy disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Children's privacy disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "children_privacy_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("does not leak raw policy signal values into snippets when a policy summary is already retained", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrl: "https://example.com/terms",
          policySummaryShort:
            "The terms include arbitration for dispute resolution and are effective from January 1, 2026.",
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: "under_13"
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "arbitration_clause_present");
  assert.deepEqual(packet?.evidence?.snippets, [
    "The terms include arbitration for dispute resolution and are effective from January 1, 2026."
  ]);
});

test("filters raw marker tokens like under_13 out of merged evidence snippets", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrl: "https://example.com/terms",
          policySnippets: [
            "The terms include binding arbitration for dispute resolution and are effective from January 1, 2026."
          ],
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: true
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [
      makeValidationFinding({
        id: "arbitration-validation",
        evidence: {
          description: "under_13",
          pageUrl: "https://example.com/terms"
        },
        pageUrl: "https://example.com/terms",
        ruleKey: "scan_signal.commerce.arbitration_clause_present",
        title: "Arbitration clause present"
      })
    ],
    validationFindingLookup: new Map()
  });

  assert.deepEqual(packet?.evidence?.snippets, [
    "The terms include binding arbitration for dispute resolution and are effective from January 1, 2026."
  ]);
});

test("prefers a clean arbitration observation over synthesized-looking policy summaries", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrl: "https://example.com/terms",
          policySnippets: [
            "The terms include arbitration for dispute resolution and are effective from January 1, 2026. — The terms were last updated on December 19, 2022, with contact information for copyright inquiries."
          ],
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: true
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packet?.observedValue,
    "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly."
  );
});

test("suppresses arbitration clause findings when retained attribution is only a locale-subdomain terms page", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description:
          "The scan retained terms language that appears to include arbitration or dispute-resolution provisions worth reading directly.",
        fallbackEvidence: {
          pageUrls: ["https://arabic.example.com/terms"],
          policySnippets: ["The terms include binding arbitration for dispute resolution."],
          signalKey: "commerce.arbitration_clause_present",
          signalLabel: "Arbitration clause present",
          signalValue: true,
          sourceUrls: ["https://arabic.example.com/terms"]
        },
        observedValue: "Arbitration clause present",
        severity: "low",
        signalKey: "commerce.arbitration_clause_present",
        signalLabel: "Arbitration clause present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Arbitration clause present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "arbitration_clause_present");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("uses a finding-specific observation for retargeting pixel findings", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          signalKey: "commerce.retargeting_pixel_detected",
          signalLabel: "Retargeting pixel detected",
          signalValue: true
        },
        observedValue: "Retargeting pixel observed",
        severity: "medium",
        signalKey: "commerce.retargeting_pixel_detected",
        signalLabel: "Retargeting pixel detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Retargeting pixel detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(
    packet?.observedValue,
    "The scan retained a detector-backed retargeting or remarketing signal that merits manual confirmation."
  );
});

test("blocks low-confidence policy extraction on a non-policy page before packet assembly", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Critical policy extraction fields were low confidence and need manual review.",
        fallbackEvidence: {
          pageType: "non_policy",
          pageUrl: "https://www.example.com/components/pbtfans-cookies-n-creme",
          policySemanticConfidence: 0.5,
          signalKey: "policySemanticConfidence",
          signalLabel: "Policy semantic confidence",
          signalValue: 0.5
        },
        observedValue: "Policy extraction",
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Low-confidence policy extraction"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.length, 0);
});

test("blocks low-confidence policy extraction on non-primary policy rows before packet assembly", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Critical policy extraction fields were low confidence and need manual review.",
        fallbackEvidence: {
          isPrimaryPolicy: false,
          pageType: "privacy_policy",
          pageUrl: "https://www.kbdlab.io/components/pbtfans-cookies-n-creme",
          policySemanticConfidence: 0.5,
          signalKey: "policySemanticConfidence",
          signalLabel: "Policy semantic confidence",
          signalValue: 0.5
        },
        observedValue: "Policy extraction",
        severity: "medium",
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Low-confidence policy extraction"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.length, 0);
});

test("normalizes clipped policy snippets but preserves natural lowercase starts", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a clear policy-based privacy-rights request path.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["ng on where you live, you may have the following rights regarding your personal information. The right to request access to, and a copy of, the information we hold about you."],
          signalKey: "privacy.privacy_rights_path_present",
          signalLabel: "Privacy-rights path present",
          signalValue: true
        },
        observedValue: "Privacy-rights path present",
        severity: "low",
        signalKey: "privacy.privacy_rights_path_present",
        signalLabel: "Privacy-rights path present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Privacy-rights path present"
      },
      {
        description: "The scan retained a disclosure indicating how the site says it handles Global Privacy Control.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["for each device or browser you use, we will treat the Global Privacy Control signal as a request to opt out."],
          signalKey: "privacy.gpc_disclosure_present",
          signalLabel: "GPC handling disclosed",
          signalValue: true
        },
        observedValue: "GPC handling disclosed",
        severity: "low",
        signalKey: "privacy.gpc_disclosure_present",
        signalLabel: "GPC handling disclosed",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "GPC handling disclosed"
      }
      ,
      {
        description: "The scan retained a disclosure describing behavioral analytics or replay-style tooling.",
        fallbackEvidence: {
          pageUrl: "https://www.example.com/privacy",
          policySnippets: ["tracking technologies such as cookies, pixels, tags, beacons, scripts, and similar technologies. On certain pages, we use third-party tools to help us look at mouse movements, clicks, keystrokes, data or text entered, and the pages you visit."],
          signalKey: "privacy.behavioral_analytics_disclosure_present",
          signalLabel: "Behavioral analytics disclosure present",
          signalValue: true
        },
        observedValue: "Behavioral analytics disclosure present",
        severity: "low",
        signalKey: "privacy.behavioral_analytics_disclosure_present",
        signalLabel: "Behavioral analytics disclosure present",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "Behavioral analytics disclosure present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const rightsPacket = packets.find((packet) => packet.unifiedFindingId === "privacy_rights_path_present");
  const gpcPacket = packets.find((packet) => packet.unifiedFindingId === "gpc_disclosure_present");
  const replayPacket = packets.find((packet) => packet.unifiedFindingId === "behavioral_analytics_disclosure_present");

  assert.deepEqual(rightsPacket?.evidence?.snippets, [
    "The right to request access to, and a copy of, the information we hold about you."
  ]);
  assert.deepEqual(gpcPacket?.evidence?.snippets, [
    "for each device or browser you use, we will treat the Global Privacy Control signal as a request to opt out."
  ]);
  assert.deepEqual(replayPacket?.evidence?.snippets, [
    "On certain pages, we use third-party tools to help us look at mouse movements, clicks, keystrokes, data or text entered, and the pages you visit."
  ]);
});

test("keeps GPC disclosure audit-only when only summary text is retained without a concrete user-facing url", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The scan retained a disclosure indicating how the site says it handles Global Privacy Control.",
        fallbackEvidence: {
          policySummaryShort:
            "For each device or browser you use, we will treat the Global Privacy Control signal as a request to opt out.",
          signalKey: "privacy.gpc_disclosure_present",
          signalLabel: "GPC handling disclosed",
          signalValue: true,
          sourceUrls: [
            "https://privacyportal.onetrust.com/request/v1/enterprisepolicy/digitalpolicy/content"
          ]
        },
        observedValue: "GPC handling disclosed",
        severity: "low",
        signalKey: "privacy.gpc_disclosure_present",
        signalLabel: "GPC handling disclosed",
        signalSource: "policy_enrichment_signal",
        sourceType: "signal",
        title: "GPC handling disclosed"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "gpc_disclosure_present");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("surfaces child-directed context without supporting privacy disclosure", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "Youth-directed cues were retained, but supporting privacy disclosure and contact signals were missing.",
        fallbackEvidence: {
          signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
          signalLabel: "Child-directed context without supporting privacy disclosure",
          signalValue: true,
          childrenAudienceLikely: true,
          kidDirectedContentDetected: true,
          formCollectsBirthdate: true,
          privacyPolicyPresent: false,
          privacyContactChannelType: "none"
        },
        observedValue: "Youth-directed context with missing disclosure support",
        severity: "medium",
        signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
        signalLabel: "Child-directed context without supporting privacy disclosure",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Child-directed context without supporting privacy disclosure"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "children_privacy_context_without_supporting_disclosure");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.match(packet?.presentation.whyThisMatters ?? "", /supporting privacy disclosure/i);
});

test("surfaces minors-related context without requiring page-level attribution", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site shows youth-directed or age-related privacy cues that merit closer review.",
        fallbackEvidence: {
          ageGatePresent: true,
          childrenAudienceLikely: true,
          childrenPrivacyRiskScore: 68,
          dateOfBirthInputPresent: true,
          formCollectsBirthdate: true,
          mentionsCoppa: true,
          mentionsUnder13: true,
          parentalConsentReferencePresent: true,
          policyChildrenReference: "The policy references services for children under 13.",
          signalKey: "context.children_audience_likely",
          signalLabel: "Children audience likely",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "context.children_audience_likely",
        signalLabel: "Children audience likely",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Children audience likely"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "minors_or_age_gated_collection_context");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.confidenceInputs.hasPageAttribution, false);
  assert.equal(packet?.evidence?.counts?.childrenPrivacyRiskScore, 68);
  assert.ok(packet?.evidence?.flags?.includes("children_audience_likely"));
  assert.ok(packet?.details?.family === "sensitive_data");
  assert.ok(packet?.details?.dataTypes?.includes("birthdate"));
  assert.ok(packet?.details?.dataTypes?.includes("youth_directed_context"));
});

test("suppresses minors-related context when only weak policy and audience cues are present", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site shows youth-directed or age-related privacy cues that merit closer review.",
        fallbackEvidence: {
          childrenAudienceLikely: true,
          childrenPrivacyRiskScore: 63,
          mentionsUnder13: true,
          signalKey: "context.children_audience_likely",
          signalLabel: "Children audience likely",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "context.children_audience_likely",
        signalLabel: "Children audience likely",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Children audience likely"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "minors_or_age_gated_collection_context");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps minors-related context audit-only when only domain-level audience cues lack page evidence", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site shows youth-directed or age-related privacy cues that merit closer review.",
        fallbackEvidence: {
          childrenAudienceLikely: true,
          childrenPrivacyRiskScore: 68,
          kidDirectedContentDetected: true,
          signalKey: "context.children_audience_likely",
          signalLabel: "Children audience likely",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "medium",
        signalKey: "context.children_audience_likely",
        signalLabel: "Children audience likely",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Children audience likely"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "minors_or_age_gated_collection_context");
  assert.equal(packet?.presentationDecision.status, "surface");
});

test("keeps weak coverage-gap missing-surface findings audit-only", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The snapshot did not retain a privacy policy surface.",
        fallbackEvidence: {
          privacyPolicyPresent: false,
          signalKey: "disclosure.privacy_policy_surface_missing"
        },
        linkedValidationFinding: null,
        observedValue: "Privacy policy missing",
        severity: "high",
        signalKey: "disclosure.privacy_policy_surface_missing",
        signalLabel: "Privacy policy missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy missing"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "privacy_policy_missing_surface");
  assert.equal(packet?.presentationDecision.status, "audit_only");
});

test("prioritizes deceptive financial-promotion findings ahead of generic coverage gaps", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site did not retain a privacy policy surface.",
        fallbackEvidence: {
          privacyPolicyPresent: false,
          signalKey: "disclosure.privacy_policy_surface_missing"
        },
        linkedValidationFinding: null,
        observedValue: "Privacy policy missing",
        severity: "high",
        signalKey: "disclosure.privacy_policy_surface_missing",
        signalLabel: "Privacy policy missing",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy missing"
      },
      {
        description: "Guaranteed 15% returns were promoted next to an investment CTA.",
        fallbackEvidence: {
          matchedSnippet: "Guaranteed returns of 15% a year.",
          pageUrl: "https://example.com/invest",
          signalKey: "financial.guaranteed_return_language_present",
          sourceUrls: ["https://example.com/invest"],
          unifiedFindingId: "guaranteed_or_high_return_claims_present"
        },
        linkedValidationFinding: null,
        observedValue: "Guaranteed returns of 15% a year.",
        severity: "high",
        signalKey: "financial.guaranteed_return_language_present",
        signalLabel: "Guaranteed return language present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Guaranteed return language present"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets[0]?.unifiedFindingId, "guaranteed_or_high_return_claims_present");
  assert.equal(packets[1]?.unifiedFindingId, "privacy_policy_missing_surface");
});

test("demotes generic coverage findings when mock regulator context is also present", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "The site appears to be a regulator-run educational mock investment example.",
        fallbackEvidence: {
          pageUrl: "https://example.com",
          sourceUrls: ["https://example.com"],
          unifiedFindingId: "regulator_operated_mock_investment_example"
        },
        linkedValidationFinding: null,
        observedValue: "Mock or educational fraud example detected",
        severity: "medium",
        sourceType: "issue",
        title: "Mock or educational fraud example detected"
      },
      {
        description: "The scan retained an elevated automated accessibility risk score.",
        fallbackEvidence: {
          accessibilityRuleExamples: [
            {
              nodeCount: 2,
              pageUrl: "https://example.com/",
              representativeSelectors: [".hero-title"],
              ruleCode: "color-contrast"
            }
          ],
          signalValue: 10,
          unifiedFindingId: "accessibility_risk_score"
        },
        linkedValidationFinding: null,
        observedValue: "Accessibility risk score: 10",
        severity: "medium",
        signalKey: "scan_snapshot.accessibility.accessibility_risk_score",
        signalLabel: "Accessibility risk score",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Accessibility risk score"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets[0]?.unifiedFindingId, "regulator_operated_mock_investment_example");
  assert.equal(packets[1]?.unifiedFindingId, "accessibility_risk_score");
  assert.equal(packets[1]?.presentationDecision.status, "suppress");
});

test("merged signals feed unified finding derivation through the canonical display packet path", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.92,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacy.gpc_disclosure_present",
        label: "GPC disclosure present",
        reportSignalSource: "policy_enrichment_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const packets = buildUnifiedFindingDisplayPackets({
    mergedSignals,
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "gpc_disclosure_present"), true);
});

test("financial merged signals promote companion findings through normalized concerns", () => {
  const mergedSignals = buildMergedSignalRecords({
    scannerSignals: [
      {
        confidence: 0.92,
        evidenceRefs: ["https://forexprofita.example/"],
        key: "financial.guaranteed_return_language_present",
        label: "Guaranteed return language present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.9,
        evidenceRefs: ["https://forexprofita.example/"],
        key: "financial.performance_claim_text_present",
        label: "Performance claim text present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.88,
        evidenceRefs: ["https://forexprofita.example/"],
        key: "financial.testimonial_or_review_block_near_financial_claim_present",
        label: "Testimonial near financial claim present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.86,
        evidenceRefs: ["https://forexprofita.example/"],
        key: "commercial.fee_related_text_present",
        label: "Fee related text present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 0.84,
        evidenceRefs: ["https://forexprofita.example/"],
        key: "financial.copy_trading_language_present",
        label: "Copy trading language present",
        reportSignalSource: "snapshot_signal",
        source: "scanner",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const packets = buildUnifiedFindingDisplayPackets({
    mergedSignals,
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packetIds = new Set(packets.map((packet) => packet.unifiedFindingId));

  assert.equal(packetIds.has("guaranteed_outcome_claim_detected"), false);
  assert.equal(packetIds.has("earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(packetIds.has("pricing_or_fee_transparency_unclear"), false);
  assert.equal(packetIds.has("unsubstantiated_testimonial_near_performance_claim"), false);
  assert.equal(packetIds.has("regulatory_registration_disclosure_absent"), false);
});

test("document semantic contact channel does not surface missing-contact finding and uses positive contact path signal instead", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.88,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacyContactChannelType",
        label: "Privacy contact channel type",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: "email",
        valueType: "text"
      },
      {
        confidence: 0.88,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacy.privacy_contact_path_present",
        label: "Privacy contact path present",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const packets = buildUnifiedFindingDisplayPackets({
    mergedSignals,
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "privacy_contact_channel_missing"), false);
  assert.equal(packets.some((packet) => packet.unifiedFindingId === "privacy_contact_path_present"), true);
});

test("insufficient major merged signals surface as bounded discovery unresolved review findings", () => {
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: [
      {
        confidence: 0.4,
        evidenceRefs: ["https://example.com/privacy"],
        key: "privacy.gpc_disclosure_present",
        label: "GPC disclosure present",
        populationStatus: "insufficient",
        reportSignalSource: "document_semantic_signal",
        source: "nano",
        value: true,
        valueType: "boolean"
      }
    ]
  });

  const packets = buildUnifiedFindingDisplayPackets({
    mergedSignals,
    reviewFindingCandidates: [],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const unresolvedPacket = packets.find((packet) => packet.unifiedFindingId === "bounded_key_page_discovery_unresolved");
  assert.equal(unresolvedPacket?.presentationDecision.status, "audit_only");
  assert.equal(unresolvedPacket?.title, "Bounded key-page discovery unresolved");
});
