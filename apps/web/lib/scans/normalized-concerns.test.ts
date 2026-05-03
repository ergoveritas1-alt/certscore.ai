import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns,
  normalizeConcernFromReviewFindingCandidate,
  normalizeConcernFromPolicyReviewQueue,
  normalizeConcernFromValidationFinding
} from "./normalized-concerns";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import { evaluateFindingEvidenceContractForPacket, evaluateFindingEvidenceContractForRawEvidence } from "./finding-evidence-contracts";
import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";
import { buildUnifiedFindingDisplayPackets, buildUnifiedFindingPackets, type UnifiedFindingCandidate } from "./unified-findings";
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

test("normalizes snapshot signal candidates into eligible concerns", () => {
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [
      {
        description: "Observed on initial page load.",
        fallbackEvidence: {
          consentSurfaceObserved: false,
          signalKey: "privacy.preconsent_tracking_detected"
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      } satisfies UnifiedFindingCandidate
    ],
    validationFindings: []
  });

  assert.equal(concerns.length, 1);
  assert.equal(concerns[0]?.originType, "snapshot_signal");
  assert.equal(concerns[0]?.promotionEligibility, "internal_only");
  assert.equal(concerns[0]?.externalSurfacingEligibility, "audit_only");
  assert.equal(concerns[0]?.allowedNarrativeTier, "weak");
  assert.deepEqual(concerns[0]?.negativeEvidenceFlags, [
    "no_consent_surface_observed",
    "missing_concrete_preconsent_artifact",
    "missing_preconsent_sequence_evidence"
  ]);
  assert.ok(concerns[0]?.evidenceStrengthFlags.includes("fallback_only"));
});

test("retains fingerprinting runtime evidence through normalized concerns into executive projection", () => {
  const reviewFindingCandidate = {
    description: "Fingerprinting runtime detected",
    fallbackEvidence: {
      fingerprintArtifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary"],
      fingerprintAttributeCategories: ["hardware", "storage"],
      fingerprintRuntimeEvidence: [
        {
          artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
          attributeCategories: ["hardware", "storage"],
          tier: 2
        }
      ],
      fingerprintRuntimeEvidenceRetained: true,
      fingerprintSignals: ["hardware", "storage"],
      fingerprintSummary: {
        attributeCategories: [
          { count: 3, firstSeenMs: 120, name: "hardware" },
          { count: 3, firstSeenMs: 140, name: "storage" }
        ],
        confidence: "medium",
        reasons: ["Observed identifier-like structuring or shaping behavior."],
        summary: "The page showed multi-signal device and browser data collection consistent with potential fingerprinting.",
        tier: 2
      },
      fingerprintTier: 2,
      highEntropySignals: ["hardware", "storage"],
      signalKey: "privacy.fingerprinting_detected",
      signalValue: true
    },
    observedValue: "true",
    severity: "medium",
    signalKey: "privacy.fingerprinting_detected",
    signalLabel: "Fingerprinting runtime detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Fingerprinting runtime detected"
  } satisfies UnifiedFindingCandidate;
  const [concern] = buildNormalizedConcerns({
    reviewFindingCandidates: [reviewFindingCandidate],
    validationFindings: []
  });
  const [candidate] = buildUnifiedFindingCandidatesFromConcerns(concern ? [concern] : []);
  const candidateFallbackEvidence = candidate?.fallbackEvidence as Record<string, unknown> | undefined;
  const candidateCounts = candidateFallbackEvidence?.counts as Record<string, unknown> | undefined;
  const candidateEntities = candidateFallbackEvidence?.entities as Record<string, unknown> | undefined;

  assert.equal(candidateCounts?.fingerprintTier, 2);
  assert.deepEqual(candidateEntities?.fingerprintAttributeCategories, ["hardware", "storage"]);
  assert.equal(evaluateFindingEvidenceContractForRawEvidence("fingerprinting_observed", candidateFallbackEvidence)?.status, "pass_strong");

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [reviewFindingCandidate],
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "fingerprinting_observed");

  assert.ok(packet);
  assert.equal(packet.evidence?.counts?.fingerprintTier, 2);
  assert.deepEqual(packet.evidence?.entities?.fingerprintAttributeCategories, ["hardware", "storage"]);
  assert.ok(packet.evidence?.entities?.fingerprintingRuntimeEvidence?.[0]?.includes("\"tier\":2"));
  assert.equal(evaluateFindingEvidenceContractForPacket(packet)?.status, "pass_strong");

  const projection = projectExecutiveFindingsFromUnifiedPackets(packets);
  assert.ok(projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
});

