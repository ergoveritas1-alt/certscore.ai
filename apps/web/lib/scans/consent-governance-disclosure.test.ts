import assert from "node:assert/strict";
import test from "node:test";

import { evaluateConsentGovernanceDisclosureEvidence } from "./consent-governance-disclosure";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import {
  getHybridDerivedSignalValue,
  getHybridSignalFallbackEvidence
} from "./hybrid-runtime-evidence";
import { normalizeConcernFromReviewFindingCandidate } from "./normalized-concerns";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function governanceEvidence(overrides: Record<string, unknown> = {}) {
  return {
    concernId: "consent_governance_disclosure_gap",
    relevanceTriggers: {
      cmpObserved: true,
      consentBannerObserved: true,
      consentDependentTrackingObserved: true
    },
    missingOrWeakDisclosureSignals: {
      withdrawalProcessNotClearlyExplained: true,
      preferenceReopenPathNotObserved: true,
      consentRetentionOrExpiryNotClearlyExplained: true
    },
    supportingAnchors: {
      policyUrls: ["https://example.com/privacy"],
      cookiePolicyUrls: ["https://example.com/cookies"],
      observedTrackingVendors: ["Meta"],
      runtimeAnchors: ["cookie:_fbp"],
      textAnchors: [
        {
          url: "https://example.com/cookies",
          label: "Cookie policy",
          snippet:
            "The retained cookie policy described analytics and marketing cookies, but did not clearly explain how consent choices can be changed or withdrawn.",
          confidence: "good"
        }
      ]
    },
    coverage: {
      policyPageReviewed: true,
      cookiePolicyReviewed: true,
      footerOrHeaderLinksReviewed: true
    },
    ...overrides
  };
}

function makeDisplayPacket(input: {
  evidence: Record<string, unknown>;
  unifiedFindingId: string;
  title?: string;
  summary?: string;
}): UnifiedFindingDisplayPacket {
  const entities: Record<string, string[]> = {
    consentGovernanceDisclosureEvidence: [JSON.stringify(input.evidence)]
  };
  if (input.unifiedFindingId === "cookie_disclosure_gap") {
    entities.runtimeVendorDisclosureEvidence = [
      JSON.stringify({
        subtype: "runtime_vendor_not_disclosed",
        parentFindingId: "cookie_disclosure_gap",
        observedRuntimeVendors: ["Meta"],
        observedRuntimeDomains: ["connect.facebook.net"],
        unmatchedRuntimeVendors: ["Meta"],
        unmatchedRuntimeDomains: ["connect.facebook.net"],
        policySurfacesSearched: [{ type: "cookie_policy", url: "https://example.com/cookies", reached: true }],
        matchedVendorDisclosureCount: 0,
        unmatchedVendorDisclosureCount: 1,
        mismatchRationale: "Runtime cookie/storage vendor Meta did not clearly match retained cookie disclosure evidence.",
        coverageStatus: "usable",
        evidenceConfidence: "strong",
        directVsInferred: "direct",
        categories: ["advertising"]
      })
    ];
  }
  if (input.unifiedFindingId === "consent_control_not_reopenable") {
    entities.consentControlLifecycleEvidence = [
      JSON.stringify({
        privacySettingsControlObserved: false,
        cookiePreferencesLinkObserved: false,
        cmpReopenControlObserved: false,
        withdrawalTextObserved: false,
        footerPreferenceLinkObserved: false,
        preferenceCenterReachableAfterInitialLayer: false,
        initialConsentLayerObserved: true,
        consentDependentTrackingObserved: true,
        pagesChecked: ["https://example.com/"],
        controlsSearched: ["cookie preferences", "privacy settings", "manage consent"],
        footerLinksInspected: ["Privacy Policy", "Terms"],
        coverageStatus: "usable",
        evidenceRefs: ["consent-control-1"]
      })
    ];
  }
  const packet = {
    unifiedFindingId: input.unifiedFindingId,
    title: input.title ?? "Consent preferences and withdrawal process not clearly explained",
    severity: "medium",
    summary: input.summary ?? "Consent governance disclosure review signal.",
    confidenceBand: "moderate",
    primaryPageUrl: "https://example.com/",
    affectedPageCount: 1,
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: false,
      hasCorroboratedPositiveSurfaceEvidence: true,
      hasDirectRuntimeEvidence: true,
      hasKeyPageDiscoveryEvidence: false,
      hasReadableSurfaceSnippetEvidence: true,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: true,
      hasPacketBackedEvidence: true,
      hasPolicyTextEvidence: true,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 1,
      sourceCount: 1,
      sourceKinds: ["signal"],
      validationCount: 0
    },
    categoryAlignments: [],
    sourceRefs: [{ kind: "signal", key: "privacy.consent_governance_disclosure_gap", source: "document_semantic_signal" }],
    evidence: {
      counts: {},
      entities,
      fetchQuality: null,
      flags: ["consent_governance_disclosure_gap"],
      pageUrls: ["https://example.com/"],
      snippets: ["Reviewed public materials did not clearly explain consent preference management."],
      sourceUrls: ["https://example.com/cookies"]
    },
    concernContext: {
      assertionLevels: ["moderate"],
      evidenceStrengthFlags: ["direct_runtime", "policy_text", "page_attributed"],
      externalSurfacingEligibilities: ["eligible"],
      negativeEvidenceFlags: [],
      originTypes: ["document_semantic"],
      promotionEligibilities: ["eligible"]
    }
  } as unknown as UnifiedFindingDisplayPacket;

  return {
    ...packet,
    linkedValidationFinding: null,
    observedValue: null,
    presentation: {
      findingName: packet.title,
      suggestedFix: "Review privacy, cookie, and preference-center materials.",
      whyThisMatters: packet.summary
    },
    presentationDecision: {
      confidenceRationale: "Retained consent governance review evidence was present.",
      downgradeReasons: [],
      rationale: "Supporting consent governance evidence retained.",
      status: "surface",
      verificationLabel: "Review",
      verificationState: "runtime"
    },
    referenceLabel: undefined,
    referenceUrl: undefined,
    sourceLabel: undefined,
    sourceUrl: undefined,
    surfacingDecision: {
      appliedRules: [],
      decisionReasons: [],
      decisionState: "confirmed",
      family: "rights_gap",
      policyVersion: "test",
      reportLane: "confidence_and_coverage",
      reportable: true,
      surfaceTier: "support",
      supports: [],
      unifiedFindingId: packet.unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: true
    }
  };
}

