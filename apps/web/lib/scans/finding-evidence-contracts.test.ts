import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateFindingEvidenceContractForRawEvidence,
  FINDING_EVIDENCE_CONTRACTS
} from "./finding-evidence-contracts";

const consentTimeline = {
  firstNonEssentialRequestMs: 100,
  firstCmpVisibleMs: 500,
  firstConsentActionMs: 800
};

const nonEssentialRequest = {
  confidence: 0.92,
  essentiality: "non_essential",
  requestUrl: "https://analytics.example.net/pixel.js"
};

const rtbEvidence = {
  hostname: "sync-t1.taboola.com",
  pathSample: "/sg/pubmatic-network/1/rtb-h/",
  queryKeysSample: ["gdpr", "uid"],
  reason: "sync_path",
  urlSample: "https://sync-t1.taboola.com/sg/pubmatic-network/1/rtb-h/?uid=abc"
};

test("registry defines contracts for the high-risk finding set", () => {
  assert.deepEqual(
    FINDING_EVIDENCE_CONTRACTS.map((contract) => contract.findingId).sort(),
    [
      "analytics_cookies_before_consent",
      "cookie_disclosure_gap",
      "dark_pattern_consent_signals_detected",
      "non_essential_tracking_continued_after_reject",
      "pre_consent_tracking_detected",
      "reject_option_missing_or_hidden",
      "rtb_cookie_sync_observed",
      "session_replay_undisclosed",
      "third_party_tracking_before_consent",
      "tracking_cookies_set_before_consent"
    ].sort()
  );
});

test("raw snapshot boolean cannot satisfy a strong pre-consent contract", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    trackingBeforeConsentDetected: true,
    preconsent_tracking_detected: true
  });

  assert.equal(decision?.status, "downgrade");
  assert.equal(decision?.promotionEligibility, "internal_only");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("pre-consent without consentTimeline is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("pre-consent with timeline but unknown essentiality is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    consentTimeline,
    requestPurposeClassificationConfidence: [
      {
        confidence: 0.35,
        essentiality: "unknown",
        requestUrl: "https://www.googletagmanager.com/gtm.js"
      }
    ],
    runtimeRequestUrls: ["https://www.googletagmanager.com/gtm.js"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("nonEssentialRequestClassification"));
});

test("pre-consent with timeline and non-essential classification satisfies strong", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    consentTimeline,
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl]
  });

  assert.equal(decision?.status, "pass_strong");
  assert.equal(decision?.allowedNarrativeTier, "strong");
});

test("post-reject tracking without successful reject interaction is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("reject_did_not_reduce_tracking", {
    postRejectNonEssentialRequestUrls: ["https://analytics.example.net/collect"],
    requestPurposeClassificationConfidence: [nonEssentialRequest]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("successfulRejectInteraction"));
});

test("reject hidden requires inspected banner and reject path evidence", () => {
  const weakDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    privacy_dark_pattern_reject_button_missing: true
  });
  const strongDecision = evaluateFindingEvidenceContractForRawEvidence("reject_button_missing", {
    rejectPathDepthAndAvailability: {
      availability: "hidden",
      bannerLayerInspected: true,
      depth: 2,
      rejectInteractionSucceeded: false
    }
  });

  assert.equal(weakDecision?.status, "downgrade");
  assert.ok(weakDecision?.missingRequirements.includes("rejectPathDepthEvidence"));
  assert.equal(strongDecision?.status, "pass_strong");
});

test("cookie disclosure gap without policy anchor is not promoted", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", {
    runtime_cookie_names: ["_ga"],
    unmatched_cookie_categories: ["analytics"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("policyAnchor"));
});

test("session replay undisclosed without negative disclosure search is downgraded", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("session_replay_undisclosed", {
    policyExtractionStatus: "fetched",
    policySourceUrl: "https://example.com/privacy",
    sessionReplayVendors: ["Microsoft Clarity"]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("negativeEvidenceSearchScope"));
});

test("RTB observed can surface as runtime RTB but not strong pre-consent RTB without timeline", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("rtb_cookie_sync_observed", {
    rtb_cookie_sync_evidence: [rtbEvidence]
  });

  assert.equal(decision?.status, "pass_good");
  assert.equal(decision?.allowedNarrativeTier, "moderate");
  assert.ok(decision?.missingRequirements.includes("consentTimelineSequence"));
});

test("material bot block prevents strong runtime findings", () => {
  const decision = evaluateFindingEvidenceContractForRawEvidence("preconsent_tracking", {
    botBlockChallengeEvidence: { blocked: true, coverageImpact: "material" },
    consentTimeline,
    requestPurposeClassificationConfidence: [nonEssentialRequest],
    runtimeRequestUrls: [nonEssentialRequest.requestUrl]
  });

  assert.equal(decision?.status, "downgrade");
  assert.ok(decision?.missingRequirements.includes("coverageNotMateriallyBlocked"));
});
