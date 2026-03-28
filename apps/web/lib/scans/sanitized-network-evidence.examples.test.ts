import assert from "node:assert/strict";
import test from "node:test";

import { POLICY_BEHAVIOR_CONFLICT_FIXTURES } from "./policy-behavior-conflict.fixtures";
import { evaluatePolicyBehaviorConflictContract } from "./promotion-evidence-contracts";
import {
  buildSanitizedNetworkEvidenceAuditRecord,
  hasConcreteSanitizedNetworkEvidence
} from "./sanitized-network-evidence";
import { buildUnifiedFindingPackets } from "./unified-findings";

test("example 1: sanitized HAR-like GPC artifact validates as contradiction-grade runtime proof", () => {
  const sanitizedHarLike = buildSanitizedNetworkEvidenceAuditRecord(
    {
      entries: [
        {
          evidenceKind: "request",
          matchedVendor: "Meta Pixel",
          pageUrl: "https://www.example.com/",
          requestUrlSanitized: "https://www.facebook.com/tr?[REDACTED]",
          runtimePhase: "gpc_enabled"
        }
      ],
      summary: {
        gpc: {
          matchedVendorCount: 1,
          requestCount: 1
        }
      }
    },
    {
      capturedAt: "2026-03-27T01:00:00.000Z",
      sourceWindowEndedAt: "2026-03-27T01:00:02.000Z",
      sourceWindowStartedAt: "2026-03-27T00:59:58.000Z"
    }
  );

  const decision = evaluatePolicyBehaviorConflictContract({
    contradictionEvidence: {
      ...POLICY_BEHAVIOR_CONFLICT_FIXTURES.negativeRuntimeEmpty.contradictionEvidence,
      conflictBridge: {
        conflictType: "declared_opt_out_honored_but_tracking_persisted_under_opt_out",
        reasoning: "The policy says GPC is honored, and the sanitized retained request still shows Meta Pixel activity in the GPC-enabled session.",
        supportsPromotion: true
      },
      evidenceSufficiency: {
        conflictBridgePresent: true,
        policyAnchorPresent: true,
        promotionEligible: true,
        reviewStatus: "complete",
        runtimeAnchorPresent: true
      }
    },
    sanitizedNetworkEvidence: sanitizedHarLike
  });

  assert.equal(hasConcreteSanitizedNetworkEvidence({ sanitizedNetworkEvidence: sanitizedHarLike }, { runtimePhase: "gpc_enabled" }), true);
  assert.equal(typeof sanitizedHarLike.artifactSha256, "string");
  assert.equal(decision?.promotionEligibility, "eligible");
  assert.equal(decision?.externalSurfacingEligibility, "eligible");
});

test("example 2: sanitized HAR-like hash shell stays weak without retained request-level proof", () => {
  const sanitizedHarLike = buildSanitizedNetworkEvidenceAuditRecord(
    {
      entries: [],
      summary: {
        preconsent: {
          requestCount: 0
        }
      }
    },
    {
      capturedAt: "2026-03-27T02:00:00.000Z"
    }
  );

  const [packet] = buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "Observed before a clear user choice was made.",
        fallbackEvidence: {
          sanitizedNetworkEvidence: sanitizedHarLike,
          signalKey: "privacy.preconsent_tracking_detected",
          signalValue: true
        },
        observedValue: "Yes",
        severity: "high",
        signalKey: "privacy.preconsent_tracking_detected",
        signalLabel: "Pre-consent tracking detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Pre-consent tracking detected"
      }
    ],
    validationFindings: []
  });

  assert.equal(typeof sanitizedHarLike.artifactSha256, "string");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, false);
  assert.ok(packet?.evidence?.flags?.includes("sanitized_network_evidence_hashed"));
});
