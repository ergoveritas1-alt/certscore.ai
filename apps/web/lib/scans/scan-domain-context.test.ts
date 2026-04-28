import assert from "node:assert/strict";
import test from "node:test";

import { buildScanDomainContext } from "./scan-domain-context";

test("buildScanDomainContext extracts industry_primary and monetization signals", () => {
  const ctx = buildScanDomainContext({
    normalized_output_json: {
      industry_primary: "media",
      monetization_signals: {
        investor_or_securities_promotion: false
      }
    }
  });

  assert.equal(ctx.domainIndustryPrimary, "media");
  assert.equal(ctx.investorOrSecuritiesPromotion, false);
});

test("buildScanDomainContext returns nulls when macroEnrichment is absent", () => {
  const ctx = buildScanDomainContext(null);

  assert.equal(ctx.domainIndustryPrimary, null);
  assert.equal(ctx.investorOrSecuritiesPromotion, null);
});

test("buildScanDomainContext returns nulls when normalized_output_json is missing", () => {
  const ctx = buildScanDomainContext({});

  assert.equal(ctx.domainIndustryPrimary, null);
  assert.equal(ctx.investorOrSecuritiesPromotion, null);
});
