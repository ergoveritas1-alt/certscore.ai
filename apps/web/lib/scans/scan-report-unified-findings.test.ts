import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanReportUnifiedFindingState,
  buildScanReportUnifiedFindings,
  debugBuildScanReportUnifiedFindingStateForScan,
  selectOwnerUnifiedFindingsForSection,
  type ScanReportUnifiedFindingState
} from "./scan-report-unified-findings";
import { buildReviewFindings, buildSectionReviewIssues } from "./scan-report-review-findings";
import { buildSupplementalRuntimeUnifiedFindingPackets } from "./supplemental-runtime-unified-findings";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { deriveConcernPolicy } from "./concern-policy";
import {
  dedupeHeadlineFindings,
  deriveConsentAuditFindings
} from "./consent-audit-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";

function packet(id: string, categoryId: string, relation: "owner" | "mirror" | "overlay") {
  return {
    categoryAlignments: [{ evidenceCategoryId: categoryId, relation }],
    unifiedFindingId: id
  };
}

test("selectOwnerUnifiedFindingsForSection keeps only owner-aligned packets", () => {
  const findings = [
    packet("owned", "tracking", "owner"),
    packet("mirrored", "tracking", "mirror"),
    packet("other", "financial", "owner")
  ];

  assert.deepEqual(
    selectOwnerUnifiedFindingsForSection(findings as never, new Set(["tracking"])).map((finding) => finding.unifiedFindingId),
    ["owned"]
  );
});

test("buildScanReportUnifiedFindings dedupes owner packets across section drafts", () => {
  const owned = packet("owned", "tracking", "owner");
  const state: ScanReportUnifiedFindingState = {
    derivedContext: {
      accessibilityIssueRows: [],
      accessibilityRuleEvidenceRows: [],
      consentAuditFindings: [],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      prioritizedAccessibilityRuleRows: [],
      scanReportReviewIssues: [],
      taxonomySnapshotSections: []
    },
    globalUnifiedFindings: [owned, packet("mirrored", "tracking", "mirror")] as never,
    sectionDrafts: [
      { sections: [{ sectionCategoryIds: new Set(["tracking"]) }] },
      { sections: [{ sectionCategoryIds: new Set(["tracking"]) }] }
    ]
  };

  assert.deepEqual(
    buildScanReportUnifiedFindings(state).map((finding) => finding.unifiedFindingId),
    ["owned"]
  );
});

test("report-level candidates surface runtime-backed session replay provenance", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        categoryId: "adtech_analytics_replay_footprint",
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          runtimeVendors: ["Microsoft Clarity"],
          session_replay_runtime_detected: true,
          session_replay_runtime_vendors: ["Microsoft Clarity"],
          signalKey: "commerce.session_replay_tool_detected",
          signalValue: true
        },
        observedValue: "Microsoft Clarity",
        severity: "high",
        signalKey: "commerce.session_replay_tool_detected",
        signalLabel: "Session replay tool detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Session replay tool detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "session_replay_observed");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "review");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
});

test("session replay snapshot signal retains persisted tracker vendor provenance", () => {
  const candidates = buildReviewFindings({
    issues: [],
    prioritizedAccessibilityRuleRows: [],
    sectionId: "tracking_third_party_ecosystem",
    sectionItems: [
      {
        key: "commerce.session_replay_tool_detected",
        label: "Session replay tool detected",
        relation: "primary",
        source: "snapshot_signal",
        value: true
      }
    ],
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestObservations: [],
        requestToVendorObservations: []
      }
    },
    trackerVendors: [
      {
        beforeConsent: true,
        collectionEndpointType: "first_party_collection_proxy",
        confidence: 0.95,
        detectionSource: "request",
        firstPartyOrThirdParty: "first_party",
        matchedSignatureId: "fullstory",
        scriptHost: "www.draftkings.com",
        vendorCategory: "session_replay",
        vendorName: "FullStory"
      }
    ]
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "session_replay_observed");

  assert.deepEqual(packet?.evidence?.entities?.runtimeVendors, ["FullStory"]);
  assert.deepEqual(packet?.evidence?.entities?.runtimeRequestUrls, ["https://www.draftkings.com"]);
  assert.ok(packet?.evidence?.flags?.includes("commerce.session_replay_tool_detected"));
});

test("contrast snapshot signal surfaces from persisted axe count and representative examples", () => {
  const candidates = buildReviewFindings({
    issues: [],
    prioritizedAccessibilityRuleRows: [
      {
        description: "Detected contrast failures in large text.",
        help: "Elements must meet enhanced color contrast ratio thresholds",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast-enhanced",
        impact: "serious",
        nodeCount: 2,
        pageUrl: "https://example.com/",
        representativeSelectors: [".hero-title"],
        ruleCode: "color-contrast-enhanced",
        ruleGroup: "wcag2aaa",
        severity: "high",
        weightedPriority: 32
      }
    ],
    sectionId: "perceivability_barriers",
    sectionItems: [
      {
        key: "accessibility.wcag_contrast_failures_count",
        label: "WCAG contrast failures",
        relation: "primary",
        source: "snapshot_signal",
        value: 2
      }
    ]
  });

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "contrast_failures");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.evidence?.counts?.count, 2);
  assert.equal(packet?.evidence?.flags?.includes("representative_accessibility_examples_retained"), true);
  assert.ok(packet?.evidence?.snippets?.some((snippet) => /color-contrast-enhanced\/wcag2aaa/i.test(snippet)));
});

test("accessibility snapshot signal tolerates persisted axe rows without rule metadata", () => {
  assert.doesNotThrow(() =>
    buildReviewFindings({
      issues: [],
      prioritizedAccessibilityRuleRows: [
        {
          description: "Persisted axe evidence row without normalized rule metadata.",
          help: null,
          helpUrl: null,
          impact: null,
          nodeCount: 1,
          pageUrl: "https://example.com/",
          representativeSelectors: [],
          ruleCode: undefined,
          ruleGroup: undefined,
          severity: "medium",
          weightedPriority: 1
        } as never
      ],
      sectionId: "perceivability_barriers",
      sectionItems: [
        {
          key: "accessibility.wcag_contrast_failures_count",
          label: "WCAG contrast failures",
          relation: "primary",
          source: "snapshot_signal",
          value: 1
        }
      ]
    })
  );
});

