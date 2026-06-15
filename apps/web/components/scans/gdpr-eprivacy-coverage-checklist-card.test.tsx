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
    subchecks: [
      {
        assessmentStatus: "gap_observed",
        evidenceRefs: ["https://www.clarity.ms/tag/example"],
        evidenceState: "observed",
        id: "session_replay_before_consent",
        label: "Before consent",
        note: "Session replay collection was retained before a recorded consent action.",
        status: "Gap observed"
      },
      {
        assessmentStatus: "coverage_limitation",
        evidenceRefs: [],
        evidenceState: "not_testable",
        id: "session_replay_disclosure_alignment",
        label: "Disclosure alignment",
        note: "Disclosure comparison evidence was not available for this scan context.",
        status: "Not testable"
      }
    ],
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
  assert.match(html, /<details class="group\/gdpr-summary rounded-lg border border-slate-200 bg-white">/);
  assert.match(html, /GDPR \/ ePrivacy review summary/);
  assert.match(html, /max-w-4xl truncate text-sm/);
  assert.match(html, /Microsoft Clarity, Hotjar, and Contentsquare/);
  assert.match(html, />Before consent</);
  assert.match(html, />Disclosure alignment</);
  assert.match(html, /Session replay collection was retained before a recorded consent action/);
  assert.match(html, />Observed</);
  assert.match(html, />Observed session replay</);
  assert.doesNotMatch(html, /aria-label="Jurisdiction unverified"/);
  assert.doesNotMatch(html, /GDPR\/ePrivacy can depend on EU\/EEA presence, targeting, or monitoring/);
  assert.doesNotMatch(html, /signals require review from the retained runtime evidence/i);
});

test("GdprEprivacyCoverageChecklistCard renders debug confidence metadata", () => {
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          debugConfidence: {
            score: 7,
            improveConfidence: [
              "Retain request timing relative to consent state",
              "Resolve vendor and purpose for third-party endpoints"
            ]
          },
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          status: "Gap observed",
          tone: "warning"
        })
      ]
    })
  );

  assert.match(html, /Confidence: 7/);
  assert.match(html, /Improve confidence: Retain request timing relative to consent state/);
  assert.match(html, /Resolve vendor and purpose for third-party endpoints/);
});

test("GdprEprivacyCoverageChecklistCard labels scanner module gaps as coverage missing", () => {
  const item = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    debugConfidence: {
      score: 1,
      improveConfidence: [
        "Run policy-surface coverage for policy/runtime vendor comparison",
        "Fetch policy surfaces with vendor mentions"
      ]
    },
    evidenceState: "not_testable",
    id: "policy_runtime_vendor_alignment_review",
    label: "Policy/runtime vendor alignment",
    status: "Not testable",
    tone: "muted"
  });
  item.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "policy_runtime_vendor_alignment_review",
      source: "scanner",
      whyNeeded: "Policy-surface scanner did not run, so policy/runtime mismatch findings are out of scope."
    },
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "policy_runtime_vendor_alignment_review",
      source: "scanner",
      whyNeeded: "required_source_module_not_run"
    }
  ];
  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [item]
    })
  );

  assert.match(html, /Coverage missing/);
  assert.match(html, /Next coverage step: Run policy-surface coverage for policy\/runtime vendor comparison/);
  assert.doesNotMatch(html, /Confidence: 1/);
});

test("GdprEprivacyCoverageChecklistCard summarizes evaluated and coverage-missing rows", () => {
  const coverageGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "cookie_notice_availability",
    label: "Cookie notice availability",
    status: "Not testable",
    tone: "muted"
  });
  coverageGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "cookie_notice_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    }
  ];

  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [
        makeChecklistItem({
          assessmentStatus: "gap_observed",
          evidenceState: "observed",
          id: "pre_consent_third_party_tracking",
          label: "Pre-consent third-party tracking",
          status: "Gap observed",
          tone: "warning"
        }),
        makeChecklistItem({
          assessmentStatus: "review_signal",
          evidenceState: "observed",
          id: "cross_border_endpoint_review",
          label: "Cross-border endpoint review",
          status: "Review signal",
          tone: "review"
        }),
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

test("GdprEprivacyCoverageChecklistCard does not render suggested follow-up capture guidance", () => {
  const policyGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "cookie_notice_availability",
    label: "Cookie notice availability",
    status: "Not testable",
    tone: "muted"
  });
  policyGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "cookie_notice_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete policySurfaceScanner coverage."
    }
  ];

  const consentGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "reject_all_path_availability",
    label: "Decline / reject option availability",
    status: "Not testable",
    tone: "muted"
  });
  consentGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "reject_all_path_availability",
      source: "scanner",
      whyNeeded: "Missing or incomplete consentFlowRuntimeScanner coverage."
    }
  ];

  const preConsentGapItem = makeChecklistItem({
    assessmentStatus: "coverage_limitation",
    evidenceState: "not_testable",
    id: "pre_consent_third_party_tracking",
    label: "Pre-consent third-party tracking",
    status: "Not testable",
    tone: "muted"
  });
  preConsentGapItem.criticalEvidence.missingOrIncompleteSourceSignals = [
    {
      actual: "not retained in this v2 artifact",
      expected: "bounded source evidence sufficient for this checklist row",
      field: "pre_consent_third_party_tracking",
      source: "scanner",
      whyNeeded: "Missing or incomplete preConsentRuntimeScanner coverage."
    }
  ];

  const html = renderToStaticMarkup(
    createElement(GdprEprivacyCoverageChecklistCard, {
      defaultOpen: true,
      items: [policyGapItem, consentGapItem, preConsentGapItem]
    })
  );

  assert.doesNotMatch(html, /Suggested follow-up capture/);
  assert.doesNotMatch(html, /policy or full/);
  assert.doesNotMatch(html, /consent or full/);
  assert.doesNotMatch(html, /standard or full/);
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

  assert.match(html, /Review retained evidence for consent-control accessibility/i);
  assert.doesNotMatch(html, /cross-border analytics\/tracking endpoint context/i);
  assert.doesNotMatch(html, /runtime vendor disclosure alignment/i);
  assert.doesNotMatch(html, /and accessibility of consent controls/i);
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
