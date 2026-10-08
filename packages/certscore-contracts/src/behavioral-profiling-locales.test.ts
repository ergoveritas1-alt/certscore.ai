import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_GDPR_TRANSPARENCY_LOCALES } from "./supported-languages";
import { behavioralProfilingFixtures, negatedProfilingFixtures } from "./test-fixtures/behavioral-profiling";
import { classifyGdprTransparencyTopics, findBehavioralProfilingDisclosure } from "./gdpr-transparency-topic-classifier";
import { article13DisclosureRejectReason } from "./article13-disclosure-rejection";

const topic = "automated_decision_making_or_profiling";
test("behavioral profiling fixtures cover every supported locale", () => {
  assert.deepEqual(behavioralProfilingFixtures.map(row => row[0]).sort(), [...SUPPORTED_GDPR_TRANSPARENCY_LOCALES].sort());
});
for (const [locale, tracking, newsletter, aggregateAnalytics] of behavioralProfilingFixtures) {
  test(`${locale}: individual interests and engagement tailoring survive all shared gates`, () => {
    for (const [text, basis] of [[tracking, "individual_interest_tracking"], [newsletter, "newsletter_engagement_personalization"]]) {
      assert.equal(findBehavioralProfilingDisclosure(text!, [locale])?.basis, basis, text);
      const matches = classifyGdprTransparencyTopics({section: {heading: "Privacy policy", body: text!}, localeHints: [locale]}).matches;
      const match = matches.find(row => row.topic === topic);
      assert.equal(match?.matchedLocale, locale, text);
      assert.equal(match?.matchStrength, "equivalent", text);
      assert.equal(match?.variant, "behavioral_profiling_disclosure_v2", text);
      assert.ok(match!.evidenceExcerpt.includes(text!.normalize("NFKC").replace(/[‘’]/g, "\'")), "retain the actual localized practice clause");
      for (const mode of ["scan_core", "multilingual_classifier", "retained_report"] as const) {
        assert.equal(article13DisclosureRejectReason(match!.evidenceExcerpt, topic, {mode}), null, `${locale}/${mode}`);
      }
    }
  });
  test(`${locale}: aggregate newsletter analytics do not establish profiling`, () => {
    assert.equal(findBehavioralProfilingDisclosure(aggregateAnalytics), null);
    assert.notEqual(article13DisclosureRejectReason(aggregateAnalytics, topic), null);
    assert.ok(!classifyGdprTransparencyTopics({section: {heading: "Privacy policy", body: aggregateAnalytics}, localeHints: [locale]}).matches.some(row => row.topic === topic));
  });
}

test("localized negation guards apply to both practices and never borrow another practice's evidence", () => {
  for (const [locale, negated] of Object.entries(negatedProfilingFixtures)) {
    assert.equal(findBehavioralProfilingDisclosure(negated), null, `${locale}: ${negated}`);
    assert.notEqual(article13DisclosureRejectReason(negated, topic), null, locale);
    assert.ok(!classifyGdprTransparencyTopics({section: {heading: "Privacy policy", body: negated}})
      .matches.some(row => row.variant?.startsWith("behavioral_profiling_disclosure")), locale);
  }
  const mixed = "Wir verwenden Cookies, um Ihre Interessen nicht zu analysieren. " + "Wir analysieren Ihre Klicks in unserem Newsletter, um Inhalte auf Ihre Interessen abzustimmen.";
  const matches = classifyGdprTransparencyTopics({section: {heading: "Privacy policy", body: mixed}, localeHints: ["de"]}).matches.filter(row => row.topic === topic);
  assert.equal(matches.length, 1, "the separate affirmative newsletter clause must remain projectable");
  assert.match(matches[0]!.matchedTerm, /newsletter_engagement_personalization/);
  assert.ok(matches.every(row => !row.matchedTerm.includes("individual_interest_tracking")));
});

test("rights, name substitution, distant unrelated interests and negated English clauses stay insufficient", () => {
  for (const text of [
    "We personalize the newsletter with your first name.",
    "You may object to profiling for direct marketing.",
    "We use cookies to track pages. " + "Service information. ".repeat(30) + "Your browsing behavior and interests are your own.",
    "We use cookies to track which of our pages are visited and not of interest to you.",
    "Our newsletter contains tracking pixels recording links with analysis. We never adapt topics and offers to match your interests.",
    "No utilizamos cookies para analizar sus intereses.",
    "Nous utilisons des cookies pour ne pas analyser vos centres d’intérêt.",
    "当社はCookieを使用してお客様の興味を分析しません。",
    "我们使用Cookie但不会分析您的兴趣。",
    "نستخدم ملفات تعريف الارتباط لا لتحليل اهتماماتك.",
  ]) {
    assert.equal(findBehavioralProfilingDisclosure(text), null, text);
    assert.notEqual(article13DisclosureRejectReason(text, topic), null, text);
  }
});

test("traditional Chinese, Serbian Latin, British English and German page-interest wording retain the same threshold", () => {
  for (const text of [
    "我們使用Cookie分析您的興趣。",
    "我們分析您在我們的電子報中的點擊，以根據您的興趣調整內容。",
    "Koristimo kolačiće za analizu vaših interesovanja.",
    "Analiziramo vaše klikove u našem biltenu kako bismo prilagodili sadržaj vašim interesovanjima.",
    "We use cookies to analyse your browsing behaviour and interests.",
    "We analyse your newsletter clicks to adapt content to your interests.",
    "Wir verwenden Cookies, um zu verfolgen, welche unserer Seiten besucht werden und für Sie von Interesse sind.",
  ]) {
    assert.ok(findBehavioralProfilingDisclosure(text), text);
    assert.equal(article13DisclosureRejectReason(text, topic), null, text);
  }
  for (const text of ["我們使用Cookie但不會分析您的興趣。", "Ne koristimo kolačiće za analizu vaših interesovanja."]) {
    assert.equal(findBehavioralProfilingDisclosure(text), null, text);
  }
});
