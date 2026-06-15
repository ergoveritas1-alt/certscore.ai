import assert from "node:assert/strict";
import test from "node:test";
import type { RegulatoryReviewOutput } from "@certscore/contracts";
import { regulatoryReviewToProductionChecklistModel } from "./regulatory-review-beta-adapter";

test("maps review-engine regulatory rows into production regulatory checklist cards", () => {
  const checklist = regulatoryReviewToProductionChecklistModel(regulatoryReviewFixture());

  assert.equal(checklist.gdprEprivacyItems.length, 6);
  assert.equal(checklist.californiaPrivacyItems.length, 5);
  assert.equal(checklist.gdprEprivacyItems[0]?.id, "pre_consent_third_party_tracking");
  assert.equal(checklist.gdprEprivacyItems[0]?.status, "Gap observed");
  assert.equal(checklist.gdprEprivacyItems[0]?.assessmentStatus, "gap_observed");
  assert.equal(checklist.gdprEprivacyItems[0]?.evidenceRefs[0], "net_ga_collect");
  assert.equal(checklist.gdprEprivacyItems[0]?.debugConfidence.score, 7);
  assert.deepEqual(checklist.gdprEprivacyItems[0]?.debugConfidence.improveConfidence.slice(0, 2), [
    "Retain request timing relative to consent state",
    "Resolve vendor and purpose for third-party endpoints",
  ]);
  const postRejectTracking = checklist.gdprEprivacyItems.find((item) => item.id === "post_reject_tracking_reduction");
  assert.equal(postRejectTracking?.status, "Review signal");
  assert.equal(postRejectTracking?.debugConfidence.score, 8);
  assert.equal(
    postRejectTracking?.debugConfidence.improveConfidence.includes(
      "Tighten the scanner evidence contract for this coverage area",
    ),
    false,
  );
  assert.equal(checklist.gdprEprivacyItems[1]?.status, "Observed");
  const cookieNotice = checklist.gdprEprivacyItems.find((item) => item.id === "cookie_notice_availability");
  assert.equal(cookieNotice?.status, "Observed");
  assert.equal(cookieNotice?.debugConfidence.score, 9);
  assert.ok(
    cookieNotice?.debugConfidence.improveConfidence.includes(
      "Retain a bounded cookie notice or cookie policy excerpt",
    ),
  );
  const preferenceWithdrawal = checklist.gdprEprivacyItems.find((item) => item.id === "preference_withdrawal_control");
  assert.equal(preferenceWithdrawal?.status, "Observed");
  assert.equal(preferenceWithdrawal?.debugConfidence.score, 9);
  assert.ok(
    preferenceWithdrawal?.debugConfidence.improveConfidence.includes(
      "Retain evidence that preferences can be reopened after initial choice",
    ),
  );
  const vendorAlignment = checklist.gdprEprivacyItems.find((item) => item.id === "policy_runtime_vendor_alignment_review");
  assert.equal(vendorAlignment?.status, "Review signal");
  assert.equal(vendorAlignment?.debugConfidence.score, 8);
  assert.ok(
    vendorAlignment?.debugConfidence.improveConfidence.includes(
      "Fetch policy surfaces with vendor mentions",
    ),
  );
  assert.equal(checklist.californiaPrivacyItems[0]?.id, "privacy_notice_availability");
  assert.equal(checklist.californiaPrivacyItems[0]?.status, "observed");
  const doNotSellShare = checklist.californiaPrivacyItems.find((item) => item.id === "do_not_sell_share_availability");
  assert.equal(doNotSellShare?.status, "observed");
  assert.equal(doNotSellShare?.debugConfidence.score, 8);
  assert.ok(
    doNotSellShare?.debugConfidence.improveConfidence.includes(
      "Retain an explicit Do Not Sell/Share or privacy choices path",
    ),
  );
  const gpcHandling = checklist.californiaPrivacyItems.find((item) => item.id === "gpc_opt_out_signal_handling");
  assert.equal(gpcHandling?.status, "observed");
  assert.equal(gpcHandling?.debugConfidence.score, 8);
  assert.ok(
    gpcHandling?.debugConfidence.improveConfidence.includes(
      "Retain a GPC-enabled scan comparison and disclosure evidence",
    ),
  );
  const targetedAdvertising = checklist.californiaPrivacyItems.find((item) => item.id === "targeted_advertising_signals");
  assert.equal(targetedAdvertising?.status, "review_signal");
  assert.equal(targetedAdvertising?.debugConfidence.score, 7);
  assert.ok(
    targetedAdvertising?.debugConfidence.improveConfidence.includes(
      "Retain adtech vendor purpose and third-party request evidence",
    ),
  );
  const postOptOutTracking = checklist.californiaPrivacyItems.find((item) => item.id === "post_opt_out_tracking_behavior");
  assert.equal(postOptOutTracking?.status, "review_signal");
  assert.equal(postOptOutTracking?.debugConfidence.score, 7);
  assert.ok(
    postOptOutTracking?.debugConfidence.improveConfidence.includes(
      "Capture opt-out interaction and post-choice tracking deltas",
    ),
  );
});

