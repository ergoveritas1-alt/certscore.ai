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

function makeMissingBridgePolicyRuntimeEvidence(runtimeOverride: Record<string, unknown> = {}) {
  return {
    policyClaimCandidates: [
      {
        id: "policy_claim:only_necessary_cookies_before_choice:snippet-1",
        claimType: "only_necessary_cookies_before_choice",
        sourceUrl: "https://example.com/privacy",
        documentType: "privacy_policy",
        extractionStatus: "fetched",
        snippet:
          "We use optional analytics and advertising cookies only after you make a cookie choice, and you can control or reject non-essential cookies in our preference center.",
        snippetHash: "snippet-1",
        sectionPath: "Cookies and tracking",
        headingPath: "Cookies and tracking",
        charStart: 42,
        charEnd: 210,
        confidence: 0.91,
        extractedBy: "ws01.policy_extractor",
        extractionVersion: "ws01-policy-runtime:v1"
      }
    ],
    runtimeBehaviorArtifacts: [
      {
        id: "runtime_artifact:request:pre_consent:request-1",
        artifactType: "request",
        phase: "pre_consent",
        url: "https://analytics.example.net/collect?id=abc",
        host: "analytics.example.net",
        vendor: "Example Analytics",
        cookieName: null,
        storageKey: null,
        timestampMs: 880,
        cmpVisibleMs: 1400,
        consentActionObserved: false,
        confidence: 0.9,
        sourceArtifactRef: "sanitized_network_evidence:request-1",
        ...runtimeOverride
      }
    ],
    policyRuntimeBridgeCandidates: []
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

test("retains runtime host inventory context without promoting inventory-only tracking", () => {
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [
      {
        description: "Runtime host inventory observed third-party adtech hosts, but no pre-consent sequence artifact was retained.",
        fallbackEvidence: {
          runtimeHostInventoryContext: [
            {
              cookieNamesSample: ["TDID"],
              host: "match.adsrvr.org",
              matchedSignatureId: "trade_desk",
              matchedVendorCategory: "advertising",
              matchedVendorName: "The Trade Desk",
              samplePaths: ["/track/cmf"],
              sampleQueryKeys: ["uid"],
              sources: ["request", "cookie"]
            }
          ],
          signalKey: "privacy.preconsent_tracking_detected"
        },
        observedValue: "Possible tracking host observed",
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

  const [concern] = concerns;
  assert.ok(concern);
  assert.deepEqual(concern.evidenceBundle.entities.runtimeHostInventoryHosts, ["match.adsrvr.org"]);
  assert.deepEqual(concern.evidenceBundle.entities.runtimeHostInventoryVendors, ["The Trade Desk"]);
  assert.equal(concern.promotionEligibility, "internal_only");
  assert.equal(concern.externalSurfacingEligibility, "audit_only");
  assert.ok(concern.negativeEvidenceFlags.includes("missing_concrete_preconsent_artifact"));
  assert.equal(buildUnifiedFindingCandidatesFromConcerns(concerns)[0]?.normalizedConcern.promotionEligibility, "internal_only");
});

test("retains fingerprinting runtime evidence through normalized concerns into executive projection", () => {
  const reviewFindingCandidate = {
    description: "Fingerprinting runtime detected",
    fallbackEvidence: {
      fingerprintArtifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary"],
      fingerprintAttributeCategories: ["canvas_webgl", "audio"],
      fingerprintRuntimeEvidence: [
        {
          artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
          attributeCategories: ["canvas_webgl", "audio"],
          requestUrl: "https://fp.example.test/collect",
          tier: 2
        }
      ],
      fingerprintRuntimeEvidenceRetained: true,
      fingerprintSignals: ["canvas_webgl", "audio"],
      fingerprintSummary: {
        attributeCategories: [
          { count: 3, firstSeenMs: 120, name: "canvas_webgl" },
          { count: 3, firstSeenMs: 140, name: "audio" }
        ],
        confidence: "medium",
        reasons: ["Observed identifier-like structuring or shaping behavior."],
        summary: "The page showed multi-signal device and browser data collection consistent with potential fingerprinting.",
        tier: 2
      },
      fingerprintTier: 2,
      highEntropySignals: ["canvas_webgl", "audio"],
      requestUrls: ["https://fp.example.test/collect"],
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
  assert.deepEqual(candidateEntities?.fingerprintAttributeCategories, ["canvas_webgl", "audio"]);
  assert.equal(evaluateFindingEvidenceContractForRawEvidence("fingerprinting_observed", candidateFallbackEvidence)?.status, "pass_strong");

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [reviewFindingCandidate],
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "fingerprinting_observed");

  assert.ok(packet);
  assert.equal(packet.evidence?.counts?.fingerprintTier, 2);
  assert.deepEqual(packet.evidence?.entities?.fingerprintAttributeCategories, ["canvas_webgl", "audio"]);
  assert.ok(packet.evidence?.entities?.fingerprintingRuntimeEvidence?.[0]?.includes("\"tier\":2"));
  assert.equal(evaluateFindingEvidenceContractForPacket(packet)?.status, "pass_strong");

  const projection = projectExecutiveFindingsFromUnifiedPackets(packets);
  assert.ok(projection.findings.some((finding) => finding.id === "probable_fingerprinting"));
});

test("generic tier-2 fingerprinting telemetry stays out of executive projection", () => {
  const genericCandidate = {
    description: "Fingerprinting runtime detected",
    fallbackEvidence: {
      fingerprintArtifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary"],
      fingerprintAttributeCategories: ["screen_viewport", "hardware", "storage", "timezone_locale", "input_touch"],
      fingerprintRuntimeEvidence: [
        {
          artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
          attributeCategories: ["screen_viewport", "hardware", "storage", "timezone_locale", "input_touch"],
          tier: 2
        }
      ],
      fingerprintRuntimeEvidenceRetained: true,
      fingerprintSignals: ["screen_viewport", "hardware", "storage", "timezone_locale", "input_touch"],
      fingerprintSummary: {
        attributeCategories: [
          { count: 3, firstSeenMs: 120, name: "screen_viewport" },
          { count: 3, firstSeenMs: 140, name: "hardware" },
          { count: 3, firstSeenMs: 160, name: "storage" }
        ],
        confidence: "medium",
        reasons: ["Observed common browser/device telemetry."],
        summary: "The page showed common browser and device attributes.",
        tier: 2
      },
      fingerprintTier: 2,
      highEntropySignals: ["screen_viewport", "hardware", "storage", "timezone_locale", "input_touch"],
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
    reviewFindingCandidates: [genericCandidate],
    validationFindingLookup: new Map(),
    validationFindings: []
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "fingerprinting_observed");

  assert.ok(packet);
  assert.equal(evaluateFindingEvidenceContractForPacket(packet)?.status, "downgrade");
  assert.ok(!projectExecutiveFindingsFromUnifiedPackets(packets).findings.some((finding) => finding.id === "probable_fingerprinting"));
});

test("tier-2 canvas evidence needs identity corroboration before probable fingerprinting surfacing", () => {
  const baseCandidate = {
    description: "Fingerprinting runtime detected",
    observedValue: "true",
    severity: "medium",
    signalKey: "privacy.fingerprinting_detected",
    signalLabel: "Fingerprinting runtime detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "Fingerprinting runtime detected"
  } satisfies Omit<UnifiedFindingCandidate, "fallbackEvidence">;
  const makePackets = (categories: string[], requestUrl?: string) => buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        ...baseCandidate,
        fallbackEvidence: {
          fingerprintArtifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary"],
          fingerprintAttributeCategories: categories,
          fingerprintRuntimeEvidence: [
            {
              artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
              attributeCategories: categories,
              ...(requestUrl ? { requestUrl } : {}),
              tier: 2
            }
          ],
          fingerprintRuntimeEvidenceRetained: true,
          fingerprintSummary: {
            attributeCategories: categories.map((name) => ({ count: 2, name })),
            confidence: "medium",
            reasons: ["Observed fingerprint-relevant browser APIs."],
            tier: 2
          },
          fingerprintTier: 2,
          highEntropySignals: categories,
          ...(requestUrl ? { requestUrls: [requestUrl] } : {}),
          signalKey: "privacy.fingerprinting_detected",
          signalValue: true
        }
      } satisfies UnifiedFindingCandidate
    ],
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  const canvasOnlyPackets = makePackets(["screen_viewport", "hardware", "storage", "canvas_webgl"]);
  const canvasOnlyPacket = canvasOnlyPackets.find((entry) => entry.unifiedFindingId === "fingerprinting_observed");

  assert.ok(canvasOnlyPacket);
  assert.equal(evaluateFindingEvidenceContractForPacket(canvasOnlyPacket)?.status, "downgrade");
  assert.ok(!projectExecutiveFindingsFromUnifiedPackets(canvasOnlyPackets).findings.some((finding) => finding.id === "probable_fingerprinting"));

  const clusteredPackets = makePackets(["screen_viewport", "hardware", "canvas_webgl", "fonts_plugins"]);
  const clusteredPacket = clusteredPackets.find((entry) => entry.unifiedFindingId === "fingerprinting_observed");

  assert.ok(clusteredPacket);
  assert.equal(evaluateFindingEvidenceContractForPacket(clusteredPacket)?.status, "downgrade");
  assert.ok(!projectExecutiveFindingsFromUnifiedPackets(clusteredPackets).findings.some((finding) => finding.id === "probable_fingerprinting"));

  const identityLinkedPackets = makePackets(
    ["screen_viewport", "hardware", "canvas_webgl", "fonts_plugins"],
    "https://fp.example.test/collect?device_fingerprint=abc"
  );
  assert.ok(projectExecutiveFindingsFromUnifiedPackets(identityLinkedPackets).findings.some((finding) => finding.id === "probable_fingerprinting"));
});

test("fingerprinting summary string categories and request counts remain available to promotion policy", () => {
  const candidate = {
    description: "Fingerprinting runtime detected",
    fallbackEvidence: {
      fingerprintArtifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary"],
      fingerprintRuntimeEvidence: [
        {
          artifactRef: "scan_runtime_artifacts.hybrid_runtime_evidence.fingerprintSummary",
          requestUrl: "https://telemetry.example.test/collect",
          tier: 2
        }
      ],
      fingerprintRuntimeEvidenceRetained: true,
      fingerprintSummary: {
        attributeCategories: ["canvas_webgl", "fonts_plugins"],
        deviceDataLikeRequestCount: 1,
        identifierLikeRequestCount: 1,
        tier: 2
      },
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
    reviewFindingCandidates: [candidate],
    validationFindings: []
  });
  const [unifiedCandidate] = buildUnifiedFindingCandidatesFromConcerns(concern ? [concern] : []);
  const fallbackEvidence = unifiedCandidate?.fallbackEvidence as Record<string, unknown> | undefined;
  const counts = fallbackEvidence?.counts as Record<string, unknown> | undefined;
  const entities = fallbackEvidence?.entities as Record<string, unknown> | undefined;

  assert.deepEqual(entities?.fingerprintAttributeCategories, ["canvas_webgl", "fonts_plugins"]);
  assert.equal(counts?.identifierLikeRequestCount, 1);
  assert.equal(counts?.deviceDataLikeRequestCount, 1);
  assert.equal(concern?.promotionEligibility, "eligible");

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [candidate],
    validationFindingLookup: new Map(),
    validationFindings: []
  });

  assert.ok(projectExecutiveFindingsFromUnifiedPackets(packets).findings.some((finding) => finding.id === "probable_fingerprinting"));
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

test("high-sensitivity candidates with replay co-occurrence artifacts specialize into sensitive replay findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input appears to coexist with replay tooling.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "financial_information",
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          requestUrl: "https://clarity.ms/collect",
          vendorHost: "clarity.ms"
        }
      ]
    },
    observedValue: "Yes",
    severity: "high",
    signalKey: "commerce.high_sensitivity_data_collection_detected",
    signalLabel: "High-sensitivity data collection detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "High-sensitivity data collection detected"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "possible_session_replay_on_sensitive_input_surface");
  assert.equal(concern.promotionEligibility, "eligible");
  assert.ok(concern.evidenceStrengthFlags.includes("direct_runtime"));
});

