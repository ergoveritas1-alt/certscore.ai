import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CaliforniaPrivacyCoverageChecklistCard } from "./california-privacy-coverage-checklist-card";
import type { CaliforniaPrivacyCoverageChecklistItem } from "../../lib/scans/california-privacy-coverage-checklist";

function makeChecklistItem(
  id: string,
  status: CaliforniaPrivacyCoverageChecklistItem["status"] = "not_testable"
): CaliforniaPrivacyCoverageChecklistItem {
  const assessmentStatus: CaliforniaPrivacyCoverageChecklistItem["assessmentStatus"] =
    status === "potential_gap"
      ? "gap_observed"
      : status === "review_signal"
        ? "review_signal"
        : status === "not_testable"
          ? "needs_evidence"
          : "checked";
  const evidenceState: CaliforniaPrivacyCoverageChecklistItem["evidenceState"] =
    status === "not_testable"
      ? "not_testable"
      : status === "not_observed" || status === "not_applicable"
        ? "not_observed"
        : "observed";
  const statusLabel = {
    not_applicable: "Not applicable",
    not_observed: "Not observed",
    not_testable: "Not testable",
    observed: "Observed",
    potential_gap: "Potential gap",
    review_signal: "Review signal"
  }[status];
  return {
    assessmentStatus,
    criticalEvidence: {
      evidenceFamily: "notice_surface",
      missingOrIncompleteSourceSignals: [
        {
          actual: null,
          expected: "usable California privacy notice surface",
          field: "californiaPrivacyEvidence.noticeSurface",
          source: "scanner",
          whyNeeded: "Retained scanner evidence did not include a usable California privacy notice surface."
        }
      ],
      pipeline: {
        concernPolicyKey: `california_privacy.${id}`,
        projectionStage: "coverage_policy",
        regulatoryReviewArea: "california_ccpa_cpra",
        wc01NormalizedConcernKey: `california_privacy.${id}`,
        ws01EvidenceRole: "observed_runtime_signal"
      },
      projectedFindings: [],
      retainedEvidence: {},
      statusBasis: "This row was not testable from retained scanner evidence."
    },
    evidenceState,
    evidenceRefs: ["Evidence flag: california_privacy_missing_notice_surface"],
    explanation: "Whether retained California evidence supported this row.",
    id,
    label: id,
    limitation: "Retained scanner evidence was incomplete for this row.",
    note: "Retained scanner evidence was incomplete for this row.",
    status,
    statusLabel,
    tone: status === "review_signal" ? "review" : "muted"
  };
}

function assertSummaryCount(html: string, count: number, label: string) {
  assert.match(html, new RegExp(`<span class="font-semibold text-slate-950">${count}</span> ${label}`));
}

test("California checklist does not show a harsh score when every row is not testable", () => {
  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      californiaLens: {
        ratingLabel: "Needs work",
        score: 46,
        summary: "Third-party collection and disclosure posture drives this score.",
        toneClass: "border-rose-200 bg-rose-50 text-rose-800"
      },
      items: [
        makeChecklistItem("Privacy notice availability"),
        makeChecklistItem("Notice at collection")
      ]
    })
  );

  assert.match(html, /Score:.*Not testable/s);
  assert.match(html, /California privacy review was not scored/);
  assertSummaryCount(html, 2, "needs evidence");
  assert.doesNotMatch(html, /Needs work/);
  assert.doesNotMatch(html, /46.*\/100/s);
});

test("California checklist uses row-derived score when retained row evidence is testable", () => {
  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      californiaLens: {
        ratingLabel: "Needs work",
        score: 46,
        summary: "Third-party collection and disclosure posture drives this score.",
        toneClass: "border-rose-200 bg-rose-50 text-rose-800"
      },
      items: [
        makeChecklistItem("Targeted advertising signals", "review_signal"),
        makeChecklistItem("Notice at collection")
      ]
    })
  );

  assert.match(html, /Score:.*30.*\/100/s);
  assert.match(html, /California score is weighted from evidence-gated checklist rows/);
  assert.match(html, /<details class="group\/california-summary rounded-lg border border-slate-200 bg-white">/);
  assert.match(html, /CPRA review summary/);
  assert.doesNotMatch(html, /California CCPA \/ CPRA review summary/);
  assert.doesNotMatch(html, /CPRA \+ CIPA review summary/);
  assert.match(html, /max-w-4xl truncate text-sm/);
  assert.match(html, /Needs work/);
  assertSummaryCount(html, 1, "review");
  assertSummaryCount(html, 1, "needs evidence");
  assert.match(html, />Observed</);
  assert.match(html, />Review signal</);
});

test("California checklist renders debug confidence metadata", () => {
  const item = makeChecklistItem("Targeted advertising signals", "review_signal");
  item.debugConfidence = {
    score: 7,
    improveConfidence: [
      "Resolve adtech vendor purpose and third-party request evidence",
      "Retain display-safe source evidence for this row"
    ]
  };
  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [item]
    })
  );

  assert.match(html, /Confidence: 7/);
  assert.match(html, /Improve confidence: Resolve adtech vendor purpose and third-party request evidence/);
  assert.match(html, /Retain display-safe source evidence for this row/);
});

