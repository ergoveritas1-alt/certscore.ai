import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFinancialSignals } from "./signals";
import type { StaticPageResult } from "../snapshot/types";

function buildPage(input: Partial<StaticPageResult> & Pick<StaticPageResult, "pageType" | "pageUrl">): StaticPageResult {
  return {
    blockedByPolicy: false,
    fetchStatus: "ok",
    finalUrl: input.pageUrl,
    forms: input.forms ?? [],
    headers: {},
    html: input.html ?? "",
    language: "en",
    links: input.links ?? [],
    pageType: input.pageType,
    pageUrl: input.pageUrl,
    redirected: false,
    scripts: [],
    statusCode: 200,
    textContent: input.textContent ?? "",
    title: input.title ?? null
  };
}

test("analyzeFinancialSignals captures claim, entity, fee, and high-risk summaries from observable page text", () => {
  const homepage = buildPage({
    pageType: "homepage",
    pageUrl: "https://example.com/",
    title: "Trade smarter",
    html: `
      <section>
        <h1>Earn 12% return APY with AI trading. Get started today.</h1>
        <p>Copy top traders.</p>
        <p>What our users say: five stars on Trustpilot.</p>
      </section>
      <footer>
        <p>Example Markets LLC</p>
        <p>123 Market Street</p>
        <p>support@example.com</p>
        <p>Regulated by Example Authority</p>
      </footer>
    `,
    textContent:
      "Earn 12% return APY with AI trading. Get started today. Copy top traders. What our users say. Example Markets LLC 123 Market Street support@example.com Regulated by Example Authority"
  });
  const aboutPage = buildPage({
    pageType: "about",
    pageUrl: "https://example.com/about",
    title: "About Example Markets",
    html: "<main><h1>About us</h1><p>Operated by Example Markets LLC.</p></main>",
    textContent: "About us. Operated by Example Markets LLC.",
    links: [{ href: "https://example.com/", text: "Home" }]
  });
  const pricingPage = buildPage({
    pageType: "pricing",
    pageUrl: "https://example.com/pricing",
    title: "Pricing",
    html: "<table><tr><th>Fee schedule</th><td>Maker taker commission schedule</td></tr></table>",
    textContent: "Fee schedule maker taker commission schedule.",
    links: [{ href: "https://example.com/", text: "Home" }]
  });

  const result = analyzeFinancialSignals({
    pages: [homepage, aboutPage, pricingPage],
    scanId: "scan-1"
  });

  const keys = new Set(result.signalHits.map((hit) => hit.signalKey));
  assert.equal(result.summary.performanceClaimPresent, true);
  assert.equal(result.summary.claimCtaBlockPresent, true);
  assert.equal(result.summary.testimonialOrReviewBlockNearFinancialClaimPresent, true);
  assert.equal(result.summary.aboutPagePresent, true);
  assert.equal(result.summary.registrationClaimPresent, true);
  assert.equal(result.summary.pricingPagePresent, true);
  assert.equal(result.summary.feeSchedulePresent, true);
  assert.equal(result.summary.aiTradingLanguagePresent, true);
  assert.equal(keys.has("financial.performance_claim_text_present"), true);
  assert.equal(keys.has("entity.legal_entity_name_text_present"), true);
  assert.equal(keys.has("financial.ai_trading_or_automated_trading_language_present"), true);
});
