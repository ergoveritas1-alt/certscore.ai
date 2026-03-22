import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnifiedFindingDisplayPackets,
  buildUnifiedFindingPackets,
  getUnifiedFindingCategoryRelation,
  getUnifiedFindingOwnerCategoryId,
  type UnifiedFindingCandidate
} from "./unified-findings";
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
    title: "Trackers observed before consent"
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
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "signal"));
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "issue"));
  assert.ok(packets[0]?.sourceRefs.some((row) => row.kind === "validation"));
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
  assert.deepEqual(packet?.evidence?.entities?.relatedVendors, ["Microsoft Clarity"]);
  assert.ok(packet?.evidence?.snippets?.includes("Replay script observed during homepage load"));
});
