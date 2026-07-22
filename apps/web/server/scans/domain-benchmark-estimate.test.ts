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

test("getDomainBenchmarkEstimateOverride keeps daily.co.jp separate from the Daily.co brand", () => {
  for (const hostname of ["daily.co.jp", "www.daily.co.jp", "i.daily.co.jp"]) {
    const estimate = getDomainBenchmarkEstimateOverride(hostname);
    assert.equal(estimate?.industry, "Media / Japanese sports-news publisher", hostname);
    assert.equal(estimate?.confidence, "high", hostname);
    assert.doesNotMatch(`${estimate?.industry} ${estimate?.rationale}`, /video conferencing|daily\.co brand match/i, hostname);
  }
  assert.equal(getDomainBenchmarkEstimateOverride("daily.co"), null);
  assert.equal(getDomainBenchmarkEstimateOverride("notdaily.co.jp"), null);
});

test("getDomainBenchmarkEstimateOverride classifies IMOU as smart-home security electronics", () => {
  for (const hostname of ["imoulife.com", "www.imoulife.com", "imou.com", "www.imou.com"]) {
    const estimate = getDomainBenchmarkEstimateOverride(hostname);
    assert.equal(estimate?.industry, "Consumer electronics / smart-home security", hostname);
    assert.equal(estimate?.confidence, "high", hostname);
    assert.doesNotMatch(`${estimate?.industry} ${estimate?.rationale}`, /health|wellness/i, hostname);
  }
  assert.equal(getDomainBenchmarkEstimateOverride("notimou.com"), null);
});

test("getDomainBenchmarkEstimateOverride keeps Aruba S.p.A. out of travel benchmarks", () => {
  for (const hostname of ["aruba.it", "www.aruba.it", "hosting.aruba.it"]) {
    const estimate = getDomainBenchmarkEstimateOverride(hostname);
    assert.equal(estimate?.industry, "Technology / hosting, cloud, PEC and connectivity", hostname);
    assert.equal(estimate?.confidence, "high", hostname);
    assert.doesNotMatch(`${estimate?.industry} ${estimate?.rationale}`, /travel|hospitality|airline|hotel/i, hostname);
  }
  assert.equal(getDomainBenchmarkEstimateOverride("aruba.com"), null);
});

test("shouldPreferMacroBenchmarkEstimate replaces generic domain-only estimates", () => {
  assert.equal(
    shouldPreferMacroBenchmarkEstimate({
      currentEstimate: {
        confidence: "medium",
        estimatedRankLabel: "Top 1M",
        expectedCookiesBeforeConsent: 2,
        expectedThirdPartyRequests: 18,
        industry: "General web / placeholder or brand landing (unknown)",
        rationale: "Domain is generic and ambiguous."
      },
      macroEstimate: {
        confidence: "high",
        estimatedRankLabel: "Large media publisher",
        expectedCookiesBeforeConsent: 4,
        expectedThirdPartyRequests: 55,
        industry: "Media / publisher / streaming & news",
        rationale: "Matched scan macro enrichment for ABC Network: media, publisher."
      }
    }),
    true
  );
});