test("California checklist labels scanner module gaps as coverage missing", () => {
  const item = makeChecklistItem("Do Not Sell or Share availability", "not_testable");
  item.debugConfidence = {
    score: 1,
    improveConfidence: [
      "Run policy-surface coverage for sale/share opt-out evidence",
      "Retain an explicit Do Not Sell/Share or privacy choices path"
    ]
  };
  item.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "do_not_sell_share_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    },
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "do_not_sell_share_availability",
      source: "scanner",
      whyNeeded: "required_source_module_not_run"
    }
  ];

  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [item]
    })
  );

  assert.match(html, /Coverage missing/);
  assert.match(html, /Next coverage step: Run policy-surface coverage for sale\/share opt-out evidence/);
  assert.doesNotMatch(html, /Confidence: 1/);
});

test("California checklist summarizes evaluated and coverage-missing rows", () => {
  const coverageGapItem = makeChecklistItem("Do Not Sell or Share availability", "not_testable");
  coverageGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "do_not_sell_share_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    }
  ];

  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [
        makeChecklistItem("Do Not Sell or Share availability", "potential_gap"),
        makeChecklistItem("Targeted advertising signals", "review_signal"),
        coverageGapItem
      ]
    })
  );

  assert.match(html, /Evaluated rows/);
  assert.match(html, /Coverage missing/);
  assert.match(html, /Review signals/);
  assert.match(html, /Gap rows/);
  assert.match(html, /<div class="text-lg font-semibold leading-none text-slate-950">2<\/div><div class="mt-1 text-\[10px\] font-semibold uppercase tracking-\[0\.12em\]">Evaluated rows<\/div>/);
  assert.match(html, /<div class="text-lg font-semibold leading-none text-slate-950">1<\/div><div class="mt-1 text-\[10px\] font-semibold uppercase tracking-\[0\.12em\]">Coverage missing<\/div>/);
});

test("California checklist does not render suggested follow-up capture guidance", () => {
  const coverageGapItem = makeChecklistItem("Do Not Sell or Share availability", "not_testable");
  coverageGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "do_not_sell_share_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    }
  ];

  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [coverageGapItem]
    })
  );

  assert.doesNotMatch(html, /Suggested follow-up capture/);
  assert.doesNotMatch(html, /policy or full/);
  assert.doesNotMatch(html, /1 row: Do Not Sell or Share availability/);
});

test("California checklist renders GDPR-style gaps, review, checked, and evidence badges", () => {
  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      californiaLens: {
        ratingLabel: "Needs work",
        score: 46,
        toneClass: "border-rose-200 bg-rose-50 text-rose-800"
      },
      items: [
        makeChecklistItem("Do Not Sell or Share availability", "potential_gap"),
        makeChecklistItem("Targeted advertising signals", "review_signal"),
        makeChecklistItem("Privacy notice availability", "observed"),
        makeChecklistItem("Rights methods", "not_observed")
      ]
    })
  );

  assertSummaryCount(html, 1, "gaps");
  assertSummaryCount(html, 1, "review");
  assertSummaryCount(html, 2, "checked");
  assert.match(html, /Gap observed/);
  assert.match(html, /Review signal/);
  assert.match(html, /Checked/);
  assert.match(html, /Not observed/);
  assert.doesNotMatch(html, /aria-label="Applicability unverified"/);
  assert.doesNotMatch(html, /CCPA\/CPRA can depend on revenue, California volume, or selling\/sharing activity/);
});

test("California checklist renders CIPA rows without business-size qualifier", () => {
  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [makeChecklistItem("cipa_sensitive_interaction_recording", "review_signal")]
    })
  );

  assert.doesNotMatch(html, /aria-label="Conduct review"/);
  assert.doesNotMatch(html, /CertScore reports observed CIPA-style signals, not legal applicability/);
  assert.doesNotMatch(html, /Applicability unverified/);
});

test("California checklist avoids visible not-applicable posture badges", () => {
  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [makeChecklistItem("Limit Use", "not_applicable")]
    })
  );

  assertSummaryCount(html, 1, "checked");
  assert.match(html, /Checked/);
  assert.match(html, /Not observed/);
  assert.doesNotMatch(html, />Not applicable</);
});

test("California checklist keeps CIPA overlay internals out of visible row copy", () => {
  const item = makeChecklistItem("targeted_advertising_signals", "review_signal");
  item.criticalEvidence.retainedEvidence.cipaRiskOverlay = {
    confidence: "high",
    directEvidenceObserved: true,
    legalConclusion: false,
    overlayTags: ["pre_consent_tracking", "cross_domain_or_interaction_event_sharing"],
    thirdPartyReceiptObserved: true
  };

  const html = renderToStaticMarkup(
    createElement(CaliforniaPrivacyCoverageChecklistCard, {
      items: [item]
    })
  );

  assert.doesNotMatch(html, /CIPA overlay:/);
  assert.doesNotMatch(html, /cross domain or interaction event sharing/);
  assert.doesNotMatch(html, /direct retained evidence/);
  assert.doesNotMatch(html, /CertScore does not make legal conclusions/);
  assert.doesNotMatch(html, new RegExp(`CIPA ${"viol"}ation|illegal ${"wire"}tapping`, "i"));
});
