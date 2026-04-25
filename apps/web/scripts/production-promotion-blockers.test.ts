import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDsarPromotionBlockers,
  classifyPreconsentPromotionBlockers,
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