test("fingerprinting evidence stays out of executive projection without retained runtime artifacts", () => {
  const weakCandidate = {
    description: "Fingerprinting runtime detected",
    fallbackEvidence: {
      signalKey: "privacy.fingerprinting_detected",
      signalValue: true
    },
    observedValue: "true",
    severity: "medium",
    signalKey: "privacy.fingerprinting_detected",
    signalLabel: "Fingerprinting runtime detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Fingerprinting runtime detected"
  } satisfies UnifiedFindingCandidate;
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [weakCandidate],
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "fingerprinting_observed");

  assert.ok(packet);
  assert.equal(packet.evidence?.counts?.fingerprintTier, undefined);
  assert.notEqual(evaluateFindingEvidenceContractForPacket(packet)?.status, "pass_strong");
  assert.ok(!projectExecutiveFindingsFromUnifiedPackets(packets).findings.some((finding) => finding.id === "probable_fingerprinting"));
});

test("normalizes evidence-quality preconsent artifact into audit-only concern when timing is ambiguous", () => {
  const [concern] = buildNormalizedConcerns({
    reviewFindingCandidates: [
      {
        description: "A retained non-essential request classification exists, but the timing sequence is incomplete.",
        fallbackEvidence: {
          consentTimeline: {
            firstCmpVisibleMs: null,
            firstConsentActionMs: null,
            firstNonEssentialRequestMs: 250,
            timelineConfidence: "low"
          },
          requestPurposeClassificationConfidence: [
            {
              confidence: 0.9,
              essentiality: "non_essential",
              requestUrl: "https://analytics.example/pixel",
              vendor: "Example Analytics"
            }
          ],
          signalKey: "privacy.preconsent_tracking_detected"
        },
        observedValue: "1 classified request",
        severity: "medium",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      } satisfies UnifiedFindingCandidate
    ],
    validationFindings: []
  });

  assert.equal(concern?.suggestedUnifiedFindingId, "preconsent_tracking");
  assert.equal(concern?.promotionEligibility, "internal_only");
  assert.equal(concern?.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"), true);
});

test("promotes evidence-quality preconsent artifact when sequence and classification are both strong", () => {
  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "A retained consent timeline places a non-essential request before the CMP was visible.",
        fallbackEvidence: {
          consentActionableChoiceObserved: true,
          consentSurfaceObserved: true,
          consentTimeline: {
            firstCmpVisibleMs: 1000,
            firstConsentActionMs: 1500,
            firstNonEssentialRequestMs: 250,
            timelineConfidence: "high"
          },
          requestPurposeClassificationConfidence: [
            {
              confidence: 0.9,
              essentiality: "non_essential",
              requestUrl: "https://analytics.example/pixel",
              vendor: "Example Analytics"
            }
          ],
          signalKey: "privacy.preconsent_tracking_detected"
        },
        observedValue: "1 classified request",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      } satisfies UnifiedFindingCandidate
    ],
    validationFindings: []
  });

  assert.equal(packets.some((packet) => packet.unifiedFindingId === "preconsent_tracking"), true);
});

test("replay policy review concerns stay internal without direct runtime evidence", () => {
  const concern = normalizeConcernFromPolicyReviewQueue({
    description: "Indirect replay-related signals may be present.",
    evidence: {
      policySummaryShort: "Policy summary",
      runtimeEvidenceArtifacts: []
    },
    reason: "session_replay_without_disclosure_detected",
    ruleKey: "policy_review.session_replay_without_disclosure_detected.privacy_policy",
    severity: "medium",
    title: "Possible replay/disclosure mismatch"
  });

  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");
});