test("consent audit reject-tracking finding retains post-reject runtime evidence", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [
      {
        title: "Reject interaction did not reduce tracking",
        description: "Reject flow still showed tracker activity after opt-out.",
        severity: "high"
      } as never
    ],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      consent_baseline_tracker_vendor_names: ["Google Ads"],
      consent_baseline_tracker_evidence_urls: ["https://example.com/baseline.js"],
      consent_post_reject_tracker_vendor_names: ["Google Ads"],
      consent_post_reject_tracker_evidence_urls: ["https://example.com/post-reject.js"],
      consent_reject_persisted_tracker_vendor_names: ["Google Ads"],
      consent_reject_interaction_succeeded: true,
      consent_reject_post_reject_non_essential_requests: [
        {
          vendor: "Google Ads",
          hostname: "googleadservices.com",
          category: "advertising",
          requestUrl: "https://example.com/post-reject.js",
          ts_ms: 1842,
          ms_after_reject: 842,
          resource_type: "script",
          initiator: null,
          why_non_essential: "Google Ads is classified as advertising."
        }
      ],
      consent_reject_request_timing_buckets: [
        {
          url: "https://example.com/post-reject.js",
          phase: "post_reject",
          msAfterReject: 842
        }
      ],
      consent_reject_suppression_checks: {
        reject_click_confirmed: true,
        post_reject_window_available: true,
        non_essential_vendor_after_reject: true,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        baseline_contradiction_detected: false
      },
      consent_reject_confidence_risks: [
        "No classified non-essential request fired at least 250ms after reject."
      ],
      consent_opt_out_evidence_log: [
        {
          action: "reject",
          actionType: "reject_all",
          clickedAtMs: 1000,
          selector: "button#reject",
          stepIndex: 1,
          text: "Reject all",
          urlAfterClick: "https://example.com/"
        }
      ]
    },
    scanReportReviewIssues: [],
    sectionId: "consent_controls_enforcement",
    snapshot: {}
  });

  const candidates = buildReviewFindings({
    issues,
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts: {
      consent_baseline_tracker_vendor_names: ["Google Ads"],
      consent_baseline_tracker_evidence_urls: ["https://example.com/baseline.js"],
      consent_post_reject_tracker_vendor_names: ["Google Ads"],
      consent_post_reject_tracker_evidence_urls: ["https://example.com/post-reject.js"],
      consent_reject_persisted_tracker_vendor_names: ["Google Ads"],
      consent_reject_interaction_succeeded: true,
      consent_reject_post_reject_non_essential_requests: [
        {
          vendor: "Google Ads",
          hostname: "googleadservices.com",
          category: "advertising",
          requestUrl: "https://example.com/post-reject.js",
          ts_ms: 1842,
          ms_after_reject: 842,
          resource_type: "script",
          initiator: null,
          why_non_essential: "Google Ads is classified as advertising."
        }
      ],
      consent_reject_request_timing_buckets: [
        {
          url: "https://example.com/post-reject.js",
          phase: "post_reject",
          msAfterReject: 842
        }
      ],
      consent_reject_suppression_checks: {
        reject_click_confirmed: true,
        post_reject_window_available: true,
        non_essential_vendor_after_reject: true,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        baseline_contradiction_detected: false
      },
      consent_reject_confidence_risks: [
        "No classified non-essential request fired at least 250ms after reject."
      ],
      consent_opt_out_evidence_log: [
        {
          action: "reject",
          actionType: "reject_all",
          clickedAtMs: 1000,
          selector: "button#reject",
          stepIndex: 1,
          text: "Reject all",
          urlAfterClick: "https://example.com/"
        }
      ]
    },
    sectionId: "consent_controls_enforcement",
    sectionItems: []
  });
  const candidate = candidates.find((finding) => finding.title === "Reject interaction did not reduce tracking");
  const packet = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  }).find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");

  assert.deepEqual(candidate?.fallbackEvidence?.runtimeEvidenceUrls, [
    "https://example.com/baseline.js",
    "https://example.com/post-reject.js"
  ]);
  assert.deepEqual(candidate?.fallbackEvidence?.consentPostRejectTrackerEvidenceUrls, ["https://example.com/post-reject.js"]);
  assert.deepEqual(candidate?.fallbackEvidence?.consentOptOutEvidenceLog, [
    {
      action: "reject",
      actionType: "reject_all",
      clickedAtMs: 1000,
      selector: "button#reject",
      stepIndex: 1,
      text: "Reject all",
      urlAfterClick: "https://example.com/"
    }
  ]);
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.ok(packet?.evidence?.flags?.includes("reject_evidence_confirmed"));
  assert.equal(
    packet?.evidence?.entities?.confidenceRisks?.some((risk) =>
      /No classified non-essential request fired at least/i.test(risk)
    ) ?? false,
    false
  );
  assert.equal(packet?.details?.family, "consent_tracking");
});

test("consent audit reject-tracking finding confirms near-immediate post-reject evidence at policy threshold", () => {
  const makeRuntimeArtifacts = (msAfterReject: number) => ({
    consent_baseline_tracker_vendor_names: ["Google Ads"],
    consent_baseline_tracker_evidence_urls: ["https://example.com/baseline.js"],
    consent_post_reject_tracker_vendor_names: ["Google Ads"],
    consent_post_reject_tracker_evidence_urls: ["https://example.com/post-reject.js"],
    consent_reject_persisted_tracker_vendor_names: ["Google Ads"],
    consent_reject_interaction_succeeded: true,
    consent_reject_post_reject_non_essential_requests: [
      {
        vendor: "Google Ads",
        hostname: "googleadservices.com",
        category: "advertising",
        url: "https://example.com/post-reject.js",
        ts_ms: 1257,
        ms_after_reject: msAfterReject,
        resource_type: "script",
        initiator: null,
        why_non_essential: "Google Ads is classified as advertising."
      }
    ],
    consent_reject_request_timing_buckets: [
      {
        bucket: "after_reject_0_1s",
        evidence_urls: ["https://example.com/post-reject.js"],
        request_count: 1,
        tracker_request_count: 1,
        tracker_vendor_names: ["Google Ads"]
      }
    ],
    consent_reject_suppression_checks: {
      reject_click_confirmed: true,
      post_reject_window_available: true,
      non_essential_vendor_after_reject: true,
      cmp_initialization_only: false,
      navigation_or_reload_ambiguous: false,
      baseline_contradiction_detected: false
    },
    consent_opt_out_evidence_log: [
      {
        action: "reject",
        actionType: "reject_all",
        clickedAtMs: 1000,
        selector: "button#reject",
        stepIndex: 1,
        text: "Reject all",
        urlAfterClick: "https://example.com/"
      }
    ]
  });
  const buildPacket = (msAfterReject: number) => {
    const runtimeArtifacts = makeRuntimeArtifacts(msAfterReject);
    const candidates = buildReviewFindings({
      issues: buildSectionReviewIssues({
        accessibilityIssueRows: [],
        consentAuditFindings: [
          {
            title: "Reject interaction did not reduce tracking",
            description: "Reject flow still showed tracker activity after opt-out.",
            severity: "high"
          } as never
        ],
        policyBehaviorContradictions: [],
        preconsentViolationRows: [],
        runtimeArtifacts,
        scanReportReviewIssues: [],
        sectionId: "consent_controls_enforcement",
        snapshot: {}
      }),
      prioritizedAccessibilityRuleRows: [],
      runtimeArtifacts,
      sectionId: "consent_controls_enforcement",
      sectionItems: []
    });

    return buildUnifiedFindingDisplayPackets({
      reviewFindingCandidates: candidates,
      validationFindings: [],
      validationFindingLookup: new Map()
    }).find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");
  };

  const confirmedPacket = buildPacket(257);
  const reviewPacket = buildPacket(249);

  assert.equal(confirmedPacket?.presentationDecision.status, "surface");
  assert.equal(confirmedPacket?.surfacingDecision.decisionState, "confirmed");
  assert.ok(confirmedPacket?.evidence?.flags?.includes("reject_evidence_confirmed"));
  assert.equal(reviewPacket?.presentationDecision.status, "audit_only");
  assert.notEqual(reviewPacket?.surfacingDecision.decisionState, "confirmed");
  assert.ok(reviewPacket?.evidence?.flags?.includes("reject_evidence_review"));
  assert.ok(reviewPacket?.concernContext?.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence"));
});

test("consent audit derives reject-tracking concern from structured post-reject request evidence", () => {
  const runtimeArtifacts = {
    consent_audit_completed: true,
    consent_baseline_tracker_vendor_names: ["Google Ads"],
    consent_baseline_tracker_evidence_urls: ["https://example.com/baseline.js"],
    consent_post_reject_tracker_vendor_names: ["Google Ads"],
    consent_post_reject_tracker_evidence_urls: ["https://example.com/post-reject.js"],
    consent_reject_interaction_succeeded: true,
    consent_reject_post_reject_non_essential_requests: [
      {
        vendor: "Google Ads",
        hostname: "googleadservices.com",
        category: "advertising",
        url: "https://example.com/post-reject.js",
        ts_ms: 1708,
        ms_after_reject: 708,
        resource_type: "script"
      }
    ],
    consent_reject_request_timing_buckets: [
      {
        bucket: "after_reject_0_1s",
        evidence_urls: ["https://example.com/post-reject.js"],
        request_count: 1
      }
    ],
    consent_reject_suppression_checks: {
      reject_click_confirmed: true,
      post_reject_window_available: true,
      non_essential_vendor_after_reject: true,
      cmp_initialization_only: false,
      navigation_or_reload_ambiguous: false,
      baseline_contradiction_detected: false
    }
  };
  const consentAuditFindings = dedupeHeadlineFindings(deriveConsentAuditFindings({}, runtimeArtifacts));
  const candidates = buildReviewFindings({
    issues: buildSectionReviewIssues({
      accessibilityIssueRows: [],
      consentAuditFindings,
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      runtimeArtifacts,
      scanReportReviewIssues: [],
      sectionId: "consent_controls_enforcement",
      snapshot: {}
    }),
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts,
    sectionId: "consent_controls_enforcement",
    sectionItems: []
  });
  const packet = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  }).find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.ok(packet?.evidence?.flags?.includes("reject_evidence_confirmed"));
});

