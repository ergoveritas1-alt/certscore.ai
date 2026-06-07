import assert from "node:assert/strict";
import test from "node:test";

import { deriveCaliforniaPrivacyCoverageChecklist } from "./california-privacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function makePacket(id: string, title = id): UnifiedFindingDisplayPacket {
  return {
    affectedPageCount: 1,
    categoryAlignments: [],
    confidenceBand: "moderate",
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: false,
      hasCorroboratedPositiveSurfaceEvidence: false,
      hasDirectRuntimeEvidence: true,
      hasKeyPageDiscoveryEvidence: false,
      hasMultipleHumanFacingUrls: false,
      hasPacketBackedEvidence: true,
      hasPageAttribution: true,
      hasPolicyTextEvidence: false,
      hasReadableSurfaceSnippetEvidence: false,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 1,
      sourceCount: 1,
      sourceKinds: ["signal"],
      validationCount: 0
    },
    evidence: {
      entities: { vendors: ["Meta"] },
      flags: [`privacy.${id}`]
    },
    presentation: { findingName: title },
    primaryPageUrl: "https://example.test/",
    severity: "high",
    sourceRefs: [{ kind: "signal", key: `privacy.${id}`, source: "runtime_artifact_signal" }],
    summary: title,
    title,
    unifiedFindingId: id
  } as unknown as UnifiedFindingDisplayPacket;
}

test("deriveCaliforniaPrivacyCoverageChecklist projects canonical CPRA findings into machine status rows", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [makePacket("cpra_cba_opt_out_missing", "CPRA opt-out review")],
    projectedFindings: [{ id: "cpra_cba_opt_out_missing", label: "CPRA opt-out review" }]
  });

  const optOutRow = items.find((item) => item.id === "do_not_sell_share_availability");
  assert.equal(optOutRow?.status, "potential_gap");
  assert.equal(optOutRow?.statusLabel, "Potential gap");
  assert.equal(optOutRow?.assessmentStatus, "gap_observed");
  assert.equal(optOutRow?.evidenceState, "observed");
  assert.equal(optOutRow?.criticalEvidence.evidenceFamily, "sale_share_control");
  assert.equal(optOutRow?.criticalEvidence.pipeline.projectionStage, "unified_finding");
  assert.equal(optOutRow?.criticalEvidence.projectedFindings[0]?.id, "cpra_cba_opt_out_missing");

  const rightsRow = items.find((item) => item.id === "consumer_rights_request_methods");
  assert.equal(rightsRow?.status, "not_observed");
  assert.equal(rightsRow?.assessmentStatus, "checked");
  assert.equal(rightsRow?.evidenceState, "not_observed");
  assert.equal(items.length, 14);
});

test("deriveCaliforniaPrivacyCoverageChecklist withholds rows for non-representative scan projection", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: true,
    scanCompleted: true,
    unifiedFindings: [makePacket("scan_quality_visual_no_go", "Normal public site was not reached")],
    withholdForNonRepresentativeScan: true
  });

  assert.deepEqual(items, []);
});

test("deriveCaliforniaPrivacyCoverageChecklist withholds deep-check-only rows when California runtime was not requested", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    scanCompleted: true,
    unifiedFindings: [],
    withholdDeepCheckOnlyRows: true
  });

  assert.equal(items.some((item) => item.id === "gpc_opt_out_signal_handling"), false);
  assert.equal(items.some((item) => item.id === "post_opt_out_tracking_behavior"), false);
  assert.equal(items.length, 12);
});

test("deriveCaliforniaPrivacyCoverageChecklist uses explicit policy outcomes over unified fallback rows", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      do_not_sell_share_availability: {
        criticalEvidence: {
          evidenceFamily: "sale_share_control",
          missingOrIncompleteSourceSignals: [],
          pipeline: {
            concernPolicyKey: "california_privacy_coverage.do_not_sell_share_availability.observed",
            projectionStage: "coverage_policy",
            regulatoryReviewArea: "california_ccpa_cpra",
            wc01NormalizedConcernKey: "california_privacy.coverage.do_not_sell_share_availability",
            ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
          },
          projectedFindings: [],
          retainedEvidence: { doNotSellSharePathObserved: true },
          statusBasis: "Explicit policy outcome"
        },
        evidenceRefs: ["Do Not Sell/Share path observed"],
        limitation: "Explicit policy outcome",
        rowId: "do_not_sell_share_availability",
        status: "observed"
      }
    },
    scanCompleted: true,
    unifiedFindings: [makePacket("cpra_cba_opt_out_missing", "CPRA opt-out review")]
  });

  const optOutRow = items.find((item) => item.id === "do_not_sell_share_availability");
  assert.equal(optOutRow?.status, "observed");
  assert.equal(optOutRow?.statusLabel, "Observed");
  assert.equal(optOutRow?.assessmentStatus, "checked");
  assert.equal(optOutRow?.evidenceState, "observed");
  assert.deepEqual(optOutRow?.evidenceRefs, ["Do Not Sell/Share path observed"]);
});

