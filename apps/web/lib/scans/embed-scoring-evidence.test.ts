import assert from "node:assert/strict";
import test from "node:test";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveRegulatoryCoverageScore, deriveGdprEprivacyDeductionBreakdown } from "./regulatory-coverage-score";
import { buildEmbedScoringEvidence, EMBED_SCORE_ROW_IDS } from "./embed-scoring-evidence";

const score = (rows: Parameters<typeof deriveGdprEprivacyDeductionBreakdown>[0]) => deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows }).score;
const row = (id: string, host = "www.youtube.com", purpose: "mediaEmbed" | "formOrChatWidget" = "mediaEmbed") => ({
  id, assessmentStatus: "gap_observed", status: "Gap observed", evidenceState: "observed",
  criticalEvidence: { retainedEvidence: { embedScoringEvidence: buildEmbedScoringEvidence([{ host, purpose, resource: `https://${host}/embed/example` }]) } },
});
test("same provider/content exposure counts once across three labels, with stable visible attribution", () => {
  const rows = EMBED_SCORE_ROW_IDS.map(id => row(id));
  assert.equal(score(rows), 95);
  assert.equal(deriveGdprEprivacyDeductionBreakdown(rows, "gdpr-eprivacy-posture.v18")[0]?.deductionPoints, 15,
    "the previous scoring policy never applies new overlap rules");
  assert.equal(score([...rows].reverse()), 95);
  assert.deepEqual(deriveGdprEprivacyDeductionBreakdown(rows)[0]?.rules.map(rule => rule.ruleId), ["third_party_iframe_pre_consent"]);
  assert.equal(score([row(EMBED_SCORE_ROW_IDS[0]), row(EMBED_SCORE_ROW_IDS[1], "player.vimeo.com")]), 90);
  assert.equal(score([row(EMBED_SCORE_ROW_IDS[0]), row(EMBED_SCORE_ROW_IDS[1], "www.youtube.com", "formOrChatWidget")]), 90);
  const distinctResource = row(EMBED_SCORE_ROW_IDS[1]);
  distinctResource.criticalEvidence.retainedEvidence.embedScoringEvidence.groups[0]!.resource = "https://www.youtube.com/embed/different";
  assert.equal(score([rows[0]!, distinctResource]), 90, "different resources on the same host are not collapsed");
  for (const resource of ["invalid", "https://different.test/embed/example", "https://www.youtube.com/embed/example?secret=value"]) {
    const malformed = row(EMBED_SCORE_ROW_IDS[0]);
    malformed.criticalEvidence.retainedEvidence.embedScoringEvidence.groups[0]!.resource = resource;
    assert.equal(score([malformed]), 100, "malformed or unbound evidence remains neutral");
  }
  const legacy = rows.map(value => ({ ...value, criticalEvidence: { retainedEvidence: {} } }));
  assert.equal(score(legacy), 85, "unversioned historical rows are not silently reinterpreted");
  assert.equal(score([{ ...rows[0]!, criticalEvidence: { retainedEvidence: { embedScoringEvidence: { policyVersion: "broken" } } } }]), 100);
});

function project(runtimeArtifacts: Record<string, unknown>) {
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: false });
  return deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, unifiedFindings: [], projectedFindings: [], scanCompleted: true, coverageLimited: false });
}
test("canonical embed policy retains the three observations but charges a YouTube exposure once", () => {
  const observation = { frameUrl: "https://www.youtube.com/embed/example", hostname: "www.youtube.com", timestampMs: 1000,
    thirdParty: true, preConsent: true, consentStateAtTime: "pre_consent", initiatorType: "iframe" };
  const rows = project({ iframeEvents: [observation], hybridRuntimeEvidence: { runtimeCaptureCompleted: true,
    iframeSummary: { preConsentIframeCount: 1, iframeEvents: [observation] },
    embeddedContentSummary: { embeddedContentObserved: true, observations: [observation] } } });
  const embeds = rows.filter(value => EMBED_SCORE_ROW_IDS.some(id => id === value.id));
  assert.equal(embeds.filter(value => ["gap_observed", "review_signal"].includes(value.assessmentStatus)).length, 3);
  assert.equal(score(embeds), 95);
});
test("a Reddit pixel remains an observation without a second embed deduction", () => {
  const observation = { requestUrl: "https://www.redditstatic.com/ads/pixel.js", hostname: "www.redditstatic.com",
    category: "advertising", vendor: "Reddit Pixel", resourceType: "script", initiatorType: "script", timestampMs: 1000, preConsent: true };
  const rows = project({ hybridRuntimeEvidence: { runtimeCaptureCompleted: true,
    embeddedContentSummary: { embeddedContentObserved: true, observations: [observation,
      { ...observation, requestUrl: "https://pixel-config.reddit.com/v2/config", hostname: "pixel-config.reddit.com", vendor: "Reddit" },
      { ...observation, requestUrl: "https://alb.reddit.com/rp.gif", hostname: "alb.reddit.com", vendor: "Reddit" }] },
    requestPurposeClassificationConfidence: [observation] } });
  const embeds = rows.filter(value => EMBED_SCORE_ROW_IDS.some(id => id === value.id));
  assert.ok(embeds.some(value => value.assessmentStatus === "gap_observed"));
  assert.equal(score(embeds), 100);
  const tracker = { id: "pre_consent_third_party_tracking", assessmentStatus: "gap_observed", evidenceState: "observed", status: "Gap observed" };
  assert.equal(score([...embeds, tracker]), 92, "tracking keeps its own score effect");
});
