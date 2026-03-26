import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNormalizedConcerns,
  buildUnifiedFindingCandidatesFromConcerns,
  normalizeConcernFromReviewFindingCandidate,
  normalizeConcernFromPolicyReviewQueue,
  normalizeConcernFromValidationFinding
} from "./normalized-concerns";
import { buildUnifiedFindingPackets, type UnifiedFindingCandidate } from "./unified-findings";
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
  assert.equal(concerns[0]?.promotionEligibility, "eligible");
  assert.equal(concerns[0]?.externalSurfacingEligibility, "eligible");
  assert.equal(concerns[0]?.allowedNarrativeTier, "moderate");
  assert.deepEqual(concerns[0]?.negativeEvidenceFlags, ["no_consent_surface_observed"]);
  assert.ok(concerns[0]?.evidenceStrengthFlags.includes("fallback_only"));
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

test("replay validation concerns with runtime artifacts are eligible for external surfacing", () => {
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

  assert.equal(concern.promotionEligibility, "eligible");
  assert.equal(concern.externalSurfacingEligibility, "eligible");
  assert.ok(concern.evidenceStrengthFlags.includes("direct_runtime"));
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