test("high-sensitivity candidates with independent replay artifacts stay general sensitive collection", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input and replay tooling were observed independently.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "financial_information",
          evidenceStrength: "form_field_signal",
          matchSnippet: "Bank account",
          requestUrl: "",
          sourceField: "bank_account"
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

  assert.equal(concern.suggestedUnifiedFindingId, "sensitive_collection_surface_observed");
});

test("high-sensitivity candidates with independent sensitive requests and replay runtime stay out of sensitive replay findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive request and replay tooling were observed on the same scan surface.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "postal_code_detected",
          evidenceStrength: "suspected",
          matchSnippet: "zipcode=64***18",
          requestUrl: "https://api.example.com/location?zipcode=64118",
          sourceField: "zipcode",
          vendorHost: "api.example.com"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["FullStory"]
    },
    observedValue: "Yes",
    severity: "high",
    signalKey: "commerce.high_sensitivity_data_collection_detected",
    signalLabel: "High-sensitivity data collection detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "High-sensitivity data collection detected"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "sensitive_collection_surface_observed");
});

test("high-sensitivity candidates with replay-correlated sensitive artifacts specialize into sensitive replay findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input appears to coexist with replay collection on the same surface.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "email_detected",
          evidenceSource: "sensitive_field_session_replay_correlation",
          evidenceStrength: "form_field_signal",
          matchSnippet: "email field",
          requestUrl: "https://k.clarity.ms/collect",
          sourceField: "email",
          vendorHost: "k.clarity.ms"
        }
      ],
      session_replay_runtime_detected: true,
      session_replay_runtime_vendors: ["Microsoft Clarity"]
    },
    observedValue: "Yes",
    severity: "high",
    signalKey: "commerce.high_sensitivity_data_collection_detected",
    signalLabel: "High-sensitivity data collection detected",
    signalSource: "snapshot_signal",
    sourceType: "signal",
    title: "High-sensitivity data collection detected"
  });

  assert.equal(concern.suggestedUnifiedFindingId, "possible_session_replay_on_sensitive_input_surface");
  assert.equal(concern.promotionEligibility, "eligible");
  assert.equal(concern.externalSurfacingEligibility, "eligible");
  assert.ok(concern.evidenceStrengthFlags.includes("direct_runtime"));
});

