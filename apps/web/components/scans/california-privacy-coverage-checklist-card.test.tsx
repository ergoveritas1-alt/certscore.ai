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

test("California checklist keeps lens score when retained row evidence is testable", () => {
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

  assert.match(html, /Score:.*46.*\/100/s);
  assert.match(html, /Needs work/);
  assertSummaryCount(html, 1, "review");
  assertSummaryCount(html, 1, "needs evidence");
  assert.match(html, />Observed</);
  assert.match(html, />Review signal</);
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

test("California checklist renders CIPA overlays only from policy-retained evidence", () => {
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

  assert.match(html, /CIPA overlay: pre consent tracking, cross domain or interaction event sharing; direct retained evidence; high confidence/);
  assert.match(html, /CertScore does not make legal conclusions/);
  assert.doesNotMatch(html, new RegExp(`CIPA ${"viol"}ation|illegal ${"wire"}tapping`, "i"));
});