test("maps missing regulatory output to safe not-testable production checklist rows", () => {
  const checklist = regulatoryReviewToProductionChecklistModel(null);

  assert.equal(checklist.gdprEprivacyItems.length, 1);
  assert.equal(checklist.californiaPrivacyItems.length, 1);
  assert.equal(checklist.gdprEprivacyItems[0]?.status, "Not testable");
  assert.equal(checklist.californiaPrivacyItems[0]?.status, "not_testable");
  assert.equal(checklist.gdprEprivacyItems[0]?.debugConfidence.score, 1);
  assert.match(checklist.gdprEprivacyItems[0]?.debugConfidence.improveConfidence.join(" ") ?? "", /Retain display-safe source evidence/);
  assert.match(checklist.gdprEprivacyItems[0]?.note ?? "", /not available for this v2 scan artifact/);
  assert.match(checklist.californiaPrivacyItems[0]?.note ?? "", /not available for this v2 scan artifact/);
});

test("post-opt-out tracking debug confidence reaches 9 only for complete opt-out evidence", () => {
  const completeDoNotSellChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "post_opt_out_tracking_behavior",
        label: "Post-opt-out tracking behavior",
        note: "Advertising-purpose runtime comparison evidence persisted after opt-out.",
        status: "review_signal",
        evidenceCapability: "near_term_supported",
        evidenceRefs: [
          "Do Not Sell/Share attempt",
          "Do Not Sell/Share action proof",
          "Post-opt-out advertising comparison",
          "Advertising cookie persisted after opt-out",
        ],
        regulatoryMapping: [],
        sourceFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
        missingOrIncompleteSourceSignals: [],
      }],
    }],
  });
  const completeGpcChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "post_opt_out_tracking_behavior",
        label: "Post-opt-out tracking behavior",
        note: "Advertising-purpose runtime comparison evidence was suppressed after GPC opt-out.",
        status: "review_signal",
        evidenceCapability: "near_term_supported",
        evidenceRefs: [
          "net_post_opt_out_gpc_probe_doubleclick_suppressed",
          "Post-opt-out GPC advertising suppression comparison",
          "Advertising cookie suppressed after GPC opt-out",
        ],
        regulatoryMapping: [],
        sourceFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
        missingOrIncompleteSourceSignals: [],
      }],
    }],
  });
  const incompleteChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "post_opt_out_tracking_behavior",
        label: "Post-opt-out tracking behavior",
        note: "Advertising-purpose runtime comparison evidence persisted after opt-out.",
        status: "review_signal",
        evidenceCapability: "near_term_supported",
        evidenceRefs: ["ad_comparison_ref", "ad_vendor_ref"],
        regulatoryMapping: [],
        sourceFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
        missingOrIncompleteSourceSignals: [],
      }],
    }],
  });

  assert.equal(completeDoNotSellChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 9);
  assert.equal(completeDoNotSellChecklist.californiaPrivacyItems[0]?.status, "review_signal");
  assert.equal(completeGpcChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 9);
  assert.equal(completeGpcChecklist.californiaPrivacyItems[0]?.status, "review_signal");
  assert.equal(incompleteChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 7);
});

