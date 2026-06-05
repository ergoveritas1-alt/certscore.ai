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
  return {
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
    evidenceRefs: ["Evidence flag: california_privacy_missing_notice_surface"],
    explanation: "Whether retained California evidence supported this row.",
    id,
    label: id,
    limitation: "Retained scanner evidence was incomplete for this row.",
    status,
    statusLabel: status === "review_signal" ? "Review signal" : "Not testable",
    tone: status === "review_signal" ? "review" : "muted"
  };
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
});