test("high-sensitivity candidates with third-party tracking specialize into sensitive tracking findings", () => {
  const concern = normalizeConcernFromReviewFindingCandidate({
    description: "Sensitive input appears to coexist with third-party tracking.",
    fallbackEvidence: {
      sensitivePayloadViolations: [
        {
          detectedType: "health_information",
          evidenceSource: "sensitive_field_third_party_tracking_correlation",
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

test("policy behavior candidates with strong anchors but missing bridge assemble as audit-only concerns", () => {
  const fallbackEvidence = makeMissingBridgePolicyRuntimeEvidence();
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [
      {
        description: "WS01 retained policy and runtime anchors but no bridge provenance.",
        fallbackEvidence: {
          ...fallbackEvidence,
          unifiedFindingId: "policy_behavior_conflict"
        },
        observedValue: "Candidate missing stable bridge provenance",
        severity: "high",
        signalKey: "context.policy_behavior_conflict_detected",
        signalLabel: "Policy/behavior conflict detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: []
  });

  assert.equal(concerns[0]?.suggestedUnifiedFindingId, "policy_behavior_conflict");
  assert.equal(concerns[0]?.promotionEligibility, "internal_only");
  assert.equal(concerns[0]?.externalSurfacingEligibility, "audit_only");
  assert.ok(concerns[0]?.negativeEvidenceFlags.includes("missing_bridge_provenance"));
  assert.ok(!concerns[0]?.negativeEvidenceFlags.includes("missing_policy_side_evidence"));
  assert.ok(!concerns[0]?.negativeEvidenceFlags.includes("missing_runtime_anchor"));

  const candidates = buildUnifiedFindingCandidatesFromConcerns(concerns);
  assert.equal(candidates.length, 1);

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        description: "WS01 retained policy and runtime anchors but no bridge provenance.",
        fallbackEvidence: {
          ...fallbackEvidence,
          unifiedFindingId: "policy_behavior_conflict"
        },
        observedValue: "Candidate missing stable bridge provenance",
        severity: "high",
        signalKey: "context.policy_behavior_conflict_detected",
        signalLabel: "Policy/behavior conflict detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "policy_behavior_conflict");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.concernContext?.promotionEligibilities.includes("eligible"), false);

  const executive = projectExecutiveFindingsFromUnifiedPackets(packets);
  assert.equal(executive.findings.some((finding) => finding.id === "policy_behavior_contradiction_detected"), false);
});

test("policy behavior missing-bridge lane does not assemble from vendor-only runtime anchors", () => {
  const fallbackEvidence = makeMissingBridgePolicyRuntimeEvidence({
    artifactType: "vendor",
    url: null,
    host: null,
    cookieName: null,
    storageKey: null
  });
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [
      {
        description: "WS01 retained a policy anchor and a bare runtime vendor name.",
        fallbackEvidence: {
          ...fallbackEvidence,
          unifiedFindingId: "policy_behavior_conflict"
        },
        observedValue: "Vendor only",
        severity: "high",
        signalKey: "context.policy_behavior_conflict_detected",
        signalLabel: "Policy/behavior conflict detected",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Policy/behavior conflict detected"
      }
    ],
    validationFindings: []
  });

  assert.equal(concerns[0]?.suggestedUnifiedFindingId, "policy_behavior_conflict");
  assert.equal(concerns[0]?.promotionEligibility, "internal_only");
  assert.equal(buildUnifiedFindingCandidatesFromConcerns(concerns).length, 0);
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

test("normalizes snake_case validation rows before building concerns", () => {
  const concerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    validationFindings: [
      {
        id: "db-row-1",
        rule_key: "runtime_privacy.preconsent_tracking_observed",
        title: "Tracking observed before consent",
        description: "Runtime evidence retained pre-consent tracking.",
        evidence_json: {
          preconsent_tracking_detected: true,
          runtimeVendors: ["Example Analytics"]
        },
        severity: "high"
      } as unknown as ScanValidationFinding
    ]
  });

  assert.equal(concerns.length, 1);
  assert.equal(concerns[0]?.originKey, "runtime_privacy.preconsent_tracking_observed");
  assert.equal(concerns[0]?.originType, "validation_rule");
  assert.equal(concerns[0]?.evidenceBundle.rawEvidence?.preconsent_tracking_detected, true);
});