test("debug confidence suggestions are row-aware for missing scanner coverage", () => {
  const checklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [
      {
        ...regulatoryReviewFixture().areas[0]!,
        rows: [
          {
            id: "cookie_notice_availability",
            label: "Cookie notice availability",
            note: "The retained scan context did not support testing cookie notice availability.",
            status: "not_testable",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: [],
            missingOrIncompleteSourceSignals: [
              "Missing or incomplete policySurfaceScanner coverage.",
              "Policy-surface scanner did not run, so policy/runtime mismatch findings are out of scope.",
              "required_source_module_not_run",
            ],
          },
          {
            id: "reject_all_path_availability",
            label: "Decline / reject option availability",
            note: "Reject-path availability was not resolved from retained consent-surface evidence.",
            status: "not_testable",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: [],
            missingOrIncompleteSourceSignals: [
              "Missing or incomplete consentFlowRuntimeScanner coverage.",
              "required_source_module_not_run",
            ],
          },
        ],
      },
      {
        ...regulatoryReviewFixture().areas[1]!,
        rows: [
          {
            id: "do_not_sell_share_availability",
            label: "Do Not Sell or Share availability",
            note: "The retained scan context did not support testing sale/share opt-out availability.",
            status: "not_testable",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: [],
            missingOrIncompleteSourceSignals: [
              "Missing or incomplete policySurfaceScanner coverage.",
              "required_source_module_not_run",
            ],
          },
          {
            id: "gpc_opt_out_signal_handling",
            label: "GPC / opt-out signal handling",
            note: "The retained scan context did not support testing GPC signal handling.",
            status: "not_testable",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: [],
            missingOrIncompleteSourceSignals: [
              "Missing or incomplete consentFlowRuntimeScanner coverage.",
              "required_source_module_not_run",
            ],
          },
        ],
      },
    ],
  });

  const cookieNotice = checklist.gdprEprivacyItems.find((item) => item.id === "cookie_notice_availability");
  assert.equal(cookieNotice?.debugConfidence.score, 1);
  assert.deepEqual(cookieNotice?.debugConfidence.improveConfidence, [
    "Run policy-surface coverage for cookie notice or cookie policy evidence",
    "Retain a bounded cookie notice or cookie policy excerpt",
    "Retain the cookie notice URL and link text",
  ]);

  const rejectPath = checklist.gdprEprivacyItems.find((item) => item.id === "reject_all_path_availability");
  assert.equal(rejectPath?.debugConfidence.score, 1);
  assert.deepEqual(rejectPath?.debugConfidence.improveConfidence, [
    "Run consent-flow coverage for reject/decline path evidence",
    "Retain successful reject-path interaction evidence",
    "Retain whether reject was equally reachable from the first layer",
  ]);

  const doNotSellShare = checklist.californiaPrivacyItems.find((item) => item.id === "do_not_sell_share_availability");
  assert.equal(doNotSellShare?.debugConfidence.score, 1);
  assert.deepEqual(doNotSellShare?.debugConfidence.improveConfidence, [
    "Run policy-surface coverage for sale/share opt-out evidence",
    "Retain an explicit Do Not Sell/Share or privacy choices path",
  ]);

  const gpcHandling = checklist.californiaPrivacyItems.find((item) => item.id === "gpc_opt_out_signal_handling");
  assert.equal(gpcHandling?.debugConfidence.score, 1);
  assert.deepEqual(gpcHandling?.debugConfidence.improveConfidence, [
    "Run GPC-enabled runtime coverage for opt-out signal handling",
    "Retain a GPC-enabled scan comparison and disclosure evidence",
  ]);
});