test("consent audit reject-tracking finding suppresses when reject click or timing is missing", () => {
  const candidates = buildReviewFindings({
    issues: buildSectionReviewIssues({
      accessibilityIssueRows: [],
      consentAuditFindings: [
        {
          title: "Reject interaction did not reduce tracking",
          description: "Reject flow still showed tracker activity after opt-out.",
          severity: "high"
        } as never
      ],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      runtimeArtifacts: {
        consent_baseline_tracker_vendor_names: ["Google Ads"],
        consent_post_reject_tracker_vendor_names: ["Google Ads"],
        consent_post_reject_tracker_evidence_urls: ["https://example.com/post-reject.js"],
        consent_reject_suppression_checks: {
          reject_click_confirmed: false,
          post_reject_window_available: false,
          non_essential_vendor_after_reject: true,
          cmp_initialization_only: false,
          navigation_or_reload_ambiguous: false,
          baseline_contradiction_detected: false
        }
      },
      scanReportReviewIssues: [],
      sectionId: "consent_controls_enforcement",
      snapshot: {}
    }),
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts: {
      consent_baseline_tracker_vendor_names: ["Google Ads"],
      consent_post_reject_tracker_vendor_names: ["Google Ads"],
      consent_post_reject_tracker_evidence_urls: ["https://example.com/post-reject.js"],
      consent_reject_suppression_checks: {
        reject_click_confirmed: false,
        post_reject_window_available: false,
        non_essential_vendor_after_reject: true,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        baseline_contradiction_detected: false
      }
    },
    sectionId: "consent_controls_enforcement",
    sectionItems: []
  });

  const packet = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  }).find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");

  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.equal(packet?.surfacingDecision.decisionState, "suppressed");
  assert.ok(packet?.evidence?.flags?.includes("reject_evidence_suppress"));
});

test("consent audit reject-tracking finding uses attribution and cookie-diff provenance to clear stale ambiguity checks", () => {
  const runtimeArtifacts = {
    consent_baseline_tracker_vendor_names: ["Adobe Analytics"],
    consent_baseline_tracker_evidence_urls: ["https://assets.adobedtm.com/baseline.js"],
    consent_post_reject_tracker_vendor_names: ["Adobe Analytics", "Google Ads", "Twitter Pixel"],
    consent_post_reject_tracker_evidence_urls: [
      "https://analytics.example.com/post-reject-1.js",
      "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1",
      "https://static.ads-twitter.com/uwt.js",
      "https://analytics.example.com/post-reject-2.js",
      "https://analytics.example.com/post-reject-3.js"
    ],
    consent_reject_cookie_diff_provenance: {
      summary: {
        addedAfterRejectCount: 12,
        persistedAfterRejectCount: 3,
        thirdPartyAddedAfterRejectCount: 4
      }
    },
    consent_reject_interaction_attribution: {
      clickedLabel: "Save Settings",
      finalUrl: "https://example.com/",
      finalUrlHostChanged: false,
      navigationEventsAfterClick: [],
      pageUrlAtClick: "https://example.com/",
      riskFlags: ["auth_wall_detected"]
    },
    consent_reject_interaction_succeeded: true,
    consent_reject_post_reject_non_essential_requests: [
      {
        vendor: "Google Ads",
        hostname: "googleadservices.com",
        category: "advertising",
        url: "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1",
        ts_ms: 1900,
        ms_after_reject: 900,
        resource_type: "script",
        initiator: null,
        why_non_essential: "Google Ads is classified as advertising."
      },
      {
        vendor: "Adobe Analytics",
        hostname: "analytics.example.com",
        category: "analytics",
        url: "https://analytics.example.com/post-reject-1.js",
        ts_ms: 1960,
        ms_after_reject: 960,
        resource_type: "script",
        initiator: null,
        why_non_essential: "Adobe Analytics is classified as analytics."
      },
      {
        vendor: "Twitter Pixel",
        hostname: "static.ads-twitter.com",
        category: "advertising",
        url: "https://static.ads-twitter.com/uwt.js",
        ts_ms: 2100,
        ms_after_reject: 1100,
        resource_type: "script",
        initiator: null,
        why_non_essential: "Twitter Pixel is classified as advertising."
      }
    ],
    consent_reject_suppression_checks: {
      reject_click_confirmed: true,
      post_reject_window_available: true,
      non_essential_vendor_after_reject: true,
      cmp_initialization_only: false,
      navigation_or_reload_ambiguous: true,
      baseline_contradiction_detected: true
    }
  };
  const candidates = buildReviewFindings({
    issues: buildSectionReviewIssues({
      accessibilityIssueRows: [],
      consentAuditFindings: [
        {
          title: "Reject interaction did not reduce tracking",
          description: "Reject flow still showed tracker activity after opt-out.",
          severity: "high"
        } as never
      ],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      runtimeArtifacts,
      scanReportReviewIssues: [],
      sectionId: "consent_controls_enforcement",
      snapshot: {}
    }),
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts,
    sectionId: "consent_controls_enforcement",
    sectionItems: []
  });
  const fallbackEvidence = candidates.find((finding) => finding.title === "Reject interaction did not reduce tracking")
    ?.fallbackEvidence as Record<string, unknown> | undefined;
  const packet = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  }).find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.reportLane, "main");
  assert.ok(!packet?.evidence?.flags?.includes("reject_evidence_suppress"));
  assert.deepEqual(fallbackEvidence?.suppressionChecks, {
    reject_click_confirmed: true,
    post_reject_window_available: true,
    non_essential_vendor_after_reject: true,
    cmp_initialization_only: false,
    navigation_or_reload_ambiguous: false,
    baseline_contradiction_detected: false
  });
});