test("replay validation concerns with runtime artifacts and policy text alone stay audit-only", () => {
  const concern = normalizeConcernFromValidationFinding(
    makeValidationFinding({
      id: "replay-1",
      ruleKey: "privacy.session_replay_without_disclosure_detected",
      severity: "high",
      title: "Possible undisclosed session replay",
      evidence: {
        runtimeEvidenceArtifacts: ["vendor:Microsoft Clarity|host:clarity.ms"],
        policySummary: "Policy text retained."
      }
    })
  );

  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");
  assert.ok(concern.evidenceStrengthFlags.includes("direct_runtime"));
  assert.ok(concern.negativeEvidenceFlags.includes("missing_policy_side_evidence"));
});

test("replay validation concerns with disclosure search context and mismatch bridge can surface externally", () => {
  const concern = normalizeConcernFromValidationFinding(
    makeValidationFinding({
      id: "replay-1",
      ruleKey: "privacy.session_replay_without_disclosure_detected",
      severity: "high",
      title: "Possible undisclosed session replay",
      evidence: {
        disclosureSearchScopeRetained: true,
        mismatchExplanation: "Runtime replay evidence was retained, but the retained privacy policy did not disclose session replay or behavioral analytics tooling.",
        observedBehavior: "Microsoft Clarity session replay runtime artifact was observed on the scanned site.",
        policyExtractionStatus: "fetched",
        policySnippet: "Privacy policy text describes analytics generally but does not mention session replay, recordings, heatmaps, or behavioral analytics.",
        policySourceUrl: "https://example.com/privacy",
        sessionReplayVendorArtifactPresent: true,
        sessionReplayVendors: ["Microsoft Clarity"],
        session_replay_runtime_artifacts: ["vendor:Microsoft Clarity|host:clarity.ms"]
      }
    })
  );

  assert.equal(concern.promotionEligibility, "eligible");
  assert.equal(concern.externalSurfacingEligibility, "eligible");
  assert.ok(concern.evidenceStrengthFlags.includes("direct_runtime"));
});

test("high-sensitivity candidates with replay artifacts specialize into sensitive replay findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input appears to coexist with replay tooling.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "financial_information",
          evidenceStrength: "suspected",
          requestUrl: "https://collector.example.com/submit"
        }
      ],
      sessionReplayVendorArtifactPresent: true,
      session_replay_runtime_artifacts: ["vendor:Microsoft Clarity|host:clarity.ms"]
    },
    observedValue: "Yes",
    severity: "high",
    signalKey: "commerce.high_sensitivity_data_collection_detected",
    signalLabel: "High-sensitivity data collection detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "High-sensitivity data collection detected"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "session_replay_on_sensitive_input_surface");
  assert.equal(concern.promotionEligibility, "eligible");
});

test("high-sensitivity candidates with third-party tracking specialize into sensitive tracking findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input appears to coexist with third-party tracking.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "health_information",
          evidenceStrength: "suspected",
          requestUrl: "https://tracker.example.net/collect",
          vendorHost: "tracker.example.net"
        }
      ],
      runtimeEvidenceArtifacts: ["request:https://tracker.example.net/collect"]
    },
    observedValue: "Yes",
    severity: "high",
    signalKey: "commerce.high_sensitivity_data_collection_detected",
    signalLabel: "High-sensitivity data collection detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "High-sensitivity data collection detected"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "sensitive_data_collection_with_third_party_tracking_present");
  assert.equal(concern.promotionEligibility, "eligible");
});

