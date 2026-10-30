import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CALIFORNIA_REVIEW_FAMILIES,
  californiaCoverageSchema,
  deriveConsentControlAssessment,
  type CaliforniaPrivacyReview,
  type CaliforniaReviewCoverage,
} from "@certscore/contracts";
import type { CaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { californiaAssessmentPresentation } from "../../lib/scans/california-assessment-presentation";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { buildSitePriorityReview } from "../../lib/scans/full-site-priority-review";
import { REGULATORY_PREVIEW_FINDINGS } from "../../app/dev-fixtures/regulatory-review/preview-data";
import { FullSiteExecutiveSummary } from "./full-site-executive-summary";
import { SitePriorityReview } from "./site-priority-review";
import { CaliforniaCoverageDetails } from "./regulatory-review-focus";

type Family = typeof CALIFORNIA_REVIEW_FAMILIES[number];
type Version = 1 | 2 | 3 | 4;
type FamilyPatch = { status?: "review" | "unknown"; assessmentState?: "partial" | "limited" };
type CoverageCase = {
  name: string;
  coverage: CaliforniaReviewCoverage | null | undefined;
  detailLabel?: string;
  reason?: string;
};

// Six-family, schema-validated historical/current coverage. Only the explicit
// empty-family compatibility case below bypasses the contract at the UI boundary.
function coverageFixture(version: Version, family?: Family, patch: FamilyPatch = {}) {
  const reason = `Retained ${family ?? "privacy_notice"} evidence needs interpretation.`;
  return californiaCoverageSchema.parse({
    contractVersion: `certscore.california-review-coverage.v${version}`,
    postureBasis: "assuming_ccpa_applies",
    runtimeCoverage: "limited",
    policyStatement: "not_identified",
    sourceDocuments: [{ evidenceRef: "policy", url: "https://report-fixture.test/privacy", sha256: "a".repeat(64), complete: true }],
    topics: [{ topic: "categories", evidenceRef: "policy", excerpt: "Categories of personal information include contact details." }],
    scoreReady: false,
    ...(version >= 2 ? { captureCoverage: { policyTextComplete: true, choiceInventoryComplete: false, collectionInventoryComplete: true } } : {}),
    families: CALIFORNIA_REVIEW_FAMILIES.map(id => ({
      id, status: "observed", reason: id === family ? reason : "Retained evidence assessed.", evidenceRefs: ["policy"],
      ...(version === 4 ? { assessmentState: "completed", followUp: "none" } : {}),
      ...(id === family ? {
        ...patch,
        ...(version === 4 ? { followUp: patch.assessmentState === "limited" ? "capture" : "interpretation" } : {}),
      } : {}),
    })),
  });
}

const cases: CoverageCase[] = [
  { name: "coverage omitted", coverage: undefined },
  { name: "coverage null", coverage: null },
  { name: "empty legacy family payload", coverage: { families: [] } as unknown as CaliforniaReviewCoverage },
];
for (const family of CALIFORNIA_REVIEW_FAMILIES) {
  for (const version of [1, 2, 3] as const) for (const status of ["review", "unknown"] as const) {
    cases.push({ name: `v${version} ${family} ${status}`, coverage: coverageFixture(version, family, { status }),
      detailLabel: status === "review" ? "Review" : "Limited", reason: `Retained ${family} evidence needs interpretation.` });
  }
  // A positive observed status must not override a partial/limited assessment.
  for (const status of ["review", "observed"] as const) for (const assessmentState of ["partial", "limited"] as const) {
    cases.push({ name: `v4 ${family} ${status}/${assessmentState}`,
      coverage: coverageFixture(4, family, { ...(status === "review" ? { status } : {}), assessmentState }),
      detailLabel: assessmentState === "partial" ? "Partly assessed · wording needs interpretation" : "Limited capture · capture incomplete",
      reason: `Retained ${family} evidence needs interpretation.` });
  }
}

function scoreFixture(coverage: CoverageCase["coverage"], value: number | null = 86): CaliforniaRegulatoryScore {
  return { policyVersion: "california-regulatory-posture.v9", score: value, scope: "starting_page", coverage: "limited",
    assessmentSourceHash: "a".repeat(64), deductions: [], ...(coverage ? { reviewCoverage: coverage } : {}) };
}

function assessmentFixture(coverage: CoverageCase["coverage"]) {
  // These components consume only reviewCoverage from the persisted assessment.
  return coverage ? { reviewCoverage: coverage } as CaliforniaPrivacyReview : null;
}

for (const scenario of cases) test(`completed report headings: ${scenario.name}`, () => {
  const before = structuredClone(scenario.coverage);
  assert.equal(californiaAssessmentPresentation(scenario.coverage).incomplete, true);
  for (const value of [86, null]) for (const reviewFocus of ["ccpa_cpra", "gdpr_eprivacy"] as const) for (const scannedPages of [1, 4]) {
    const californiaScore = scoreFixture(scenario.coverage, value);
    const scoreBefore = structuredClone(californiaScore);
    const executive = renderToStaticMarkup(<FullSiteExecutiveSummary reviewFocus={reviewFocus} pending={false}
      scannedPages={scannedPages} statusLabel="Completed" californiaScore={californiaScore}
      score={{ value: 82, scoredPages: scannedPages, priorityReview: [] }} />);
    const priorities = renderToStaticMarkup(<SitePriorityReview reviewFocus={reviewFocus} pending={false} sitewideAvailable
      scannedPages={scannedPages} findings={[]} californiaAssessment={assessmentFixture(scenario.coverage)} />);
    for (const html of [executive, priorities]) {
      assert.doesNotMatch(html, /assessment\s+(?:is\s+)?incomplete|unresolved checks may still contain issues/i);
      assert.doesNotMatch(html, /Assessment in progress|Loading saved assessment|Assessment unavailable/);
      if (reviewFocus === "ccpa_cpra") {
        assert.match(html, /California privacy review/);
        assert.match(html, /href="#evidence"[^>]*>Detailed evidence<\/a>/);
        assert.doesNotMatch(html, /0 CCPA\/CPRA issues|No CCPA\/CPRA priority issues|>0 issues</);
      } else {
        assert.match(html, /No GDPR\/ePrivacy priority issues were identified in the assessed evidence/);
        assert.doesNotMatch(html, /California privacy review|CCPA\/CPRA/);
      }
    }
    if (reviewFocus === "ccpa_cpra" && value === null) {
      assert.match(executive, /California score unavailable for this scan/);
      assert.doesNotMatch(executive, /out of 100/);
    } else assert.match(executive, reviewFocus === "ccpa_cpra" ? /California score 86 out of 100/ : /(?:Site score|Score) 82 out of 100/);
    assert.match(executive, new RegExp(`${scannedPages} ${scannedPages === 1 ? "page" : "pages"} scanned`));
    assert.deepEqual(californiaScore, scoreBefore);
  }
  if (scenario.coverage && scenario.detailLabel) {
    const details = renderToStaticMarkup(<CaliforniaCoverageDetails coverage={scenario.coverage} />);
    assert.ok(details.includes(scenario.detailLabel));
    assert.ok(details.includes(scenario.reason!));
    assert.match(details, /Categories of personal information include contact details/);
    assert.equal((details.match(/<dt /g) ?? []).length, 6);
  }
  assert.deepEqual(scenario.coverage, before, "Rendering must not repair or promote coverage or retained evidence.");
});

for (const version of [1, 2, 3, 4] as const) test(`completed family assessments retain qualified empty results for coverage v${version}`, () => {
  const coverage = coverageFixture(version);
  const before = structuredClone(coverage);
  assert.equal(californiaAssessmentPresentation(coverage).incomplete, false);
  for (const reviewFocus of ["ccpa_cpra", "gdpr_eprivacy"] as const) {
    const executive = renderToStaticMarkup(<FullSiteExecutiveSummary reviewFocus={reviewFocus} pending={false} scannedPages={1}
      californiaScore={scoreFixture(coverage)} score={{ value: 82, scoredPages: 1, priorityReview: [] }} />);
    const priorities = renderToStaticMarkup(<SitePriorityReview reviewFocus={reviewFocus} pending={false} sitewideAvailable
      scannedPages={1} findings={[]} californiaAssessment={assessmentFixture(coverage)} />);
    for (const html of [executive, priorities]) {
      assert.doesNotMatch(html, /assessment\s+(?:is\s+)?incomplete/i);
      assert.match(html, reviewFocus === "ccpa_cpra" ? /No CCPA\/CPRA priority issues were identified in the assessed evidence/ : /No GDPR\/ePrivacy priority issues were identified in the assessed evidence/);
    }
  }
  assert.deepEqual(coverage, before);
});

test("projected EU and California findings survive partial coverage without an incomplete headline", () => {
  const coverage = coverageFixture(4, "privacy_notice", { status: "review", assessmentState: "partial" });
  const findings = [
    REGULATORY_PREVIEW_FINDINGS.find(row => row.id.endsWith("post_reject_tracking_reduction"))!,
    REGULATORY_PREVIEW_FINDINGS.find(row => row.id === "california_privacy_choice_not_observed")!,
  ];
  const before = structuredClone(findings);
  for (const [index, reviewFocus] of ["gdpr_eprivacy", "ccpa_cpra"].entries()) {
    assert.ok(reviewFocus === "gdpr_eprivacy" || reviewFocus === "ccpa_cpra");
    const executive = renderToStaticMarkup(<FullSiteExecutiveSummary reviewFocus={reviewFocus} pending={false} scannedPages={1}
      californiaScore={scoreFixture(coverage)} score={{ value: 82, scoredPages: 1, priorityReview: findings }} />);
    const priorities = renderToStaticMarkup(<SitePriorityReview reviewFocus={reviewFocus} pending={false} sitewideAvailable
      scannedPages={1} findings={findings} californiaAssessment={assessmentFixture(coverage)} />);
    assert.match(executive, /1 top issue/);
    assert.ok(priorities.includes(findings[index]!.title));
    assert.ok(priorities.includes(`sitewide-${findings[index]!.id}`));
    for (const html of [executive, priorities]) assert.doesNotMatch(html, /assessment\s+(?:is\s+)?incomplete|No (?:CCPA\/CPRA|GDPR\/ePrivacy) priority issues/i);
  }
  assert.deepEqual(findings, before);
});

test("missing scores and pending or saved-result loading remain distinct in both report tabs", () => {
  for (const reviewFocus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    for (const state of ["pending", "saved", "unavailable"] as const) {
      const executive = renderToStaticMarkup(<FullSiteExecutiveSummary reviewFocus={reviewFocus}
        pending={state !== "unavailable"} loadingSavedResult={state === "saved"} scannedPages={4}
        californiaScore={null} score={null} />);
      assert.match(executive, state === "pending" ? /Assessment in progress/ : state === "saved" ? /Loading saved assessment/ : /Assessment unavailable/);
      assert.doesNotMatch(executive, /assessment\s+(?:is\s+)?incomplete|out of 100|0 (?:top|priority) issues|No (?:CCPA\/CPRA|GDPR\/ePrivacy) priority issues/i);
      if (state !== "unavailable") assert.doesNotMatch(executive, /score unavailable|scoring.*unavailable/i);
    }
  }
});

test("completed EU reports retain incomplete consent proof in the canonical detailed checklist", () => {
  const assessment = deriveConsentControlAssessment({ scan: { scanId: "completed-report-fixture", finalUrl: "https://report-fixture.test/" } });
  const before = structuredClone(assessment);
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ scanCompleted: true, coverageLimited: false,
    runtimeArtifacts: { consentControlAssessment: assessment } });
  const rows = deriveGdprEprivacyCoverageChecklist({ scanCompleted: true, coverageLimited: false, coverageOutcomes: outcomes, unifiedFindings: [] });
  const reject = rows.find(row => row.id === "reject_all_path_availability")!;
  assert.equal(reject.status, "Not testable");
  assert.equal(reject.evidenceState, "not_testable");
  assert.match(reject.limitation ?? "", /assessment is incomplete.*reject or equivalent refusal control availability cannot be determined/i);
  const findings = buildSitePriorityReview(rows, []);
  const executive = renderToStaticMarkup(<FullSiteExecutiveSummary reviewFocus="gdpr_eprivacy" pending={false} scannedPages={1}
    score={{ value: 82, scoredPages: 1, priorityReview: findings }} />);
  assert.doesNotMatch(executive, /assessment\s+(?:is\s+)?incomplete/i);
  assert.deepEqual(assessment, before);
  assert.equal(reject.evidenceState, "not_testable", "Executive rendering cannot turn unknown proof into a pass.");
});
