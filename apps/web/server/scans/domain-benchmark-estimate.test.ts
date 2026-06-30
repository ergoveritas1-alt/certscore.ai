import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDomainBenchmarkEstimateFromMacroEnrichment,
  getDomainBenchmarkEstimateOverride,
  shouldPreferMacroBenchmarkEstimate
} from "./domain-benchmark-estimate";

test("buildDomainBenchmarkEstimateFromMacroEnrichment maps ABC-style media publishers", () => {
  const estimate = buildDomainBenchmarkEstimateFromMacroEnrichment({
    normalized_output_json: {
      business_model: ["ads", "subscription"],
      company_name: "ABC Network",
      confidence: 0.78,
      industry_primary: "media",
      site_type: "publisher"
    }
  });

  assert.equal(estimate?.industry, "Media / publisher / streaming & news");
  assert.equal(estimate?.confidence, "high");
  assert.equal(estimate?.estimatedRankLabel, "Large media publisher");
  assert.equal(estimate?.expectedThirdPartyRequests, 55);
  assert.match(estimate?.rationale ?? "", /ABC Network/);
});

test("getDomainBenchmarkEstimateOverride classifies CertScore as compliance software", () => {
  const estimate = getDomainBenchmarkEstimateOverride("certscore.ai");

  assert.equal(estimate?.industry, "Compliance software / privacy and accessibility risk analytics");
  assert.equal(estimate?.confidence, "high");
  assert.doesNotMatch(estimate?.industry ?? "", /fintech|credit/i);
});

test("shouldPreferMacroBenchmarkEstimate replaces generic domain-only estimates", () => {
  assert.equal(
    shouldPreferMacroBenchmarkEstimate({
      currentEstimate: {
        confidence: "medium",
        estimatedRankLabel: "Top 1M",
        expectedCookiesBeforeConsent: 2,
        expectedOverallScore: 62,
        expectedThirdPartyRequests: 18,
        industry: "General web / placeholder or brand landing (unknown)",
        rationale: "Domain is generic and ambiguous."
      },
      macroEstimate: {
        confidence: "high",
        estimatedRankLabel: "Large media publisher",
        expectedCookiesBeforeConsent: 4,
        expectedOverallScore: 70,
        expectedThirdPartyRequests: 55,
        industry: "Media / publisher / streaming & news",
        rationale: "Matched scan macro enrichment for ABC Network: media, publisher."
      }
    }),
    true
  );
});
