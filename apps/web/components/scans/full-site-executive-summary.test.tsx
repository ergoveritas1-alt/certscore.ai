import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteAssessmentSummary, FullSiteExecutiveSummary } from "./full-site-executive-summary";
import { deriveCanonicalOverallScoreExplanationForReport } from "../../server/scans/canonical-overall-score";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { buildSitePriorityReview } from "../../lib/scans/full-site-priority-review";
import { buildExecutiveOverview } from "./report-lab/executive-overview-copy";

const score = {version: "test", value: 29, assessedNonEssentialStorage: 9, scoredPages: 10, limitedPages: 0, scope: "Retained evidence", priorityReview: [], sources: []};

test("page and site scores preserve findings without displaying deduction amounts", () => {
  for (const complete of [true, false]) {
    const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ scanCompleted: true, coverageLimited: false,
      runtimeArtifacts: { policyDisclosureSummary: { privacyPolicyPresent: false }, policySurfaceInspection: { coverageStatus: complete ? "complete" : "limited",
        inspectionCompleted: complete, linkDiscoveryCoverageStatus: complete ? "complete" : "limited",
        documentRetrievalCoverageStatus: "insufficient", limitationKeys: complete ? [] : ["inspection_incomplete"],
        observedSurfaceTypes: [], outcome: "no_privacy_policy_observed_complete_coverage", privacyPolicyObserved: false } },
      snapshot: { privacy_policy_present: false } });
    const checklistRows = deriveGdprEprivacyCoverageChecklist({ scanCompleted: true, coverageLimited: false,
      coverageOutcomes, unifiedFindings: [] }).filter(row => row.id === "privacy_notice_availability");
    const explanation = deriveCanonicalOverallScoreExplanationForReport({ scanRecord: { runtimeArtifacts: null },
      checklistRows, unifiedFindings: [] });
    assert.equal(explanation?.score ?? null, complete ? 91 : null);
    assert.equal(explanation?.totalPolicyDeductionPoints ?? 0, complete ? 9 : 0);
    const priorityReview = buildSitePriorityReview(checklistRows, []);
    const homepageVerdict = buildExecutiveOverview({ findings: priorityReview });
    for (const scannedPages of [1, 10]) {
      const html = renderToStaticMarkup(<FullSiteExecutiveSummary pending={false} scannedPages={scannedPages}
        homepageVerdict={homepageVerdict}
        score={{ ...score, priorityReview, value: explanation?.score ?? null, deductions: explanation?.deductions }} />);
      assert.doesNotMatch(html, /privacy-policy-score-deduction|−9 points/);
      const highlights = html.match(/Assessment highlights<\/h3><p[^>]*>(.*?)<\/p>/)?.[1];
      assert.ok(highlights);
      if (complete) assert.match(highlights, /Privacy policy not found/);
      else assert.doesNotMatch(highlights, /Privacy policy not found/);
    }
    const unscored = renderToStaticMarkup(<FullSiteExecutiveSummary pending={false} scannedPages={10}
      score={{ ...score, value: null, deductions: explanation?.deductions }} />);
    assert.doesNotMatch(unscored, /privacy-policy-score-deduction/);
  }
});