test("notice at collection debug confidence reflects evidence richness and missing context", () => {
  const strongChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "notice_at_collection",
        label: "Notice at collection",
        note: "A dedicated Notice at Collection surface was observed in retained policy evidence.",
        status: "checked",
        evidenceCapability: "near_term_supported",
        evidenceRefs: [
          "policy_notice_excerpt",
          "Notice at Collection link: Notice at Collection",
          "Notice at Collection URL: example.com/privacy/notice-at-collection",
        ],
        regulatoryMapping: [],
        sourceFindingKeys: ["notice_at_collection_observed"],
        missingOrIncompleteSourceSignals: [],
      }],
    }],
  });
  const genericChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "notice_at_collection",
        label: "Notice at collection",
        note: "A generic privacy policy mentioned notice at collection.",
        status: "checked",
        evidenceCapability: "near_term_supported",
        evidenceRefs: ["policy_notice_excerpt"],
        regulatoryMapping: [],
        sourceFindingKeys: ["notice_at_collection_observed"],
        missingOrIncompleteSourceSignals: ["contextual_notice_at_collection_surface"],
      }],
    }],
  });

  assert.equal(strongChecklist.californiaPrivacyItems[0]?.id, "notice_at_collection");
  assert.equal(strongChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 8);
  assert.equal(genericChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 6);
  assert.equal(
    genericChecklist.californiaPrivacyItems[0]?.debugConfidence.improveConfidence[0],
    "Retain a collection-context notice surface near data-entry evidence",
  );
});

test("policy evidence-contract suggestions are specific for notice, cookie, and sale/share rows", () => {
  const checklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [
      {
        ...regulatoryReviewFixture().areas[0]!,
        rows: [{
          id: "cookie_notice_availability",
          label: "Cookie notice availability",
          note: "Cookie notice evidence was incomplete.",
          status: "checked",
          evidenceCapability: "currently_supported",
          evidenceRefs: ["cookie_settings_link"],
          regulatoryMapping: [],
          sourceFindingKeys: ["cookie_policy_observed_or_not_observed"],
          missingOrIncompleteSourceSignals: [
            "cookie_policy_surface",
            "bounded_cookie_policy_or_cookie_notice",
            "cookie_specific_notice_surface",
          ],
        }],
      },
      {
        ...regulatoryReviewFixture().areas[1]!,
        rows: [
          {
            id: "notice_at_collection",
            label: "Notice at collection",
            note: "Notice at Collection evidence was incomplete.",
            status: "not_testable",
            evidenceCapability: "near_term_supported",
            evidenceRefs: ["notice_at_collection_row_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["notice_at_collection_observed"],
            missingOrIncompleteSourceSignals: ["policy_topic:notice_at_collection"],
          },
          {
            id: "do_not_sell_share_availability",
            label: "Do Not Sell or Share availability",
            note: "Sale/share opt-out evidence was incomplete.",
            status: "checked",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["privacy_choices_link"],
            regulatoryMapping: [],
            sourceFindingKeys: ["do_not_sell_or_share_link_observed"],
            missingOrIncompleteSourceSignals: [
              "do_not_sell_or_share_surface",
              "sale_share_or_opt_out_context",
            ],
          },
        ],
      },
    ],
  });

  const cookieNotice = checklist.gdprEprivacyItems.find((item) => item.id === "cookie_notice_availability");
  assert.deepEqual(cookieNotice?.debugConfidence.improveConfidence, [
    "Retain a cookie notice or cookie policy surface",
    "Retain a bounded cookie notice or cookie policy excerpt",
    "Retain a cookie-specific notice surface",
  ]);

  const noticeAtCollection = checklist.californiaPrivacyItems.find((item) => item.id === "notice_at_collection");
  assert.deepEqual(noticeAtCollection?.debugConfidence.improveConfidence, [
    "Retain a dedicated Notice at Collection surface or topic",
    "Capture collection-context page evidence near forms or data-entry surfaces",
    "Tighten the scanner evidence contract for this coverage area",
  ]);

  const doNotSellShare = checklist.californiaPrivacyItems.find((item) => item.id === "do_not_sell_share_availability");
  assert.deepEqual(doNotSellShare?.debugConfidence.improveConfidence, [
    "Retain an explicit Do Not Sell/Share or privacy choices path",
    "Retain sale/share or opt-out context for the privacy choices path",
  ]);
});

