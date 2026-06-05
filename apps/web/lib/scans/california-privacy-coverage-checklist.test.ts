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
  assert.equal(optOutRow?.criticalEvidence.evidenceFamily, "sale_share_control");
  assert.equal(optOutRow?.criticalEvidence.pipeline.projectionStage, "unified_finding");
  assert.equal(optOutRow?.criticalEvidence.projectedFindings[0]?.id, "cpra_cba_opt_out_missing");

  const rightsRow = items.find((item) => item.id === "consumer_rights_request_methods");
  assert.equal(rightsRow?.status, "not_observed");
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
  assert.deepEqual(optOutRow?.evidenceRefs, ["Do Not Sell/Share path observed"]);
});

test("deriveCaliforniaPrivacyCoverageChecklist marks fallback rows not testable when coverage is limited", () => {
  const items = deriveCaliforniaPrivacyCoverageChecklist({
    coverageLimited: true,
    scanCompleted: true,
    unifiedFindings: []
  });

  assert.equal(items.length, 12);
  assert.equal(items.every((item) => item.status === "not_testable"), true);
  assert.equal(
    items.every((item) => item.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) => gap.field === "scanner.californiaPrivacyEvidence")),
    true
  );
});