const sensitiveCollectionCases = [
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

for (const sensitiveCase of sensitiveCollectionCases) {
  test(`${sensitiveCase.signalKey} with disconnected tracking context stays a sensitive collection finding`, () => {
    const concern = normalizeConcernFromReviewFindingCandidate({
      description: `${sensitiveCase.label} appears to coexist with third-party tracking.`,
      fallbackEvidence: {
        retargetingPixelArtifactPresent: true,
        runtimeEvidenceArtifacts: ["request:https://tracker.example.net/pixel"],
        sensitivePayloadViolations: [
          {
            detectedType: sensitiveCase.detectedType,
            evidenceStrength: "form_field_signal",
            matchSnippet: sensitiveCase.snippet
          }
        ]
      },
      observedValue: "Yes",
      severity: "high",
      signalKey: sensitiveCase.signalKey,
      signalLabel: sensitiveCase.label,
      signalSource: "snapshot_signal",
      sourceType: "signal",
      title: sensitiveCase.label
    });

    assert.equal(concern.suggestedUnifiedFindingId, "sensitive_collection_surface_observed");
    assert.equal(concern.promotionEligibility, "eligible");
  });
}

test("generic high-sensitivity candidates without concrete payload evidence are suppressed", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input signal triggered without retained payload artifacts.",
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
  });

  assert.equal(concern.suggestedUnifiedFindingId, undefined);
  assert.equal(concern.allowedNarrativeTier, "weak");
  assert.equal(concern.promotionEligibility, "blocked");
  assert.equal(concern.externalSurfacingEligibility, "suppress");
  assert.deepEqual(concern.negativeEvidenceFlags, ["missing_specific_runtime_anchor", "runtime_tracking_review_incomplete"]);
});

test("keyboard and form accessibility signals can specialize into workflow-level barriers", () => {
  const keyboardConcern = normalizeConcernFromReviewFindingCandidate({
    description: "Keyboard issues were detected on the tested flow.",
    fallbackEvidence: {
      pageUrl: "https://example.com/checkout",
      wcagKeyboardNavigationIssueCount: 3
    },
    observedValue: "3",
    severity: "high",
    signalKey: "accessibility.wcag_keyboard_navigation_issue_count",
    signalLabel: "Keyboard navigation issues",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Keyboard navigation issues"
  });
  const formConcern = normalizeConcernFromReviewFindingCandidate({
    description: "Form label issues were detected on the tested flow.",
    fallbackEvidence: {
      pageUrl: "https://example.com/checkout",
      wcagFormLabelErrorCount: 4
    },
    observedValue: "4",
    severity: "high",
    signalKey: "accessibility.wcag_form_label_error_count",
    signalLabel: "Form label issues",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Form label issues"
  });

  assert.equal(keyboardConcern.suggestedUnifiedFindingId, "keyboard_only_task_completion_blocked");
  assert.equal(formConcern.suggestedUnifiedFindingId, "critical_form_completion_barrier");
});

test("structured policy enrichment can infer missing data categories disclosure", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Primary policy extraction retained no data-category disclosure.",
    fallbackEvidence: {
      pageType: "privacy_policy",
      policyCoverageRatio: 0.72,
      policyDataCategories: [],
      policyExtractionStatus: "fetched",
      policyFieldCoverage: {
        data_categories: { confidence: 0.88, found: false, snippetHash: null }
      },
      policySemanticConfidence: 0.84
    },
    observedValue: null,
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Policy semantic confidence"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "data_categories_disclosure_missing");
  assert.equal(concern.promotionEligibility, "eligible");
});

test("structured policy enrichment can infer missing third-party recipient disclosure", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Primary policy extraction retained no recipient or subprocessor disclosure.",
    fallbackEvidence: {
      pageType: "privacy_policy",
      policyCoverageRatio: 0.69,
      policyExtractionStatus: "fetched",
      policySemanticConfidence: 0.82,
      policySubprocessorsListed: false
    },
    observedValue: null,
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Policy semantic confidence"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "third_party_recipient_disclosure_missing");
  assert.equal(concern.promotionEligibility, "eligible");
});

test("structured policy enrichment can infer missing purpose-of-use disclosure", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Primary policy extraction retained no clear purpose-of-use disclosure.",
    fallbackEvidence: {
      pageType: "privacy_policy",
      policyCoverageRatio: 0.71,
      policyExtractionStatus: "fetched",
      policyFieldCoverage: {
        processing_purposes: { confidence: 0.83, found: false, snippetHash: null }
      },
      policySemanticConfidence: 0.8
    },
    observedValue: null,
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Policy semantic confidence"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "purpose_of_use_disclosure_missing");
  assert.equal(concern.promotionEligibility, "eligible");
});