test("GPC debug confidence names missing corroborators separately", () => {
  const checklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "gpc_opt_out_signal_handling",
        label: "GPC / opt-out signal handling",
        note: "A GPC runtime probe was retained with incomplete disclosure and recognition context.",
        status: "checked",
        evidenceCapability: "near_term_supported",
        evidenceRefs: ["gpc_probe_ref"],
        regulatoryMapping: [],
        sourceFindingKeys: ["gpc_runtime_probe_with_disclosure_observed"],
        missingOrIncompleteSourceSignals: [
          "bounded_gpc_disclosure_excerpt",
          "gpc_request_header_marker",
          "gpc_handling_recognition_proof",
        ],
      }],
    }],
  });

  const gpcHandling = checklist.californiaPrivacyItems.find((item) => item.id === "gpc_opt_out_signal_handling");

  assert.equal(gpcHandling?.debugConfidence.score, 4);
  assert.deepEqual(gpcHandling?.debugConfidence.improveConfidence, [
    "Retain a bounded GPC disclosure excerpt",
    "Retain the GPC request header marker",
    "Retain bounded GPC handling or recognition proof",
  ]);
});

test("privacy notice debug confidence reflects bounded notice evidence", () => {
  const strongChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "privacy_notice_availability",
        label: "Privacy notice availability",
        note: "A fetched privacy notice with bounded excerpt was retained.",
        status: "checked",
        evidenceCapability: "currently_supported",
        evidenceRefs: [
          "policy_privacy_excerpt",
          "Privacy notice link: Privacy Policy",
          "Privacy notice title: Privacy Policy",
          "Privacy notice URL: example.com/privacy",
        ],
        regulatoryMapping: [],
        sourceFindingKeys: ["privacy_notice_observed_or_not_observed"],
        missingOrIncompleteSourceSignals: [],
      }],
    }],
  });
  const incompleteChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[1]!,
      rows: [{
        id: "privacy_notice_availability",
        label: "Privacy notice availability",
        note: "A privacy policy link was observed but no bounded excerpt was retained.",
        status: "checked",
        evidenceCapability: "currently_supported",
        evidenceRefs: ["Privacy Policy link"],
        regulatoryMapping: [],
        sourceFindingKeys: ["privacy_notice_observed_or_not_observed"],
        missingOrIncompleteSourceSignals: ["bounded_privacy_notice_excerpt"],
      }],
    }],
  });

  assert.equal(strongChecklist.californiaPrivacyItems[0]?.id, "privacy_notice_availability");
  assert.equal(strongChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 9);
  assert.equal(incompleteChecklist.californiaPrivacyItems[0]?.debugConfidence.score, 7);
  assert.equal(
    incompleteChecklist.californiaPrivacyItems[0]?.debugConfidence.improveConfidence[0],
    "Retain a bounded privacy notice excerpt",
  );
});

test("cross-border endpoint debug confidence requires retained endpoint location evidence", () => {
  const locatedChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[0]!,
      rows: [{
        id: "cross_border_endpoint_review",
        label: "Cross-border endpoint review",
        note: "Endpoint geography evidence was retained for observed third-party processing.",
        status: "review_signal",
        evidenceCapability: "currently_supported",
        evidenceRefs: [
          "endpoint:collector.us-east-1.amazonaws.com",
          "endpoint location:AWS US East (N. Virginia) (US)",
        ],
        regulatoryMapping: [],
        sourceFindingKeys: ["endpoint_transfer_review_signal"],
        missingOrIncompleteSourceSignals: [],
      }],
    }],
  });
  const regionOnlyChecklist = regulatoryReviewToProductionChecklistModel({
    ...regulatoryReviewFixture(),
    areas: [{
      ...regulatoryReviewFixture().areas[0]!,
      rows: [{
        id: "cross_border_endpoint_review",
        label: "Cross-border endpoint review",
        note: "Endpoint region status was observed without a retained endpoint location.",
        status: "review_signal",
        evidenceCapability: "currently_supported",
        evidenceRefs: ["endpoint:collector.us-east-1.amazonaws.com"],
        regulatoryMapping: [],
        sourceFindingKeys: ["endpoint_transfer_review_signal"],
        missingOrIncompleteSourceSignals: ["endpoint_geography_location_not_retained"],
      }],
    }],
  });

  assert.equal(locatedChecklist.gdprEprivacyItems[0]?.id, "cross_border_endpoint_review");
  assert.equal(locatedChecklist.gdprEprivacyItems[0]?.debugConfidence.score, 8);
  assert.equal(regionOnlyChecklist.gdprEprivacyItems[0]?.debugConfidence.score, 6);
  assert.equal(
    regionOnlyChecklist.gdprEprivacyItems[0]?.debugConfidence.improveConfidence[0],
    "Retain endpoint geography/location evidence",
  );
});