test("evaluates CMP plus reviewed cookie policy and missing governance language as supporting evidence", () => {
  const review = evaluateConsentGovernanceDisclosureEvidence({
    consentGovernanceDisclosureEvidence: governanceEvidence()
  });

  assert.equal(review.disposition, "eligible");
  assert.equal(review.confidence, "strong");
  assert.deepEqual(review.negativeEvidenceFlags, []);
});

test("supports consent-dependent tracking plus public policy review", () => {
  const review = evaluateConsentGovernanceDisclosureEvidence({
    consentGovernanceDisclosureEvidence: governanceEvidence({
      relevanceTriggers: {
        consentDependentTrackingObserved: true
      },
      missingOrWeakDisclosureSignals: {
        consentRetentionOrExpiryNotClearlyExplained: true
      },
      coverage: {
        policyPageReviewed: true
      }
    })
  });

  assert.equal(review.disposition, "eligible");
  assert.equal(review.confidence, "good");
});

test("reads WS01 nested hybrid runtime consent governance evidence", () => {
  const runtimeArtifacts = {
    hybridRuntimeEvidence: {
      consentGovernanceDisclosureEvidence: governanceEvidence()
    }
  };

  assert.equal(getHybridDerivedSignalValue(runtimeArtifacts, "privacy.consent_governance_disclosure_gap"), true);
  const fallback = getHybridSignalFallbackEvidence({
    runtimeArtifacts,
    signalKey: "privacy.consent_governance_disclosure_gap",
    signalLabel: "Consent preferences and withdrawal process not clearly explained",
    signalValue: true
  });
  assert.equal(
    (fallback?.consentGovernanceDisclosureEvidence as Record<string, unknown> | undefined)?.concernId,
    "consent_governance_disclosure_gap"
  );
  assert.equal(fallback?.unifiedFindingId, "consent_governance_disclosure_gap");
});

test("normalizes nested WS01 governance evidence through WC01 concern policy", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Consent preferences and withdrawal process not clearly explained",
    evidence: ["https://example.com/cookies"],
    fallbackEvidence: {
      hybridRuntimeEvidence: {
        consentGovernanceDisclosureEvidence: governanceEvidence()
      },
      unifiedFindingId: "consent_governance_disclosure_gap"
    },
    observedValue: null,
    severity: "medium",
    signalKey: "privacy.consent_governance_disclosure_gap",
    signalLabel: "Consent preferences and withdrawal process not clearly explained",
    signalSource: "runtime_artifact_signal",
    sourceType: "signal",
    title: "Consent preferences and withdrawal process not clearly explained"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "consent_governance_disclosure_gap");
  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");
  assert.ok(concern.evidenceBundle.flags.includes("consent_governance_disclosure_gap"));
});

