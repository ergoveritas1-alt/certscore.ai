import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCookieDisclosureGapPromotionBlockers,
  classifyDsarPromotionBlockers,
  classifyPositiveDisclosurePromotionBlockers,
  classifyPreconsentPromotionBlockers,
  classifyPrivacyRightsPathPromotionBlockers,
  summarizePromotionBlockers
} from "./production-promotion-blockers";

test("preconsent blocker classifier promotes non-essential cookie timing evidence", () => {
  const assessment = classifyPreconsentPromotionBlockers({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          category: "advertising",
          cookieName: "_fbp",
          timingEvidence: "before_consent_cookie_write"
        }
      ]
    },
    preconsentTrackingDetected: true
  });

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
  assert.deepEqual(assessment.evidence.nonEssentialCookieNames, ["_fbp"]);
});

test("preconsent blocker classifier distinguishes necessary cookie-only evidence", () => {
  const assessment = classifyPreconsentPromotionBlockers({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          category: "necessary",
          cookieName: "__cf_bm",
          timingEvidence: "before_consent_cookie_write"
        }
      ]
    },
    preconsentTrackingDetected: true
  });

  assert.equal(assessment.promotionReady, false);
  assert.ok(assessment.blockers.includes("missing_concrete_tracker_request_url"));
  assert.ok(assessment.blockers.includes("necessary_cookie_only"));
});

test("preconsent blocker classifier treats Adobe and replay cookies as non-essential", () => {
  const assessment = classifyPreconsentPromotionBlockers({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [
        {
          cookieName: "demdex",
          timingEvidence: "before_consent_cookie_write"
        },
        {
          cookieName: "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L",
          timingEvidence: "before_consent_cookie_write"
        }
      ]
    },
    preconsentTrackingDetected: true
  });

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
  assert.deepEqual(assessment.evidence.nonEssentialCookieNames, ["demdex", "QSI_ReplaySession_Info_ZN_8DiCwx5sYuF137L"]);
});

test("DSAR blocker classifier promotes explicit fetched absence evidence", () => {
  const assessment = classifyDsarPromotionBlockers({
    policyDsarMechanism: "absent",
    policyExtractionStatus: "fetched",
    policyPageUrl: "https://example.test/privacy",
    policyRightsSignals: [],
    policySemanticConfidence: 0.86,
    sectionReviewNoDsarMechanism: true
  });

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
});

test("DSAR blocker classifier demotes retained rights mechanisms", () => {
  const assessment = classifyDsarPromotionBlockers({
    policyDsarMechanism: "form",
    policyExtractionStatus: "fetched",
    policyPageUrl: "https://example.test/privacy",
    policyRightsSignals: ["access_request", "delete_request"],
    policySemanticConfidence: 0.9
  });

  assert.equal(assessment.promotionReady, false);
  assert.ok(assessment.blockers.includes("dsar_mechanism_present"));
  assert.ok(assessment.blockers.includes("rights_signals_present"));
});

test("privacy-rights path blocker classifier promotes actionable retained rights evidence", () => {
  const assessment = classifyPrivacyRightsPathPromotionBlockers({
    policyDsarMechanism: "form",
    policyEvidenceSnippets: {
      policy_rights_signals: "Submit a request to access, delete, or correct your personal information."
    },
    policyExtractionStatus: "fetched",
    policyPageUrl: "https://example.test/privacy",
    policyRightsSignals: ["access_request", "delete_request"],
    policySemanticConfidence: 0.82
  });

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
});

test("positive disclosure blocker classifier requires finding-specific policy text", () => {
  const assessment = classifyPositiveDisclosurePromotionBlockers(
    {
      policyEvidenceSnippets: {
        session_replay_disclosure: "We use session replay tools and heatmaps to understand how visitors use our pages."
      },
      policyExtractionStatus: "fetched",
      policyPageUrl: "https://example.test/privacy",
      policyPositiveSignalPresent: true,
      policySemanticConfidence: 0.74
    },
    "behavioral_analytics_disclosure_present"
  );

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
});

test("positive disclosure blocker classifier keeps generic analytics text blocked", () => {
  const assessment = classifyPositiveDisclosurePromotionBlockers(
    {
      policyEvidenceSnippets: {
        analytics: "We use analytics to improve our services."
      },
      policyExtractionStatus: "fetched",
      policyPageUrl: "https://example.test/privacy",
      policyPositiveSignalPresent: true,
      policySemanticConfidence: 0.74
    },
    "behavioral_analytics_disclosure_present"
  );

  assert.equal(assessment.promotionReady, false);
  assert.ok(assessment.blockers.includes("generic_or_low_value_disclosure_text"));
});

test("cookie disclosure gap blocker classifier requires runtime and unmatched inventory", () => {
  const assessment = classifyCookieDisclosureGapPromotionBlockers({
    cookieGapValidationEvidence: {
      runtimeCookieNames: ["_ga", "_fbp"],
      unmatchedCookieNames: ["_fbp"]
    },
    policyExtractionStatus: "fetched",
    policyPageType: "cookie_policy",
    policyPageUrl: "https://example.test/cookie-policy",
    policyPositiveSignalPresent: true,
    policySemanticConfidence: 0.8
  });

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
});

test("cookie disclosure gap blocker classifier accepts validation-backed snake_case evidence", () => {
  const assessment = classifyCookieDisclosureGapPromotionBlockers({
    cookieGapValidationEvidence: {
      cookie_policy_url: "https://example.test/legal/cookie-policy",
      runtime_cookie_names: ["demdex", "QSI_ReplaySession_Info"],
      unmatched_cookie_names: ["demdex"],
      unmatched_third_party_cookie_count: 1
    },
    policyPositiveSignalPresent: false
  });

  assert.equal(assessment.promotionReady, true);
  assert.deepEqual(assessment.blockers, []);
  assert.equal(assessment.evidence.policyPageUrl, "https://example.test/legal/cookie-policy");
  assert.equal(assessment.evidence.validationBacked, true);
});

test("cookie disclosure gap blocker classifier keeps runtime-only cases blocked", () => {
  const assessment = classifyCookieDisclosureGapPromotionBlockers({
    cookieGapValidationEvidence: {
      runtime_cookie_names: ["_fbp"],
      unmatched_cookie_names: ["_fbp"],
      unmatched_third_party_cookie_count: 1
    },
    policyPositiveSignalPresent: false
  });

  assert.equal(assessment.promotionReady, false);
  assert.ok(assessment.blockers.includes("missing_policy_anchor_url"));
  assert.ok(assessment.blockers.includes("missing_cookie_or_privacy_policy_anchor"));
  assert.ok(!assessment.blockers.includes("missing_cookie_gap_signal"));
});

test("summarizePromotionBlockers counts blockers and ready candidates", () => {
  const summary = summarizePromotionBlockers([
    classifyDsarPromotionBlockers({
      policyDsarMechanism: "absent",
      policyExtractionStatus: "fetched",
      policyPageUrl: "https://example.test/privacy",
      policyRightsSignals: [],
      policySemanticConfidence: 0.86
    }),
    classifyDsarPromotionBlockers({
      policyDsarMechanism: "unknown",
      policyExtractionStatus: "parser_incomplete",
      policyPageUrl: null,
      policyRightsSignals: [],
      policySemanticConfidence: 0.4
    })
  ]);

  assert.equal(summary.candidateCount, 2);
  assert.equal(summary.readyCount, 1);
  assert.ok(summary.blockerCounts.some(([blocker, count]) => blocker === "missing_policy_anchor_url" && count === 1));
});