test("collapses strict session replay rows into one GDPR diagnostic row with subchecks", () => {
  const fixture = regulatoryReviewFixture();
  const gdprArea = fixture.areas[0]!;
  const checklist = regulatoryReviewToProductionChecklistModel({
    ...fixture,
    areas: [
      {
        ...gdprArea,
        rows: [
          {
            id: "session_replay_fingerprinting_review",
            label: "Session replay / fingerprinting review",
            note: "Session replay or behavioral analytics was observed.",
            status: "review_signal",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["Runtime vendor: Microsoft Clarity"],
            regulatoryMapping: [],
            sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "session_replay_before_consent",
            label: "Session replay before consent",
            note: "Session replay collection was retained before a recorded consent action.",
            status: "gap_observed",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["https://www.clarity.ms/tag/example"],
            regulatoryMapping: [],
            sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "session_replay_disclosure_alignment",
            label: "Session replay disclosure alignment",
            note: "Disclosure comparison evidence was not available for this scan context.",
            status: "not_testable",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
            missingOrIncompleteSourceSignals: ["Session replay vendor disclosure comparison evidence was not retained."],
          },
          {
            id: "session_replay_sensitive_surface",
            label: "Session replay on sensitive surfaces",
            note: "No same-context sensitive-surface replay signal was retained.",
            status: "not_observed",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
            missingOrIncompleteSourceSignals: ["Sensitive-surface overlap evidence was not retained for observed session replay."],
          },
          {
            id: "session_replay_after_refusal",
            label: "Session replay after refusal / opt-out",
            note: "Post-refusal session replay comparison requires successful reject or opt-out action proof.",
            status: "not_testable",
            evidenceCapability: "currently_supported",
            evidenceRefs: [],
            regulatoryMapping: [],
            sourceFindingKeys: ["session_replay_or_behavioral_analytics_observed"],
            missingOrIncompleteSourceSignals: ["Post-refusal session replay comparison requires successful reject or opt-out action proof."],
          },
        ],
      },
    ],
  });

  assert.equal(checklist.gdprEprivacyItems.length, 1);
  const sessionReplay = checklist.gdprEprivacyItems[0]!;
  assert.equal(sessionReplay.id, "session_replay_fingerprinting_review");
  assert.equal(sessionReplay.status, "Gap observed");
  assert.equal(sessionReplay.assessmentStatus, "gap_observed");
  assert.match(sessionReplay.note, /before a recorded consent action/i);
  assert.equal(sessionReplay.subchecks?.length, 4);
  assert.equal(sessionReplay.subchecks?.[0]?.label, "Before consent");
  assert.equal(sessionReplay.subchecks?.[0]?.status, "Gap observed");
  assert.equal(
    checklist.gdprEprivacyItems.some((item) => item.id === "session_replay_before_consent"),
    false,
  );
  assert.ok(sessionReplay.evidenceRefs.includes("Runtime vendor: Microsoft Clarity"));
  assert.ok(sessionReplay.evidenceRefs.includes("https://www.clarity.ms/tag/example"));
});