test("consent audit reject-tracking finding promotes vendor-rich post-reject evidence without retained timing", () => {
  const runtimeArtifacts = {
    consent_baseline_tracker_vendor_names: ["Marketo"],
    consent_baseline_tracker_evidence_urls: ["https://munchkin.marketo.net/munchkin.js"],
    consent_post_reject_tracker_vendor_names: [
      "Google Ads",
      "Google Tag Manager",
      "LinkedIn Insight Tag",
      "Marketo",
      "Microsoft Clarity",
      "Reddit Pixel"
    ],
    consent_post_reject_tracker_evidence_urls: [
      "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1",
      "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
      "https://px.ads.linkedin.com/collect?v=2",
      "https://munchkin.marketo.net/165/munchkin.js",
      "https://c.clarity.ms/c.gif",
      "https://alb.reddit.com/rp.gif"
    ],
    consent_reject_suppression_checks: {
      reject_click_confirmed: true,
      post_reject_window_available: false,
      non_essential_vendor_after_reject: true,
      cmp_initialization_only: false,
      navigation_or_reload_ambiguous: false,
      baseline_contradiction_detected: false
    },
    consent_opt_out_evidence_log: [
      {
        action: "reject",
        actionType: "essential_only",
        clickedAtMs: 1000,
        selector: "button#onetrust-reject-all-handler",
        text: "Essential only"
      }
    ]
  };
  const candidates = buildReviewFindings({
    issues: buildSectionReviewIssues({
      accessibilityIssueRows: [],
      consentAuditFindings: [
        {
          title: "Reject interaction did not reduce tracking",
          description: "Reject flow still showed tracker activity after opt-out.",
          severity: "high"
        } as never
      ],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      runtimeArtifacts,
      scanReportReviewIssues: [],
      sectionId: "consent_controls_enforcement",
      snapshot: {}
    }),
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts,
    sectionId: "consent_controls_enforcement",
    sectionItems: []
  });
  const candidate = candidates.find((finding) => finding.title === "Reject interaction did not reduce tracking");
  const fallbackEvidence = candidate?.fallbackEvidence as Record<string, unknown> | undefined;
  const packet = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  }).find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");

  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.surfacingDecision.reportLane, "confidence_and_coverage");
  assert.ok(packet?.surfacingDecision.appliedRules.includes("evidence.finding_contract.audit_only"));
  assert.ok(packet?.evidence?.flags?.includes("reject_evidence_review"));
  assert.ok(!packet?.evidence?.flags?.includes("reject_evidence_confirmed"));
  assert.ok(packet?.concernContext?.negativeEvidenceFlags.includes("missing_post_reject_timing_evidence"));
  assert.equal((fallbackEvidence?.promotionDecision as Record<string, unknown> | undefined)?.promoted, false);
  assert.equal((fallbackEvidence?.promotionDecision as Record<string, unknown> | undefined)?.requiredTimingSatisfied, false);
  assert.deepEqual((fallbackEvidence?.rejectEvidenceDiff as Record<string, unknown> | undefined)?.baseline_vendors, ["Marketo"]);
  assert.equal((fallbackEvidence?.rejectEvidenceDiff as Record<string, unknown> | undefined)?.baseline_reconstruction_status, "reconciled");
  assert.ok((fallbackEvidence?.confidenceRisks as string[] | undefined)?.includes("Post-reject timing unavailable; cannot confirm persistence after reject."));
});

test("consent audit reject-tracking evidence maps post-reject vendors from request hostnames", () => {
  const runtimeArtifacts = {
    consent_baseline_tracker_vendor_names: ["Marketo"],
    consent_post_reject_tracker_vendor_names: [
      "Google Ads",
      "Google Ads",
      "Google Ads",
      "Google Ads",
      "Google Ads",
      "Google Ads"
    ],
    consent_post_reject_tracker_evidence_urls: [
      "https://px.ads.linkedin.com/collect?v=2",
      "https://alb.reddit.com/rp.gif",
      "https://c.clarity.ms/c.gif",
      "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1",
      "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
      "https://munchkin.marketo.net/165/munchkin.js"
    ],
    consent_reject_suppression_checks: {
      reject_click_confirmed: true,
      post_reject_window_available: false,
      non_essential_vendor_after_reject: true,
      cmp_initialization_only: false,
      navigation_or_reload_ambiguous: false,
      baseline_contradiction_detected: false
    }
  };
  const candidates = buildReviewFindings({
    issues: buildSectionReviewIssues({
      accessibilityIssueRows: [],
      consentAuditFindings: [
        {
          title: "Reject interaction did not reduce tracking",
          description: "Reject flow still showed tracker activity after opt-out.",
          severity: "high"
        } as never
      ],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      runtimeArtifacts,
      scanReportReviewIssues: [],
      sectionId: "consent_controls_enforcement",
      snapshot: {}
    }),
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts,
    sectionId: "consent_controls_enforcement",
    sectionItems: []
  });
  const candidate = candidates.find((finding) => finding.title === "Reject interaction did not reduce tracking");
  const requests = (candidate?.fallbackEvidence?.postRejectNonEssentialRequests ?? []) as Array<Record<string, unknown>>;

  assert.deepEqual(requests.map((request) => request.vendor), [
    "LinkedIn Insight Tag",
    "Reddit Pixel",
    "Microsoft Clarity",
    "Google Ads",
    "Google Tag Manager",
    "Marketo"
  ]);
  assert.deepEqual(requests.map((request) => request.hostname), [
    "px.ads.linkedin.com",
    "alb.reddit.com",
    "c.clarity.ms",
    "googleads.g.doubleclick.net",
    "www.googletagmanager.com",
    "munchkin.marketo.net"
  ]);
  assert.ok(requests.every((request) => request.vendor_attribution_confidence === "high"));
});

test("high-sensitivity snapshot signal specializes when merged tracking context is retained", () => {
  const candidates = buildReviewFindings({
    issues: [],
    mergedSignals: [
      {
        key: "commerce.high_sensitivity_data_collection_detected",
        selectedPopulation: { value: true },
        value: true
      },
      {
        key: "commerce.retargeting_pixel_detected",
        selectedPopulation: { value: true },
        value: true
      }
    ],
    prioritizedAccessibilityRuleRows: [],
    runtimeArtifacts: {
      sensitive_payload_violations: [
        {
          detectedType: "phone_detected",
          evidenceStrength: "confirmed",
          matchSnippet: "intellimizeClientIp=***-***-4248",
          requestUrl: "https://log.intellimize.co/logger",
          vendorHost: "log.intellimize.co"
        }
      ]
    },
    sectionId: "privacy_and_data_use",
    sectionItems: [
      {
        key: "commerce.high_sensitivity_data_collection_detected",
        label: "High-sensitivity data collection detected",
        relation: "primary",
        source: "snapshot_signal",
        value: true
      }
    ],
    trackerVendors: []
  });
  const [packet] = buildUnifiedFindingDisplayPackets({
    mergedSignals: [
      {
        confidence: 1,
        evidenceRefs: [],
        key: "commerce.high_sensitivity_data_collection_detected",
        label: "High-sensitivity data collection detected",
        observedAt: null,
        populationStatus: "present",
        populations: [],
        reportSignalSource: "snapshot_signal",
        selectedPopulation: {
          confidence: 1,
          evidenceRefs: [],
          key: "commerce.high_sensitivity_data_collection_detected",
          label: "High-sensitivity data collection detected",
          observedAt: null,
          populationStatus: "present",
          provenance: [],
          reportSignalSource: "snapshot_signal",
          source: "scanner",
          value: true,
          valueType: "boolean"
        },
        value: true,
        valueType: "boolean"
      },
      {
        confidence: 1,
        evidenceRefs: [],
        key: "commerce.retargeting_pixel_detected",
        label: "Retargeting pixel detected",
        observedAt: null,
        populationStatus: "present",
        populations: [],
        reportSignalSource: "snapshot_signal",
        selectedPopulation: {
          confidence: 1,
          evidenceRefs: [],
          key: "commerce.retargeting_pixel_detected",
          label: "Retargeting pixel detected",
          observedAt: null,
          populationStatus: "present",
          provenance: [],
          reportSignalSource: "snapshot_signal",
          source: "scanner",
          value: true,
          valueType: "boolean"
        },
        value: true,
        valueType: "boolean"
      }
    ],
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "sensitive_data_collection_with_third_party_tracking_present");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.deepEqual(packet?.evidence?.entities?.request_domains, ["log.intellimize.co"]);
  assert.ok(packet?.evidence?.snippets?.includes("intellimizeClientIp=***-***-4248"));
});

test("high-sensitivity snapshot signal stays generic when replay runtime is independent of retained sensitive request", () => {
  const [packet] = buildUnifiedFindingDisplayPackets({
    mergedSignals: [],
    reviewFindingCandidates: [
      {
        description: "Sensitive request and replay tooling were retained together.",
        fallbackEvidence: {
          sensitivePayloadViolations: [
            {
              detectedType: "postal_code_detected",
              evidenceStrength: "suspected",
              matchSnippet: "zipcode=64***18",
              requestUrl: "https://api.example.com/location?zipcode=64118",
              sourceField: "zipcode",
              vendorHost: "api.example.com"
            }
          ],
          session_replay_runtime_detected: true,
          session_replay_runtime_vendors: ["FullStory"],
          session_replay_vendor_artifact_present: true,
          signalKey: "commerce.high_sensitivity_data_collection_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalLabel: "High-sensitivity data collection detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "High-sensitivity data collection detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  assert.equal(packet?.unifiedFindingId, "sensitive_collection_surface_observed");
  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.deepEqual(packet?.evidence?.entities?.session_replay_runtime_vendors, ["FullStory"]);
  assert.deepEqual(packet?.evidence?.entities?.request_domains, ["api.example.com"]);
});

test("initial cookie inventory routes to audit-only preconsent packet instead of raw executive bridge", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      initial_cookie_domains: [".example.com"],
      initial_cookie_names: ["__cf_bm", "kndctr_16AD4362526701720A490D45_AdobeOrg_identity"]
    },
    scanReportReviewIssues: [],
    sectionId: "tracking_third_party_ecosystem",
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    }
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: issues.map((issue) => ({
      description: issue.description,
      evidence: issue.evidence ?? [],
      fallbackEvidence: issue.fallbackEvidence,
      observedValue: issue.evidence?.[0] ?? null,
      severity: issue.severity,
      sourceType: "issue",
      title: issue.title
    })),
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "preconsent_tracking");

  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("audit_only"), true);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_concrete_preconsent_artifact"), true);
  assert.equal(packet?.evidence?.entities?.preconsent_cookie_names?.includes("kndctr_16AD4362526701720A490D45_AdobeOrg_identity"), true);
});

test("observed baseline tracker URL fallback creates canonical preconsent packet", () => {
  const state = buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: ["https://www.googletagmanager.com/gtm.js?id=GTM-EXAMPLE"],
      consent_baseline_tracker_vendor_names: ["Google Tag Manager"],
      hybrid_runtime_evidence: {
        timelineMarkers: {
          consentBannerDetectedMs: 1200,
          firstThirdPartyRequestMs: 300
        }
      }
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);
  assert.deepEqual(packet?.evidence?.entities?.runtimeRequestUrls, [
    "https://www.googletagmanager.com/gtm.js?id=GTM-EXAMPLE"
  ]);
});

