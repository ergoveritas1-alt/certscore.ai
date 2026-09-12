import assert from "node:assert/strict";
import test from "node:test";

import {
  getReportableGdprEprivacyCoverageItems,
  isReportableGdprEprivacyCoverageRowId,
} from "./gdpr-eprivacy-reportable-rows";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

test("production Reject-path outcome is reportable through the canonical checklist projection", () => {
  assert.equal(isReportableGdprEprivacyCoverageRowId("post_reject_tracking_reduction"), true);
});

test("unapproved deferred rows remain outside production report projection", () => {
  assert.equal(isReportableGdprEprivacyCoverageRowId("preference_withdrawal_control"), false);
  assert.equal(isReportableGdprEprivacyCoverageRowId("analytics_vendor_observed"), false);
});

test("completed no-Reject inventory suppresses an irrelevant post-Reject limitation", () => {
  const row = {
    id: "post_reject_tracking_reduction",
    criticalEvidence: { retainedEvidence: {} },
  } as GdprEprivacyCoverageChecklistItem;
  const assessment = {
    artifactType: "consent_control_assessment",
    artifactVersion: "2.1",
    evidencePolicy: "structured_control_evidence.v1",
    visualEvidence: { status: "unavailable", artifactRefs: [], reasonCodes: [] },
    assessmentStatus: "complete",
    scan: { scanId: "scan-1", requestedUrl: null, finalUrl: null, scanStatus: "completed", noGo: false },
    document: { identityStatus: "matched", canonicalDocumentId: "doc-1", observedDocumentIds: ["doc-1"], canonicalDocumentToken: null, observedDocumentTokens: [], reasonCodes: [] },
    surface: { status: "observed_actionable", firstObservedAtMs: 10, lastObservedAtMs: 10, evidenceRefs: [] },
    controls: {
      accept: { state: "observed", layer: "first_layer", reasonCodes: [], evidenceRefs: [], firstObservedAtMs: 10, lastObservedAtMs: 10 },
      reject: { state: "not_observed", layer: "first_layer", reasonCodes: [], evidenceRefs: [], firstObservedAtMs: null, lastObservedAtMs: null },
      options: { state: "not_observed", layer: "first_layer", reasonCodes: [], evidenceRefs: [], firstObservedAtMs: null, lastObservedAtMs: null },
      privacyOptOut: { state: "not_observed", layer: "first_layer", reasonCodes: [], evidenceRefs: [], firstObservedAtMs: null, lastObservedAtMs: null },
    },
    coverage: { status: "complete", requiredChannels: ["dom_inventory"], completedChannels: ["dom_inventory"], incompleteChannels: [], reasonCodes: [] },
    evidence: [], contradictions: [], limitations: [],
    provenance: { projectorId: "wc01.consent-control-assessment", projectorVersion: "test", contractVersion: "2.1", sourceBundleVersion: null, sourceGeometryVersion: null, sourceHash: "fnv1a-1234abcd", computedAt: "2026-09-11T00:00:00.000Z" },
  };

  assert.deepEqual(
    getReportableGdprEprivacyCoverageItems([row], { consentControlAssessment: assessment }),
    [],
  );
});