test("site highlights preserve the missing-policy finding without changing ranks", () => {
  const priorities = Object.freeze([
    ...Array.from({ length: 4 }, (_, index) => Object.freeze({ id: `issue_${index}`, title: `Issue ${index + 1}` })),
    Object.freeze({ id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability", title: "Privacy policy not found" }),
  ]);
  const summary = buildSiteAssessmentSummary(priorities, 10);
  assert.match(summary, /Privacy policy not found/);
  assert.match(summary, /privacy disclosures/);
  assert.equal(priorities[0]?.id, "issue_0");
});

test("site paragraphs prioritize meaning and action while preserving the lead's qualifications", () => {
  const summary = buildSiteAssessmentSummary([
    { title: "Classified non-essential pre-consent storage", summary: "5 storage items were observed before consent. Direct write-level timing was captured for 2.", correctionSteps: ["Review the classified storage and its consent requirements."] },
    { title: "Decline consent control", summary: "No observable refusal path was retained." },
  ], 10);
  assert.match(summary, /5 storage items were observed before consent/);
  assert.match(summary, /Direct write-level timing was captured for 2/);
  assert.match(summary, /Review the classified storage and its consent requirements/);
  assert.match(summary, /Also review “Decline consent control”/);
  assert.doesNotMatch(summary, /all 10 pages|priority issues across/);
});

test("site score and coverage influence significance without inventing a finding", () => {
  assert.equal(buildSiteAssessmentSummary([], 10, { score: 100, coverage: { state: "complete" } }), "No priority issues were identified in the assessed evidence.");
  const limited = buildSiteAssessmentSummary([], 10, { score: 100, coverage: { state: "limited" } });
  assert.match(limited, /Detailed evidence/);
  assert.doesNotMatch(limited, /all clear|compliant|safe/);
  const poor = buildSiteAssessmentSummary([{ title: "Projected issue", status: "Potential gap" }], 10, { score: 35 });
  assert.match(poor, /high-priority remediation/);
});

test("executive score uses the full-site projection while homepage context remains scoped", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={score} pending={false} scannedPages={10} homepageVerdict="Retained homepage assessment." snapshot={<p>Consent controls</p>} />);
  assert.match(html, /Site score 29 out of 100/);
  assert.match(html, /10 pages scanned/);
  assert.match(html, /Consent controls/);
  assert.match(html, /Assessment highlights/);
  assert.doesNotMatch(html, /Retained homepage assessment|10 assessed/);
  assert.doesNotMatch(html, /benchmark/i);
  assert.doesNotMatch(html, /Diagnostic score|62 out of 100/);
});

test("pending site assessment never borrows a homepage score or claims no issues", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending scannedPages={1} homepageVerdict="Homepage assessment already ready." />);
  assert.match(html, /Page score awaiting scored evidence/);
  assert.match(html, /page score will appear/i);
  assert.doesNotMatch(html, /No priority issues|0 priority issues|out of 100/);
});

test("a completed report waiting for its saved sitewide result does not claim assessment is running", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending loadingSavedResult scannedPages={null} />);
  assert.match(html, /Loading saved assessment/);
  assert.match(html, /sitewide score will appear when the saved result loads/);
  assert.doesNotMatch(html, /Assessment in progress|Waiting for page outcomes|Page evidence is still being assessed/);
});

test("a terminal unavailable score stays unavailable", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={null} pending={false} scannedPages={10} />);
  assert.match(html, /Site-wide scoring is unavailable/);
  assert.doesNotMatch(html, /Assessment in progress/);
});

test("one scanned page shows only the single page assessment", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{...score,scoredPages:1}} pending={false} scannedPages={1} homepageVerdict="Retained single-page verdict." />);
  assert.match(html,/Page score 29 out of 100/);
  assert.match(html,/>Page score</);
  assert.match(html,/Assessment highlights/);
  assert.match(html,/1 page scanned/);
  assert.doesNotMatch(html,/1 page assessed/);
  assert.match(html,/Retained single-page verdict/);
  assert.doesNotMatch(html,/>Site score</);
  assert.doesNotMatch(html,/<h3[^>]*>Site assessment/);
});

test("executive overview does not render a separate assessment coverage note", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={score} pending={false} scannedPages={10} homepageVerdict="Retained homepage assessment." />);
  assert.doesNotMatch(html, /Assessment coverage:/);
});

test("completed clean score omits the redundant scope paragraph", () => {
  const html = renderToStaticMarkup(<FullSiteExecutiveSummary score={{...score,value:100,scoredPages:4}} pending={false} scannedPages={4} />);
  assert.match(html, /Site score 100 out of 100/);
  assert.match(html, /0 priority issues/);
  assert.doesNotMatch(html, /Scope:/);
  assert.doesNotMatch(html, /network requests need classification review/);
  assert.doesNotMatch(html, /does not mean every policy topic was confirmed/);
});