test("normalization canonicalizes legacy policy evidence keys", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Legacy policy evidence should normalize into canonical policy fields.",
    fallbackEvidence: {
      page_type: "privacy_policy",
      page_url: "https://example.com/privacy",
      policy_extraction_status: "fetched",
      policy_semantic_confidence: 0.81,
      policy_coverage_ratio: 0.44,
      policy_snippet_count: 2,
      policy_rights_signals: ["access", "delete"],
      is_primary_policy_enrichment: true
    },
    observedValue: null,
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Policy semantic confidence"
  });

  assert.equal(concern.evidenceBundle.rawEvidence?.pageType, "privacy_policy");
  assert.equal(concern.evidenceBundle.rawEvidence?.pageUrl, "https://example.com/privacy");
  assert.equal(concern.evidenceBundle.rawEvidence?.policyExtractionStatus, "fetched");
  assert.equal(concern.evidenceBundle.rawEvidence?.policySemanticConfidence, 0.81);
  assert.equal(concern.evidenceBundle.rawEvidence?.policyCoverageRatio, 0.44);
  assert.equal(concern.evidenceBundle.rawEvidence?.policySnippetCount, 2);
  assert.deepEqual(concern.evidenceBundle.rawEvidence?.policyRightsSignals, ["access", "delete"]);
  assert.equal(concern.evidenceBundle.rawEvidence?.policyIsPrimarySource, true);
});

test("account-exit gaps can specialize into missing cancellation-method disclosure", () => {
  const concern = normalizeConcernFromValidationFinding(
    makeValidationFinding({
      id: "cancel-1",
      ruleKey: "section_review.account_exit_terms_missing",
      severity: "medium",
      title: "Account-exit terms missing",
      evidence: {
        policyCancellationOrRefundPresent: false,
        subscriptionCancellationPolicyPresent: false,
        cancellationTermsPresent: false
      }
    })
  );

  assert.equal(concern.suggestedUnifiedFindingId, "cancellation_method_disclosure_missing");
  assert.equal(concern.promotionEligibility, "eligible");
});

test("page-specific concerns without attribution are kept internal at the concern stage", () => {
  const concern = normalizeConcernFromValidationFinding(
    makeValidationFinding({
      id: "a11y-1",
      ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
      severity: "medium",
      title: "Accessibility risk score",
      evidence: {
        value: -4
      }
    })
  );

  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");
});

test("normalization preserves typed fetch quality from fallback evidence", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "The scan retained a reachable cookie-policy surface.",
    fallbackEvidence: {
      fetchQuality: "blocked_interstitial",
      pageUrl: "https://www.example.com/cookies",
      policySnippets: ["We’re sorry, but we were unable to authorize your request."],
      signalKey: "disclosure.cookie_policy_present"
    },
    observedValue: "Cookie policy fetched",
    severity: "medium",
    signalKey: "disclosure.cookie_policy_present",
    signalLabel: "Cookie policy fetched",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Cookie policy fetched"
  });

  assert.equal(concern.evidenceBundle.fetchQuality, "blocked_interstitial");
  assert.ok(concern.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed"));
});

test("low-confidence policy extraction on a non-policy page is blocked at normalization time", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Critical policy extraction fields were low confidence and need manual review.",
    fallbackEvidence: {
      pageUrl: "https://www.example.com/components/product-123",
      pageType: "non_policy",
      policySemanticConfidence: 0.5,
      signalValue: 0.5
    },
    observedValue: "Policy extraction",
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Low-confidence policy extraction"
  });

  assert.equal(concern.policyPageType, "non_policy");
  assert.equal(concern.promotionEligibility, "blocked");
  assert.equal(concern.externalSurfacingEligibility, "suppress");
});

test("fallback URL classification does not treat product pages with cookie terms as policy pages", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Critical policy extraction fields were low confidence and need manual review.",
    fallbackEvidence: {
      pageUrl: "https://www.kbdlab.io/components/pbtfans-cookies-n-creme",
      policySemanticConfidence: 0.5,
      signalValue: 0.5
    },
    observedValue: "Policy extraction",
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Low-confidence policy extraction"
  });

  assert.equal(concern.policyPageType, "non_policy");
  assert.equal(concern.promotionEligibility, "blocked");
});