function buildPreconsentRuntimeState(
  runtimeArtifacts: Record<string, unknown>,
  snapshot: Record<string, unknown> = {},
  validationFindings: unknown[] = []
) {
  return buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    runtimeArtifacts,
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com",
      ...snapshot
    },
    trackerVendors: [],
    validationFindings
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
}

test("state-0 preconsent request artifact creates audit-only incomplete preconsent packet", () => {
  const state = buildPreconsentRuntimeState({
      consent_timeline: {
        firstCmpVisibleMs: 0,
        firstConsentActionMs: 0,
        firstNonEssentialRequestMs: null,
        timelineConfidence: "low"
      },
      hybrid_runtime_evidence: {
        preconsentState0RequestObservations: [
          {
            category: "unknown",
            classification: "third_party_unclassified",
            confidence: "low",
            evidenceSource: "state0_request_capture",
            hostname: "cdn.example-ad.net",
            requestUrl: "https://cdn.example-ad.net/bootstrap.js",
            resourceType: "script",
            runtimePhase: "pre_consent",
            thirdParty: true,
            tsMs: 0,
            vendor: null
          }
        ],
        requestObservations: [
          {
            domain: "cdn.example-ad.net",
            pathSample: "/bootstrap.js",
            runtimePhase: "pre_consent",
            thirdParty: true,
            tsMs: 0
          }
        ],
        requestToVendorObservations: [],
        timelineMarkers: {
          consentBannerDetectedMs: 0,
          firstRequestMs: 0,
          firstThirdPartyRequestMs: 0
        }
      }
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");

  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.surfacingDecision.decisionState, "material_incomplete");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("audit_only"), true);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"), true);
  assert.deepEqual(packet?.evidence?.entities?.runtimeRequestUrls, ["https://cdn.example-ad.net/bootstrap.js"]);
});

