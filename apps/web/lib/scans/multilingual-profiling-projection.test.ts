import assert from "node:assert/strict";
import test from "node:test";
import { classifyGdprTransparencyTopics } from "@certscore/contracts";
import { behavioralProfilingFixtures, negatedProfilingFixtures } from "../../../../packages/certscore-contracts/src/test-fixtures/behavioral-profiling";
import { adaptGdprTransparencyTopicCandidatesForProduction } from "./gdpr-transparency-topic-evidence-adapter";
import { GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE } from "./gdpr-transparency-production-profile";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";
import { buildReportDisplayExport } from "../api-v2/report-display-export";

function project(text: string, owned = true) {
  const matches = classifyGdprTransparencyTopics({section: {heading: "Privacy policy", body: text}}).matches;
  const adapted = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: owned,
    pageUrl: "https://example.test/privacy", policyTextQuality: {usable: true},
    surface: {normalizedUrl: "https://example.test/privacy", url: "https://example.test/privacy",
      status: "fetched", surfaceType: "privacy_policy", textExcerpt: text,
      gdprTransparencyTopicCandidates: matches.map(match => ({
        classifierProvenance: match.classifierProvenance, classifierReasonCodes: match.reasonCodes,
        confidence: match.confidence, evidenceText: match.evidenceExcerpt, matchedLocale: match.matchedLocale,
        matchedTerm: match.matchedTerm, matchStrength: match.matchStrength, productionCredit: false,
        status: "diagnostic_only", topic: match.topic, variant: match.variant,
      })),
    },
  });
  const normalizedConcerns = buildNormalizedConcerns({reviewFindingCandidates: [], validationFindings: [],
    runtimeArtifacts: {policyDisclosureSummary: {
      article13DisclosureSignals: adapted.acceptedProductionSignals,
      gdprTransparencyEvidenceProfile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
      gdprTransparencyProductionEvidenceEnabled: true,
    }},
  });
  // Persistence must be lossless; downstream consumes the serialized concern only.
  const persistedConcerns = JSON.parse(JSON.stringify(normalizedConcerns));
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited: true,
    scanCompleted: true, normalizedConcerns: persistedConcerns, runtimeArtifacts: {}, snapshot: {}});
  const checklist = deriveGdprEprivacyCoverageChecklist({coverageLimited: true, scanCompleted: true,
    coverageOutcomes, unifiedFindings: []});
  return {adapted, normalizedConcerns, row: checklist.find(row => row.id === "automated_decision_making_profiling_disclosure")!};
}

for (const [locale, tracking, newsletter, aggregate] of behavioralProfilingFixtures) {
  test(`${locale}: canonical concern, checklist and API retain the same observed practice and quote`, () => {
    for (const [text, basis] of [[tracking, "individual_interest_tracking"], [newsletter, "newsletter_engagement_personalization"]] as const) {
      const {row, normalizedConcerns} = project(text);
      assert.equal(row.status, "Observed", text);
      assert.equal(row.criticalEvidence?.retainedEvidence.profilingPracticeBasis, basis);
      assert.equal((row.criticalEvidence?.retainedEvidence.article22DetailAssessment as Record<string, unknown>).assessment, "not_evaluated");
      assert.ok(normalizedConcerns.length > 0);
      const rationale = deriveGdprEprivacyCoverageChecklistRowRationale(row);
      assert.match(rationale, /^Profiling disclosed: (individual interest tracking|engagement-based newsletter personalization)/);
      assert.ok(rationale.includes(text.normalize("NFKC").replace(/[‘’]/g, "'")), "retain original localized wording after canonical quote normalization");
      const visibleRow = {id: row.id, status: row.status, rationale};
      const exported = buildReportDisplayExport({gdprTransparencyRows: [visibleRow]});
      assert.deepEqual((exported as Record<string, unknown>).gdprTransparencyRows, [visibleRow], "API/MCP report export must not reclassify the row");
    }
  });
  test(`${locale}: aggregation, negation and unowned policy cannot enter observed-only production`, () => {
    for (const text of [aggregate, negatedProfilingFixtures[locale]]) assert.notEqual(project(text).row.status, "Observed", text);
    assert.notEqual(project(tracking, false).row.status, "Observed");
  });
}