function regulatoryReviewFixture(): RegulatoryReviewOutput {
  return {
    reviewVersion: "certscore.v2.regulatory_review.1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    sourceReviewId: "review_scan_fixture",
    scanId: "scan_fixture",
    url: "https://example.com",
    notes: [],
    areas: [
      {
        id: "gdpr-eprivacy",
        navLabel: "GDPR / ePrivacy",
        title: "GDPR / ePrivacy",
        subtitle: "EU privacy, cookies, consent, tracking, and transparency review signals.",
        summary: "Evidence-led review only.",
        maturityLabel: "Beta",
        sourceStage: "certscore-review-engine",
        rows: [
          {
            id: "pre_consent_third_party_tracking",
            label: "Third-party tracking before consent",
            note: "Pre-consent third-party tracking requires retained request timing evidence.",
            status: "gap_observed",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["net_ga_collect"],
            regulatoryMapping: [],
            sourceFindingKeys: ["pre_consent_tracking_detected"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "consent_surface_observed",
            label: "Cookie/tracking notice or consent surface",
            note: "Cookie or tracking notice evidence must be retained from the tested context.",
            status: "checked",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["dom_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["consent_banner_observed_or_not_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "cookie_notice_availability",
            label: "Cookie notice availability",
            note: "A fetched cookie policy with bounded excerpt was retained.",
            status: "checked",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["cookie_policy_excerpt", "Cookie notice link: Cookie Policy"],
            regulatoryMapping: [],
            sourceFindingKeys: ["cookie_policy_observed_or_not_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "post_reject_tracking_reduction",
            label: "Tracking after refusal",
            note: "Comparable runtime evidence retained persisted vendors and cookies after reject.",
            status: "review_signal",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["comparison_after_reject", "vendor_persisted_after_reject"],
            regulatoryMapping: [],
            sourceFindingKeys: ["tracking_after_refusal_review_signal", "vendors_persist_after_reject_review_signal"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "preference_withdrawal_control",
            label: "Post-choice consent controls",
            note: "Runtime evidence retained a preference center that reopened and saved choices.",
            status: "checked",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["dom_preference_center", "dom_after_preference_center"],
            regulatoryMapping: [],
            sourceFindingKeys: ["post_choice_consent_control_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "policy_runtime_vendor_alignment_review",
            label: "Policy/runtime vendor alignment",
            note: "Policy evidence retained vendor mentions that overlap with runtime tracking vendors.",
            status: "review_signal",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["policy_vendor_ref", "runtime_vendor_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "consent_choice_quality",
            label: "Consent choice quality",
            note: "Older unsupported row that should not be projected.",
            status: "review_signal",
            evidenceCapability: "near_term_supported",
            evidenceRefs: ["old_consent_choice_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: [],
            missingOrIncompleteSourceSignals: [],
          },
        ],
      },
      {
        id: "california-privacy",
        navLabel: "CCPA/CPRA",
        title: "California CCPA / CPRA",
        subtitle: "California privacy notice, opt-out, sensitive-data, and runtime tracking review signals.",
        summary: "Evidence-led review only.",
        maturityLabel: "Beta",
        sourceStage: "certscore-review-engine",
        rows: [
          {
            id: "privacy_notice_availability",
            label: "Privacy notice availability",
            note: "A public privacy notice was observed in retained policy evidence.",
            status: "checked",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["policy_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["privacy_policy_present"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "targeted_advertising_signals",
            label: "Targeted advertising signals",
            note: "Advertising or cross-context tracking signals were observed before a recorded opt-out.",
            status: "review_signal",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["net_ad_pixel"],
            regulatoryMapping: [],
            sourceFindingKeys: ["targeted_advertising_runtime_signal"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "do_not_sell_share_availability",
            label: "Do Not Sell or Share availability",
            note: "A public Do Not Sell or Share opt-out path was observed in retained policy evidence.",
            status: "checked",
            evidenceCapability: "currently_supported",
            evidenceRefs: ["dns_policy_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["do_not_sell_or_share_link_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "gpc_opt_out_signal_handling",
            label: "GPC / opt-out signal handling",
            note: "A GPC disclosure and bounded GPC-enabled runtime probe were retained.",
            status: "checked",
            evidenceCapability: "near_term_supported",
            evidenceRefs: ["gpc_policy_ref", "gpc_probe_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["gpc_runtime_probe_with_disclosure_observed", "gpc_disclosure_observed"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "post_opt_out_tracking_behavior",
            label: "Post-opt-out tracking behavior",
            note: "Advertising-purpose runtime comparison evidence persisted after opt-out.",
            status: "review_signal",
            evidenceCapability: "near_term_supported",
            evidenceRefs: ["ad_comparison_ref", "ad_vendor_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: ["post_opt_out_targeted_advertising_behavior_signal"],
            missingOrIncompleteSourceSignals: [],
          },
          {
            id: "sale_share_disclosure_alignment",
            label: "Sale/share disclosure alignment",
            note: "Older unsupported row that should not be projected.",
            status: "review_signal",
            evidenceCapability: "near_term_supported",
            evidenceRefs: ["old_sale_share_ref"],
            regulatoryMapping: [],
            sourceFindingKeys: [],
            missingOrIncompleteSourceSignals: [],
          },
        ],
      },
    ],
  };
}
