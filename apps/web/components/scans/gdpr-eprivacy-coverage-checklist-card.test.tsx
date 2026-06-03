import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GdprEprivacyCoverageChecklistCard } from "./gdpr-eprivacy-coverage-checklist-card";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

function makeSessionReplayItem(): GdprEprivacyCoverageChecklistItem {
  return {
    assessmentStatus: "review_signal",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_eprivacy_coverage.session_replay_fingerprinting_review.review_signal",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "gdpr_eprivacy.coverage.session_replay_fingerprinting_review",
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [
        {
          id: "session_replay_observed",
          label: "Session replay / behavioral analytics observed",
          severity: "medium"
        }
      ],
      retainedEvidence: {
        sessionReplayEvidence: {
          preConsentObserved: false,
          vendors: ["Microsoft Clarity", "Hotjar", "Contentsquare"]
        },
        status: "Review signal"
      },
      statusBasis: "Canonical session replay evidence was retained without pre-consent timing."
    },
    evidenceRefs: [
      "Runtime vendor: Microsoft Clarity",
      "Runtime vendor: Hotjar",
      "Runtime vendor: Contentsquare"
    ],
    evidenceState: "observed",
    explanation:
      "CertScore observed session replay or behavioral analytics vendors not observed pre-consent in retained evidence, including Microsoft Clarity, Hotjar, and Contentsquare. Because these tools can capture user interaction behavior, review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.",
    id: "session_replay_fingerprinting_review",
    label: "Session replay / behavioral analytics observed",
    note:
      "CertScore observed session replay or behavioral analytics vendors not observed pre-consent in retained evidence, including Microsoft Clarity, Hotjar, and Contentsquare. Because these tools can capture user interaction behavior, review consent timing, disclosure, masking/exclusion settings, sensitive-page coverage, and withdrawal controls.",
    status: "Review signal",
    tone: "review"
  };
}

function makeChecklistItem(overrides: Partial<GdprEprivacyCoverageChecklistItem>): GdprEprivacyCoverageChecklistItem {
  const id = overrides.id ?? "accessibility_consent_controls";
  const label = overrides.label ?? "Accessibility of consent controls";
  const status = overrides.status ?? "Not observed";
  const assessmentStatus = overrides.assessmentStatus ?? "checked";
  return {
    assessmentStatus,
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy_coverage.${id}.${assessmentStatus}`,
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${id}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: {
        status,
        ...(overrides.criticalEvidence?.retainedEvidence ?? {})
      },
      statusBasis: "Test row basis",
      ...(overrides.criticalEvidence ?? {})
    },
    evidenceRefs: [],
    evidenceState: overrides.evidenceState ?? "not_observed",
    explanation: overrides.explanation ?? "Test row explanation.",
    id,
    label,
    note: overrides.note ?? "Test row note.",
    status,
    tone: overrides.tone ?? "neutral",
    ...overrides
  };
}

test("GdprEprivacyCoverageChecklistCard renders specific session replay timing copy", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [makeSessionReplayItem()]
    })
  );

  assert.match(html, /not observed pre-consent in retained evidence/i);
  assert.match(html, /Microsoft Clarity, Hotjar, and Contentsquare/);
  assert.match(html, />Observed</);
  assert.match(html, />Review signal</);
  assert.doesNotMatch(html, /signals require review from the retained runtime evidence/i);
});

test("GdprEprivacyCoverageChecklistCard omits consent-control accessibility from summary when checked", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "checked",
          evidenceState: "not_observed",
          id: "accessibility_consent_controls",
          status: "Not observed"
        })
      ]
    })
  );

  assert.match(html, /cross-border analytics\/tracking endpoint context/i);
  assert.doesNotMatch(html, /and accessibility of consent controls/i);
  assert.doesNotMatch(html, /and consent-control accessibility/i);
});

test("GdprEprivacyCoverageChecklistCard mentions consent-control accessibility only when reviewable", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "accessibility_consent_controls",
          status: "Review signal",
          tone: "review"
        })
      ]
    })
  );

  assert.match(html, /consent-control accessibility/i);
});

test("GdprEprivacyCoverageChecklistCard uses persistence wording without reduction metric", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "post_reject_tracking_reduction",
          label: "Post-reject tracking reduction",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Non-essential tracking was still observed after the recorded reject action/i);
  assert.doesNotMatch(html, /did not materially decrease/i);
});

test("GdprEprivacyCoverageChecklistCard keeps generic cross-border asset hosts out of lead copy", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          criticalEvidence: {
            missingOrIncompleteSourceSignals: [],
            pipeline: {
              concernPolicyKey: "gdpr_eprivacy_coverage.cross_border_endpoint_review.gap_observed",
              projectionStage: "unified_finding",
              wc01NormalizedConcernKey: "gdpr_eprivacy.coverage.cross_border_endpoint_review",
              ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
            },
            projectedFindings: [],
            retainedEvidence: {
              evidenceHighlights: [
                "Transfer-relevant analytics / behavioral tracking endpoints were observed for Google Tag Manager, Google Analytics, and Microsoft Clarity. Additional third-party asset endpoints were retained as supporting runtime context."
              ],
              evidenceRefs: ["cdnjs.cloudflare.com", "fonts.gstatic.com"],
              status: "Gap observed"
            },
            statusBasis: "Canonical cross-border endpoint finding projected."
          },
          evidenceRefs: ["cdnjs.cloudflare.com", "fonts.gstatic.com"],
          evidenceState: "observed",
          id: "cross_border_endpoint_review",
          label: "Cross-border analytics / tracking endpoint review",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Google Tag Manager, Google Analytics, and Microsoft Clarity/i);
  assert.match(html, /Additional third-party asset endpoints were retained as supporting runtime context/i);
});