test("promotion-grade preconsent timing and vendor anchors surface as executive findings", () => {
  const state = buildPreconsentRuntimeState({
    consent_timeline: {
      firstCmpVisibleMs: 1000,
      firstConsentActionMs: 4000,
      firstNonEssentialRequestMs: 250,
      timelineConfidence: "high"
    },
    hybrid_runtime_evidence: {
      requestPurposeClassificationConfidence: [
        {
          category: "advertising",
          confidence: 0.95,
          essentiality: "non_essential",
          hostname: "www.facebook.com",
          requestUrl: "https://www.facebook.com/tr/?id=123&ev=PageView",
          runtimePhase: "pre_consent",
          tsMs: 250,
          vendor: "Meta Pixel"
        }
      ],
      requestObservations: [
        {
          classification: "known_tracker",
          domain: "www.facebook.com",
          pathSample: "/tr/",
          requestUrl: "https://www.facebook.com/tr/?id=123&ev=PageView",
          runtimePhase: "pre_consent",
          thirdParty: true,
          tsMs: 250,
          vendor: "Meta Pixel"
        }
      ],
      timelineMarkers: {
        consentBannerDetectedMs: 1000,
        firstRequestMs: 250,
        firstThirdPartyRequestMs: 250
      }
    }
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.ok(projection.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.equal(projection.posture, "Action Needed");
});

test("validation preconsent packet absorbs runtime timing and classification evidence before projection", () => {
  const state = buildPreconsentRuntimeState(
    {
      consent_timeline: {
        firstCmpVisibleMs: 1000,
        firstConsentActionMs: null,
        firstNonEssentialRequestMs: 250,
        timelineConfidence: "high"
      },
      hybrid_runtime_evidence: {
        consentSummary: {
          acceptPresent: true,
          bannerPresent: true,
          managePresent: true,
          rejectPresent: true
        },
        requestPurposeClassificationConfidence: [
          {
            category: "analytics",
            confidence: 0.9,
            essentiality: "non_essential",
            hostname: "analytics.example.com",
            requestUrl: "https://analytics.example.com/collect",
            runtimePhase: "pre_consent",
            tsMs: 250,
            vendor: "Example Analytics"
          }
        ],
        requestObservations: [
          {
            classification: "known_tracker",
            domain: "analytics.example.com",
            requestUrl: "https://analytics.example.com/collect",
            runtimePhase: "pre_consent",
            thirdParty: true,
            tsMs: 250,
            vendor: "Example Analytics"
          }
        ],
        timelineMarkers: {
          consentBannerDetectedMs: 1000,
          firstRequestMs: 250,
          firstThirdPartyRequestMs: 250
        }
      }
    },
    {},
    [
      {
        id: "validation-preconsent-thin",
        rule_key: "runtime_privacy.preconsent_tracking_observed",
        title: "Tracking observed before consent",
        description: "Runtime evidence retained pre-consent tracking.",
        evidence_json: {
          preconsent_tracking_detected: true,
          preconsent_tracker_evidence_urls: ["https://analytics.example.com/collect"],
          runtimeVendors: ["Example Analytics"]
        },
        finding_source: "runtime_privacy",
        severity: "high"
      }
    ]
  );
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"), false);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_concrete_preconsent_artifact"), false);
  assert.equal(packet?.evidence?.entities?.consentTimeline?.length, 1);
  assert.equal(packet?.evidence?.entities?.requestPurposeClassificationConfidence?.length, 1);
  assert.ok(projection.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(projection.topFindings.some((finding) => finding.id === "pre_consent_tracking_detected"));
});

test("persisted preconsent rows absorb retained runtime evidence URLs before projection", () => {
  const state = debugBuildScanReportUnifiedFindingStateForScan({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [
      {
        collectionEndpointType: "direct_third_party",
        confidence: 0.9,
        detectionSource: "request",
        evidenceUrls: [],
        firstPartyOrThirdParty: "third_party",
        matchedSignatureId: "google_ads",
        scriptHost: "securepubads.g.doubleclick.net",
        vendorCategory: "advertising",
        vendorName: "Google Ads"
      }
    ],
    runtimeArtifacts: {
      consent_timeline: {
        firstCmpVisibleMs: 1000,
        firstConsentActionMs: null,
        firstNonEssentialRequestMs: 250,
        timelineConfidence: "high"
      },
      hybrid_runtime_evidence: {
        requestPurposeClassificationConfidence: [
          {
            category: "advertising",
            classificationBasis: "tracker_signature",
            confidence: 0.9,
            essentiality: "non_essential",
            hostname: "securepubads.g.doubleclick.net",
            requestUrl: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
            runtimePhase: "pre_consent",
            tsMs: 250,
            vendor: "Google Ads"
          }
        ],
        timelineMarkers: {
          consentBannerDetectedMs: 1000,
          firstRequestMs: 250,
          firstThirdPartyRequestMs: 250
        }
      }
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.deepEqual(state.derivedContext.preconsentViolationRows[0]?.evidenceUrls, [
    "https://securepubads.g.doubleclick.net/tag/js/gpt.js"
  ]);
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.ok(projection.topFindings.some((finding) => finding.id === "pre_consent_tracking_detected"));
});

test("prod-shaped preconsent rows merge with runtime URLs and derived consent timing", () => {
  const state = debugBuildScanReportUnifiedFindingStateForScan({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [
      {
        collection_endpoint_type: "direct_third_party",
        confidence: 0.9,
        detection_source: "request",
        evidence_urls: [],
        first_party_or_third_party: "third_party",
        matched_signature_id: "google_ads",
        script_host: "googleads.g.doubleclick.net",
        vendor_category: "advertising",
        vendor_name: "Google Ads"
      }
    ] as never,
    runtimeArtifacts: {
      consent_timeline: {
        firstCmpVisibleMs: null,
        firstConsentActionMs: null,
        firstNonEssentialRequestMs: 736,
        timelineConfidence: "low"
      },
      hybrid_runtime_evidence: {
        consentSummary: {
          acceptPresent: true,
          bannerPresent: true,
          managePresent: true,
          rejectPresent: true
        },
        requestPurposeClassificationConfidence: [
          {
            category: "advertising",
            classificationBasis: "tracker_signature",
            confidence: 0.9,
            essentiality: "non_essential",
            hostname: "googleads.g.doubleclick.net",
            requestUrl: "https://googleads.g.doubleclick.net/pagead/id",
            runtimePhase: "pre_consent",
            tsMs: 736,
            vendor: "Google Ads"
          }
        ],
        timelineMarkers: {
          consentBannerDetectedMs: 1200,
          firstRequestMs: 736,
          firstThirdPartyRequestMs: 736
        }
      }
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.fandango.com/",
      registered_domain: "fandango.com"
    },
    trackerVendors: [],
    validationFindings: []
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.deepEqual(state.derivedContext.preconsentViolationRows[0]?.evidenceUrls, [
    "https://googleads.g.doubleclick.net/pagead/id"
  ]);
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_preconsent_sequence_evidence"), false);
  assert.ok(projection.topFindings.some((finding) => finding.id === "pre_consent_tracking_detected"));
});

test("state-zero tracker observations with consent timing surface as pre-consent top findings", () => {
  const state = buildPreconsentRuntimeState({
    hybrid_runtime_evidence: {
      consentSummary: {
        acceptPresent: true,
        bannerPresent: true,
        firstVisibleMs: 1200,
        managePresent: true,
        rejectPresent: true
      },
      preconsentState0RequestObservations: [
        {
          category: "analytics",
          classification: "known_tracker",
          confidence: "high",
          evidenceSource: "state0_request_capture",
          hostname: "www.googletagmanager.com",
          requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
          resourceType: "script",
          runtimePhase: "pre_consent",
          thirdParty: true,
          tsMs: 350,
          vendor: "Google Tag Manager"
        },
        {
          category: "analytics",
          classification: "known_tracker",
          confidence: "high",
          evidenceSource: "state0_request_capture",
          hostname: "dev.visualwebsiteoptimizer.com",
          requestUrl: "https://dev.visualwebsiteoptimizer.com/j.php",
          resourceType: "script",
          runtimePhase: "pre_consent",
          thirdParty: true,
          tsMs: 360,
          vendor: "VWO"
        }
      ],
      requestObservations: [],
      requestToVendorObservations: [],
      timelineMarkers: {
        consentBannerDetectedMs: 1200,
        firstRequestMs: 350,
        firstThirdPartyRequestMs: 350,
        navigationStartMs: 0
      }
    }
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.equal(packet?.evidence?.entities?.consentTimeline?.length, 1);
  assert.equal(packet?.evidence?.entities?.requestPurposeClassificationConfidence?.length, 2);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_tracker_vendors, ["Google Tag Manager", "VWO"]);
  assert.ok(projection.findings.some((finding) => finding.id === "pre_consent_tracking_detected"));
  assert.ok(projection.topFindings.some((finding) => finding.id === "pre_consent_tracking_detected"));
});

test("service-only state-zero requests stay audit-only and out of tracker promotion", () => {
  const serviceRows = [
    ["cdn.optimizely.com", "https://cdn.optimizely.com/public/123/s/project.js", "Optimizely Web Experimentation", "experimentation", "personalization"],
    ["js.stripe.com", "https://js.stripe.com/v3", "Stripe.js", "payment", "fraud_security"],
    ["cookies-data.onetrust.io", "https://cookies-data.onetrust.io/cfw/cmp/v1/session", "OneTrust CMP data service", "cmp", "cdn_infra"],
    ["accounts.google.com", "https://accounts.google.com/gsi/client", "Google Identity Services", "identity", "identity"]
  ].map(([hostname, requestUrl, vendor, serviceClass, category], index) => ({
    category,
    classification: "service_classified",
    confidence: "medium",
    evidenceSource: "state0_request_capture",
    hostname,
    requestUrl,
    resourceType: "script",
    runtimePhase: "pre_consent",
    serviceClass,
    thirdParty: true,
    tsMs: index,
    vendor
  }));
  const state = buildPreconsentRuntimeState({
    consent_timeline: {
      firstCmpVisibleMs: 0,
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: null,
      timelineConfidence: "low"
    },
    hybrid_runtime_evidence: {
      preconsentState0RequestObservations: serviceRows,
      requestObservations: serviceRows.map((row) => ({
        category: row.category,
        classification: row.classification,
        domain: row.hostname,
        evidenceSource: row.evidenceSource,
        pathSample: "/",
        requestUrl: row.requestUrl,
        runtimePhase: "pre_consent",
        serviceClass: row.serviceClass,
        thirdParty: true,
        tsMs: row.tsMs,
        vendor: row.vendor
      })),
      requestToVendorObservations: []
    }
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "audit_only");
  assert.equal(packet?.surfacingDecision.decisionState, "material_incomplete");
  assert.equal(packet?.topFindingEligibility?.eligibility, "not_projected");
  assert.ok(packet?.topFindingEligibility?.candidateTopFindingIds.includes("pre_consent_tracking_detected"));
  assert.ok(packet?.topFindingEligibility?.suppressionReason);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_tracker_vendors ?? [], []);
  assert.deepEqual(packet?.evidence?.entities?.preconsent_tracker_evidence_urls ?? [], []);
  assert.equal(projection.findings.some((finding) => finding.id === "pre_consent_tracking_detected"), false);
});

test("service-only request purpose rows do not promote pre-consent tracker findings", () => {
  const state = buildPreconsentRuntimeState({
    consent_timeline: {
      firstCmpVisibleMs: 1200,
      firstConsentActionMs: null,
      firstNonEssentialRequestMs: null,
      timelineConfidence: "high"
    },
    hybrid_runtime_evidence: {
      requestObservations: [
        {
          category: "fraud_security",
          classification: "service_classified",
          domain: "static.captcha-delivery.com",
          requestUrl: "https://static.captcha-delivery.com/captcha/assets/tpl.js",
          runtimePhase: "pre_consent",
          serviceClass: "bot_protection",
          thirdParty: true,
          tsMs: 250,
          vendor: "DataDome bot protection"
        },
        {
          category: "unknown",
          classification: "service_classified",
          domain: "cdn-ukwest.onetrust.com",
          requestUrl: "https://cdn-ukwest.onetrust.com/scripttemplates/otSDKStub.js",
          runtimePhase: "pre_consent",
          serviceClass: "cmp",
          thirdParty: true,
          tsMs: 300,
          vendor: "OneTrust CMP asset"
        }
      ],
      requestPurposeClassificationConfidence: [
        {
          category: "fraud_security",
          classificationBasis: "runtime_service_signature",
          confidence: 0.9,
          essentiality: "essential",
          hostname: "static.captcha-delivery.com",
          purpose: "bot_protection",
          requestUrl: "https://static.captcha-delivery.com/captcha/assets/tpl.js",
          runtimePhase: "pre_consent",
          serviceClass: "bot_protection",
          tsMs: 250,
          vendor: "DataDome bot protection"
        },
        {
          category: "unknown",
          classificationBasis: "runtime_service_signature",
          confidence: 0.9,
          essentiality: "unknown",
          hostname: "cdn-ukwest.onetrust.com",
          purpose: "cmp",
          requestUrl: "https://cdn-ukwest.onetrust.com/scripttemplates/otSDKStub.js",
          runtimePhase: "pre_consent",
          serviceClass: "cmp",
          tsMs: 300,
          vendor: "OneTrust CMP asset"
        }
      ],
      timelineMarkers: {
        consentBannerDetectedMs: 1200,
        firstRequestMs: 250,
        firstThirdPartyRequestMs: 250
      }
    }
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "preconsent_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet, undefined);
  assert.equal(projection.findings.some((finding) => finding.id === "pre_consent_tracking_detected"), false);
  assert.equal(projection.topFindings.some((finding) => finding.id === "pre_consent_tracking_detected"), false);
});

test("runtime pre-submit text capture evidence creates canonical packet", () => {
  const state = buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    runtimeArtifacts: {
      pre_submit_text_capture_evidence: [
        {
          destinationClassification: "third_party_tracking_hashed_identifier",
          fieldContext: {
            ariaLabel: "Email",
            id: "email",
            name: "email",
            placeholder: "Email",
            type: "email"
          },
          matchType: "sha256",
          pageUrl: "https://www.example.com/",
          payloadHint: "sha256_sentinel_in_request_body",
          requestDomain: "analytics.twitter.com",
          requestMethod: "POST",
          requestTimestamp: "2026-05-04T12:00:01.000Z",
          requestUrl: "https://analytics.twitter.com/i/adsct",
          resourceType: "xhr",
          submitObserved: false,
          typedTimestamp: "2026-05-04T12:00:00.000Z",
          vendorCategory: "advertising"
        }
      ]
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "pre_submit_text_capture_detected");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);
  assert.deepEqual(packet?.evidence?.entities?.preSubmitTextCaptureRequestDomains, ["analytics.twitter.com"]);
  assert.deepEqual(packet?.evidence?.entities?.preSubmitTextCaptureClassifications, [
    "third_party_tracking_hashed_identifier"
  ]);
});

test("runtime-derived reject persistence projects when retained post-reject rows are promotion-grade", () => {
  const state = buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: ["https://www.google-analytics.com/g/collect"],
      consent_baseline_tracker_vendor_names: ["Google Analytics"],
      consent_post_reject_tracker_evidence_urls: ["https://www.google-analytics.com/g/collect?after=1"],
      consent_post_reject_tracker_vendor_names: ["Google Analytics"],
      consent_reject_interaction_succeeded: true,
      consent_reject_persisted_tracker_vendor_names: ["Google Analytics"],
      consent_reject_post_reject_non_essential_requests: [
        {
          category: "analytics",
          hostname: "www.google-analytics.com",
          ms_after_reject: 1000,
          ts_ms: 3000,
          url: "https://www.google-analytics.com/g/collect?after=1",
          vendor: "Google Analytics"
        }
      ],
      consent_reject_suppression_checks: {
        baseline_contradiction_detected: false,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        non_essential_vendor_after_reject: true,
        post_reject_window_available: true,
        reject_click_confirmed: true
      },
      reject_path_depth_and_availability: {
        availability: "available",
        banner_layer_inspected: true,
        reject_interaction_succeeded: true
      },
      request_purpose_classification_confidence: [
        {
          category: "analytics",
          confidence: 0.85,
          essentiality: "non_essential",
          hostname: "www.google-analytics.com",
          requestUrl: "https://www.google-analytics.com/g/collect?after=1",
          tsMs: 3000,
          vendor: "Google Analytics"
        }
      ]
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.ok(packet?.evidence?.flags?.includes("reject_evidence_confirmed"));
  assert.deepEqual(packet?.evidence?.entities?.postRejectNonEssentialRequests, [
    JSON.stringify({
      category: "analytics",
      hostname: "www.google-analytics.com",
      ms_after_reject: 1000,
      ts_ms: 3000,
      url: "https://www.google-analytics.com/g/collect?after=1",
      vendor: "Google Analytics"
    })
  ]);
  assert.ok(projection.findings.some((finding) => finding.id === "reject_tracking_persists_after_reject"));
  assert.ok(projection.topFindings.some((finding) => finding.id === "reject_tracking_persists_after_reject"));
});

test("runtime-derived reject persistence projects retained post-reject tag-manager rows", () => {
  const state = buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    runtimeArtifacts: {
      consent_post_reject_tracker_evidence_urls: ["https://www.googletagmanager.com/gtm.js?id=GTM-POST-REJECT"],
      consent_post_reject_tracker_vendor_names: ["Google Tag Manager"],
      consent_reject_interaction_succeeded: true,
      consent_reject_post_reject_non_essential_requests: [
        {
          category: "tag_manager",
          hostname: "www.googletagmanager.com",
          ms_after_reject: 1000,
          ts_ms: 3000,
          url: "https://www.googletagmanager.com/gtm.js?id=GTM-POST-REJECT",
          vendor: "Google Tag Manager"
        }
      ],
      consent_reject_suppression_checks: {
        baseline_contradiction_detected: false,
        cmp_initialization_only: false,
        navigation_or_reload_ambiguous: false,
        non_essential_vendor_after_reject: true,
        post_reject_window_available: true,
        reject_click_confirmed: true
      },
      reject_path_depth_and_availability: {
        availability: "available",
        banner_layer_inspected: true,
        reject_interaction_succeeded: true
      }
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
  const packet = state.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "reject_did_not_reduce_tracking");
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.ok(packet?.evidence?.flags?.includes("reject_evidence_confirmed"));
  assert.ok(projection.findings.some((finding) => finding.id === "reject_tracking_persists_after_reject"));
});

test("runtime reject path depth promotes concrete dark-pattern reject-missing evidence", () => {
  const makeState = (runtimeArtifacts: Record<string, unknown>) => buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    primaryPolicyEnrichment: null,
    runtimeArtifacts,
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });

  const concreteState = makeState({
    consent_actionable_choice_observed: true,
    consent_surface_observed: true,
    reject_path_depth_and_availability: {
      acceptClickDepth: 1,
      choiceAsymmetry: "material",
      preferencesRequiredBeforeReject: true,
      rejectAvailableOnFirstLayer: false,
      rejectClickDepth: 2
    }
  });
  const weakState = makeState({
    consent_actionable_choice_observed: false,
    consent_surface_observed: false,
    reject_path_depth_and_availability: {
      acceptClickDepth: null,
      choiceAsymmetry: "material",
      preferencesRequiredBeforeReject: false,
      rejectAvailableOnFirstLayer: false,
      rejectClickDepth: null
    }
  });

  const packet = concreteState.globalUnifiedFindings.find((finding) => finding.unifiedFindingId === "reject_button_missing");
  const projection = projectExecutiveFindingsFromUnifiedPackets(concreteState.globalUnifiedFindings);

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.ok(projection.findings.some((finding) => finding.id === "reject_option_missing_or_hidden"));
  assert.ok(projection.findings.some((finding) => finding.id === "asymmetric_consent_ui"));
  assert.ok(!projection.findings.some((finding) => finding.id === "forced_consent_interaction"));
  assert.ok(projection.findings.some((finding) => finding.id === "consent_dark_patterns_detected"));
  assert.ok(!weakState.globalUnifiedFindings.some((finding) => finding.unifiedFindingId === "reject_button_missing"));
  assert.ok(!weakState.globalUnifiedFindings.some((finding) => finding.unifiedFindingId === "accept_more_prominent_than_reject"));
  assert.ok(!weakState.globalUnifiedFindings.some((finding) => finding.unifiedFindingId === "forced_consent_wall"));
});

test("runtime reject path depth promotes forced consent only with retained blocking evidence", () => {
  const state = buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: [],
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    primaryPolicyEnrichment: null,
    runtimeArtifacts: {
      consent_actionable_choice_observed: true,
      consent_surface_observed: true,
      hybridConsentSummary: {
        pageInteractionBlocked: true
      },
      reject_path_depth_and_availability: {
        acceptClickDepth: 1,
        choiceAsymmetry: "material",
        preferencesRequiredBeforeReject: true,
        rejectAvailableOnFirstLayer: false,
        rejectClickDepth: 2
      }
    },
    scan: {},
    signalHits: [],
    signals: [],
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  } as never, {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: () => [],
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
  const projection = projectExecutiveFindingsFromUnifiedPackets(state.globalUnifiedFindings);

  assert.ok(projection.findings.some((finding) => finding.id === "forced_consent_interaction"));
});

test("high-risk gambling section review retains concrete offer and disclosure adjacency evidence", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      rendered_text:
        `DraftKings Sportsbook. Get $1,000 in bonus bets when you sign up today. Start betting now. ${"Featured games and league content. ".repeat(30)} Responsible gaming resources are available in the footer. Terms and conditions apply on a separate promotions page.`,
      third_party_request_domains: ["www.draftkings.com"]
    },
    scanReportReviewIssues: [],
    sectionId: "high_risk_product_marketing_disclosures",
    snapshot: {
      final_url: "https://www.draftkings.com/",
      registered_domain: "draftkings.com"
    }
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: issues.map((issue) => ({
      description: issue.description,
      evidence: issue.evidence ?? [],
      fallbackEvidence: issue.fallbackEvidence,
      observedValue: issue.evidence?.[0] ?? null,
      severity: issue.severity,
      sourceType: "issue",
      title: issue.title
    })),
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "high_risk_product_risk_disclosure_missing");

  assert.ok(packet?.evidence?.entities?.offerSnippets?.some((snippet) => snippet.includes("$1,000 in bonus bets")));
  assert.deepEqual(packet?.evidence?.entities?.responsibleGamblingDisclosureAdjacent, ["false"]);
  assert.deepEqual(packet?.evidence?.entities?.termsDisclosureAdjacent, ["false"]);
});

test("high-risk gambling section review retains concrete offer from page evidence rows", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [],
    pageEvidenceRows: [
      {
        evidence_id: "home-offer-1",
        matched_text: "Get $1,000 in bonus bets when you sign up today.",
        page_url: "https://www.draftkings.com/"
      }
    ],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      third_party_request_domains: ["www.draftkings.com"]
    },
    scanReportReviewIssues: [],
    sectionId: "high_risk_product_marketing_disclosures",
    snapshot: {
      final_url: "https://www.draftkings.com/",
      registered_domain: "draftkings.com"
    }
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: issues.map((issue) => ({
      description: issue.description,
      evidence: issue.evidence ?? [],
      fallbackEvidence: issue.fallbackEvidence,
      observedValue: issue.evidence?.[0] ?? null,
      severity: issue.severity,
      sourceType: "issue",
      title: issue.title
    })),
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "high_risk_product_risk_disclosure_missing");

  assert.ok(packet?.evidence?.entities?.offerSnippets?.some((snippet) => snippet.includes("$1,000 in bonus bets")));
});

test("supplemental runtime request evidence without consent timing stays out of surfaced packets", () => {
  const [packet] = buildSupplementalRuntimeUnifiedFindingPackets({
    disclaimer: "",
    hostname: "example.com",
    issueCounts: { high: 0, medium: 0, low: 0 },
    normalizedUrl: "https://www.example.com/",
    sampleFindings: [],
    summaryBullets: [],
    supplementalEvidence: {
      source: "supplemental_public_runtime",
      sourceLabel: "Supplemental public runtime evidence",
      entities: {
        cookieNames: ["_ga"],
        requestUrls: ["https://metrics.example.net/collect"],
        technologyNames: ["Google Analytics"]
      }
    },
    version: "preview-v1"
  });

  assert.equal(packet, undefined);
});

test("buildReviewFindings injects domain macro enrichment fields into fallbackEvidence", () => {
  const candidates = buildReviewFindings({
    issues: [],
    macroEnrichment: {
      normalized_output_json: {
        industry_primary: "finance",
        monetization_signals: {
          investor_or_securities_promotion: true
        }
      }
    },
    prioritizedAccessibilityRuleRows: [],
    sectionId: "tracking_third_party_ecosystem",
    sectionItems: [
      {
        key: "commerce.session_replay_tool_detected",
        label: "Session replay tool detected",
        relation: "primary",
        source: "snapshot_signal",
        value: true
      }
    ],
    trackerVendors: [
      {
        beforeConsent: true,
        collectionEndpointType: "first_party_collection_proxy",
        confidence: 0.95,
        detectionSource: "request",
        firstPartyOrThirdParty: "first_party",
        matchedSignatureId: "fullstory",
        scriptHost: "www.example.com",
        vendorCategory: "session_replay",
        vendorName: "FullStory"
      }
    ]
  });

  const candidate = candidates.find((c) => c.signalKey === "commerce.session_replay_tool_detected");
  assert.equal(candidate?.fallbackEvidence?.domainIndustryPrimary, "finance");
  assert.equal(candidate?.fallbackEvidence?.investorOrSecuritiesPromotion, true);
});

test("buildReviewFindings omits domain macro fields when macroEnrichment is absent", () => {
  const candidates = buildReviewFindings({
    issues: [],
    prioritizedAccessibilityRuleRows: [],
    sectionId: "tracking_third_party_ecosystem",
    sectionItems: [
      {
        key: "commerce.session_replay_tool_detected",
        label: "Session replay tool detected",
        relation: "primary",
        source: "snapshot_signal",
        value: true
      }
    ],
    trackerVendors: [
      {
        beforeConsent: true,
        collectionEndpointType: "first_party_collection_proxy",
        confidence: 0.95,
        detectionSource: "request",
        firstPartyOrThirdParty: "first_party",
        matchedSignatureId: "fullstory",
        scriptHost: "www.example.com",
        vendorCategory: "session_replay",
        vendorName: "FullStory"
      }
    ]
  });

  const candidate = candidates.find((c) => c.signalKey === "commerce.session_replay_tool_detected");
  assert.equal(candidate?.fallbackEvidence?.domainIndustryPrimary, null);
  assert.equal(candidate?.fallbackEvidence?.investorOrSecuritiesPromotion, null);
});