test("deriveCaliforniaPrivacyCoverageChecklist maps missing controls to gap observed plus not observed evidence state", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      do_not_sell_share_availability: {
        criticalEvidence: {
          evidenceFamily: "sale_share_control",
          missingOrIncompleteSourceSignals: [],
          pipeline: {
            concernPolicyKey: "california_privacy_coverage.do_not_sell_share_availability.potential_gap",
            projectionStage: "coverage_policy",
            regulatoryReviewArea: "california_ccpa_cpra",
            wc01NormalizedConcernKey: "california_privacy.coverage.do_not_sell_share_availability",
            ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
          },
          projectedFindings: [],
          retainedEvidence: {
            doNotSellSharePathObserved: false,
            targetedAdvertisingSignalsObserved: true
          },
          statusBasis: "Targeted advertising signals were retained, but no opt-out path was observed."
        },
        evidenceRefs: ["Targeted advertising signals observed", "Do Not Sell/Share path not observed"],
        limitation: "Targeted advertising signals were retained, but no opt-out path was observed.",
        rowId: "do_not_sell_share_availability",
        status: "potential_gap"
      }
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const optOutRow = items.find((item) => item.id === "do_not_sell_share_availability");
  assert.equal(optOutRow?.assessmentStatus, "gap_observed");
  assert.equal(optOutRow?.evidenceState, "not_observed");
  assert.match(optOutRow?.note ?? "", /no opt-out path/i);
});

test("deriveCaliforniaPrivacyCoverageChecklist maps sale-share vendor mismatch review to not observed evidence state", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      do_not_sell_share_availability: {
        criticalEvidence: {
          evidenceFamily: "sale_share_control",
          missingOrIncompleteSourceSignals: [],
          pipeline: {
            concernPolicyKey: "california_privacy_coverage.do_not_sell_share_availability.review_signal",
            projectionStage: "coverage_policy",
            regulatoryReviewArea: "california_ccpa_cpra",
            wc01NormalizedConcernKey: "california_privacy.coverage.do_not_sell_share_availability",
            ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
          },
          projectedFindings: [],
          retainedEvidence: {
            advertisingSharingVendorLabelsRetained: ["Meta Pixel"],
            doNotSellSharePathObserved: false,
            runtimeThirdPartyAdtechObserved: false,
            runtimeVendorRequestUrlCoherence: "mismatch",
            unmatchedAdvertisingSharingVendorLabels: ["Meta Pixel"]
          },
          statusBasis: "A possible advertising-sharing vendor label was retained, but CertScore did not verify matching third-party sale/share request URLs or a CPRA opt-out path in the tested web context."
        },
        evidenceRefs: ["Do Not Sell/Share path requires review"],
        limitation: "A possible advertising-sharing vendor label was retained, but CertScore did not verify matching third-party sale/share request URLs or a CPRA opt-out path in the tested web context.",
        rowId: "do_not_sell_share_availability",
        status: "review_signal"
      }
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const optOutRow = items.find((item) => item.id === "do_not_sell_share_availability");
  assert.equal(optOutRow?.status, "review_signal");
  assert.equal(optOutRow?.assessmentStatus, "review_signal");
  assert.equal(optOutRow?.evidenceState, "not_observed");
});