test("low-confidence policy extraction is blocked for non-primary policy rows even with canonical page type", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Critical policy extraction fields were low confidence and need manual review.",
    fallbackEvidence: {
      isPrimaryPolicy: false,
      pageType: "privacy_policy",
      pageUrl: "https://www.kbdlab.io/components/pbtfans-cookies-n-creme",
      policySemanticConfidence: 0.5,
      signalValue: 0.5
    },
    observedValue: "Policy extraction",
    severity: "medium",
    signalKey: "policySemanticConfidence",
    signalLabel: "Policy semantic confidence",
    signalSource: "policy_enrichment_signal",
    sourceType: "signal",
    title: "Low-confidence policy extraction"
  });

  assert.equal(concern.policyIsPrimarySource, false);
  assert.equal(concern.promotionEligibility, "blocked");
  assert.equal(concern.externalSurfacingEligibility, "suppress");
});

test("bounded key-page discovery unresolved is blocked when stable linked legal coverage is already retained", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Bounded key-page discovery could not fully resolve every legal target.",
    fallbackEvidence: {
      contactPagePresent: true,
      keyPageAttemptCount: 4,
      keyPageDiscoverySource: "footer_link",
      privacyPolicyPresent: true,
      termsOfServicePresent: true
    },
    observedValue: "Bounded key-page discovery unresolved",
    severity: "medium",
    signalKey: "disclosure.key_page_discovery_unresolved_after_bounded_search",
    signalLabel: "Bounded key-page discovery unresolved",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Bounded key-page discovery unresolved"
  });

  assert.equal(concern.promotionEligibility, "blocked");
  assert.equal(concern.externalSurfacingEligibility, "suppress");
});

test("privacy policy missing surface stays audit-only when only the negative snapshot flag is retained", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "The snapshot marked the privacy policy surface as missing.",
    fallbackEvidence: {
      privacyPolicyPresent: false,
      signalKey: "disclosure.privacy_policy_surface_missing"
    },
    observedValue: "Privacy policy missing",
    severity: "high",
    signalKey: "disclosure.privacy_policy_surface_missing",
    signalLabel: "Privacy policy missing",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Privacy policy missing"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "privacy_policy_missing_surface");
  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");
});

test("dsar concerns with parser-incomplete extraction are blocked before unified finding generation", () => {
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    validationFindings: [
      makeValidationFinding({
        id: "dsar-1",
        ruleKey: "scan_report_review.missing_dsar_high_exposure",
        severity: "medium",
        title: "Possible missing privacy-rights path",
        evidence: {
          policyExtractionStatus: "parser_incomplete",
          policyRightsSignals: []
        }
      })
    ]
  });

  const candidates = buildUnifiedFindingCandidatesFromConcerns(concerns);

  assert.equal(concerns[0]?.promotionEligibility, "blocked");
  assert.equal(concerns[0]?.externalSurfacingEligibility, "suppress");
  assert.equal(candidates.length, 0);
});

test("non-eligible policy behavior conflicts do not assemble into unified finding candidates", () => {
  const concerns = buildNormalizedConcerns({
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
    validationFindings: []
  });

  assert.equal(concerns[0]?.suggestedUnifiedFindingId, "policy_behavior_conflict");
  assert.equal(concerns[0]?.promotionEligibility, "internal_only");

  const candidates = buildUnifiedFindingCandidatesFromConcerns(concerns);
  assert.equal(candidates.length, 0);
});

test("multiple concern origins still collapse into one canonical unified finding", () => {
  const linkedValidation = makeValidationFinding({
    id: "multi-1",
    ruleKey: "privacy.trackers_before_consent_detected",
    severity: "high",
    title: "Trackers observed before consent"
  });

  const packets = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "Signal path.",
        fallbackEvidence: {
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
      },
      {
        description: "Issue path.",
        observedValue: "Yes",
        severity: "medium",
        sourceType: "issue",
        title: "Trackers observed before consent"
      }
    ],
    validationFindings: [linkedValidation]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0]?.unifiedFindingId, "preconsent_tracking");
  assert.deepEqual(
    packets[0]?.concernContext?.originTypes.sort(),
    ["compatibility_signal", "snapshot_signal", "validation_rule"]
  );
});