test("suppresses absence-only generic sites", () => {
  const review = evaluateConsentGovernanceDisclosureEvidence({
    consentGovernanceDisclosureEvidence: governanceEvidence({
      relevanceTriggers: {},
      missingOrWeakDisclosureSignals: {
        consentRetentionOrExpiryNotClearlyExplained: true
      },
      supportingAnchors: {
        policyUrls: ["https://example.com/privacy"]
      },
      coverage: {
        policyPageReviewed: true
      }
    })
  });

  assert.equal(review.disposition, "suppress");
  assert.ok(review.negativeEvidenceFlags.includes("missing_consent_governance_relevance_trigger"));
});

test("does not promote from missing keywords without coverage anchors", () => {
  const review = evaluateConsentGovernanceDisclosureEvidence({
    consentGovernanceDisclosureEvidence: governanceEvidence({
      supportingAnchors: {},
      coverage: {},
      relevanceTriggers: {
        policyClaimsConsentForTracking: true
      },
      missingOrWeakDisclosureSignals: {
        consentRecordHandlingNotClearlyExplained: true
      }
    })
  });

  assert.equal(review.disposition, "audit_only");
  assert.ok(review.negativeEvidenceFlags.includes("missing_consent_governance_coverage_anchor"));
});

test("suppresses blocked, tag-manager-only, and strictly necessary storage cases", () => {
  for (const coverage of [
    { materiallyBlocked: true, policyPageReviewed: true },
    { tagManagerOnlyWithoutConsentContext: true, policyPageReviewed: true },
    { strictlyNecessaryStorageOnly: true, policyPageReviewed: true }
  ]) {
    const review = evaluateConsentGovernanceDisclosureEvidence({
      consentGovernanceDisclosureEvidence: governanceEvidence({ coverage })
    });
    assert.equal(review.disposition, "suppress");
  }
});

test("keeps consent governance disclosure gap out of standalone executive top findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Consent preferences and withdrawal process not clearly explained",
    evidence: ["https://example.com/cookies"],
    fallbackEvidence: {
      consentGovernanceDisclosureEvidence: governanceEvidence(),
      unifiedFindingId: "consent_governance_disclosure_gap"
    },
    observedValue: null,
    severity: "medium",
    signalKey: "privacy.consent_governance_disclosure_gap",
    signalLabel: "Consent preferences and withdrawal process not clearly explained",
    signalSource: "document_semantic_signal",
    sourceType: "signal",
    title: "Consent preferences and withdrawal process not clearly explained"
  });
  assert.equal(concern.suggestedUnifiedFindingId, "consent_governance_disclosure_gap");
  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");

  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makeDisplayPacket({ evidence: governanceEvidence(), unifiedFindingId: "consent_governance_disclosure_gap" })
  ]);
  assert.equal(projection.findings.some((finding) => finding.id === "consent_governance_disclosure_gap"), false);
  assert.equal(projection.topFindings.some((finding) => finding.id === "consent_governance_disclosure_gap"), false);
});

test("attaches eligible governance evidence to an existing cookie disclosure gap without a duplicate top card", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makeDisplayPacket({ evidence: governanceEvidence(), unifiedFindingId: "cookie_disclosure_gap" })
  ]);
  const finding = projection.findings.find((entry) => entry.id === "cookie_disclosure_gap");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.consentGovernanceDisclosure?.subtype, "consent_governance_disclosure_gap");
  assert.equal(
    (finding.evidenceDetails?.disclosureEvidence?.consentGovernanceDisclosure as Record<string, unknown> | undefined)?.subtype,
    "consent_governance_disclosure_gap"
  );
  assert.equal(projection.findings.some((entry) => entry.id === "consent_governance_disclosure_gap"), false);
});

test("attaches eligible governance evidence to Consent Experience details", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makeDisplayPacket({ evidence: governanceEvidence(), unifiedFindingId: "consent_control_not_reopenable" })
  ]);
  const finding = projection.findings.find((entry) => entry.id === "consent_preference_reopen_control_not_observed");
  assert.ok(finding);
  assert.equal(
    (finding.evidenceDetails?.disclosureEvidence?.consentGovernanceDisclosure as Record<string, unknown> | undefined)?.subtype,
    "consent_governance_disclosure_gap"
  );
  assert.equal(projection.findings.filter((entry) => entry.id === "consent_preference_reopen_control_not_observed").length, 1);
  assert.equal(projection.findings.some((entry) => entry.id === "consent_dark_patterns_detected"), false);
});