test("deriveCaliforniaPrivacyCoverageChecklist maps targeted advertising vendor mismatch review to not observed evidence state", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      targeted_advertising_signals: {
        criticalEvidence: {
          evidenceFamily: "adtech_sharing_runtime",
          missingOrIncompleteSourceSignals: [],
          pipeline: {
            concernPolicyKey: "california_privacy_coverage.targeted_advertising_signals.review_signal",
            projectionStage: "coverage_policy",
            regulatoryReviewArea: "california_ccpa_cpra",
            wc01NormalizedConcernKey: "california_privacy.coverage.targeted_advertising_signals",
            ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
          },
          projectedFindings: [],
          retainedEvidence: {
            advertisingSharingVendorLabelsRetained: ["Meta Pixel"],
            runtimeThirdPartyAdtechObserved: false,
            runtimeVendorRequestUrlCoherence: "mismatch",
            unmatchedAdvertisingSharingVendorLabels: ["Meta Pixel"]
          },
          statusBasis: "A possible advertising-sharing vendor label was retained, but request URLs did not verify qualifying third-party targeted-advertising runtime evidence."
        },
        evidenceRefs: ["Targeted advertising signal requires review"],
        limitation: "A possible advertising-sharing vendor label was retained, but request URLs did not verify qualifying third-party targeted-advertising runtime evidence.",
        rowId: "targeted_advertising_signals",
        status: "review_signal"
      }
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const targetedAdvertisingRow = items.find((item) => item.id === "targeted_advertising_signals");
  assert.equal(targetedAdvertisingRow?.status, "review_signal");
  assert.equal(targetedAdvertisingRow?.assessmentStatus, "review_signal");
  assert.equal(targetedAdvertisingRow?.evidenceState, "not_observed");
});

test("deriveCaliforniaPrivacyCoverageChecklist maps not applicable away from CCPA UI posture", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      limit_use_sensitive_pi: {
        criticalEvidence: {
          evidenceFamily: "sensitive_pi",
          missingOrIncompleteSourceSignals: [],
          pipeline: {
            concernPolicyKey: "california_privacy_coverage.limit_use_sensitive_pi.not_applicable",
            projectionStage: "coverage_policy",
            regulatoryReviewArea: "california_ccpa_cpra",
            wc01NormalizedConcernKey: "california_privacy.coverage.limit_use_sensitive_pi",
            ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
          },
          projectedFindings: [],
          retainedEvidence: { sensitivePiContextObserved: false },
          statusBasis: "No sensitive PI context was observed in the tested public-web context."
        },
        evidenceRefs: ["No sensitive PI context observed"],
        limitation: "No sensitive PI context was observed in the tested public-web context.",
        rowId: "limit_use_sensitive_pi",
        status: "not_applicable"
      }
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const sensitiveRow = items.find((item) => item.id === "limit_use_sensitive_pi");
  assert.equal(sensitiveRow?.status, "not_applicable");
  assert.equal(sensitiveRow?.assessmentStatus, "checked");
  assert.equal(sensitiveRow?.evidenceState, "not_observed");
});

test("deriveCaliforniaPrivacyCoverageChecklist labels observed CIPA rows as review signals", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes: {
      cipa_sensitive_interaction_recording: {
        rowId: "cipa_sensitive_interaction_recording",
        status: "observed",
        limitation: "CIPA-sensitive interaction recording risk signal was retained with direct collection-endpoint and third-party receipt evidence for CIPA review; CertScore treats this as a review signal, not a legal conclusion.",
        evidenceRefs: ["CIPA-sensitive interaction recording risk signal"],
        criticalEvidence: {
          evidenceFamily: "cipa_interaction_recording",
          missingOrIncompleteSourceSignals: [],
          pipeline: {
            concernPolicyKey: "california_privacy_coverage.cipa_sensitive_interaction_recording.observed",
            projectionStage: "coverage_policy",
            regulatoryReviewArea: "california_ccpa_cpra",
            wc01NormalizedConcernKey: "california_privacy.coverage.cipa_sensitive_interaction_recording",
            ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
          },
          projectedFindings: [],
          retainedEvidence: {
            collectionEndpointObserved: true,
            directEvidenceObserved: true,
            legalConclusion: false,
            thirdPartyReceiptObserved: true
          },
          statusBasis: "CIPA-sensitive interaction recording risk signal was retained with direct collection-endpoint and third-party receipt evidence for CIPA review; CertScore treats this as a review signal, not a legal conclusion."
        }
      }
    },
    scanCompleted: true,
    unifiedFindings: []
  });

  const row = items.find((item) => item.id === "cipa_sensitive_interaction_recording");
  assert.equal(row?.statusLabel, "Observed - Review signal");
  assert.equal(row?.assessmentStatus, "review_signal");
});


test("deriveCaliforniaPrivacyCoverageChecklist marks fallback rows not testable when coverage is limited", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: true,
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(items.length, 14);
  assert.equal(items.every((item) => item.status === "not_testable"), true);
  assert.equal(items.every((item) => item.assessmentStatus === "needs_evidence"), true);
  assert.equal(items.every((item) => item.evidenceState === "not_testable"), true);
  assert.equal(
    items.every((item) => item.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) => gap.field === "scanner.californiaPrivacyEvidence")),
    true
  );
});
