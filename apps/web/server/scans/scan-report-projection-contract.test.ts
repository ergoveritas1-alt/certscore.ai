import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import {
  buildPersistedFirstLayerConsentEvidence,
  projectFirstLayerConsentChoices,
  withPersistedFirstLayerConsentEvidence
} from "./scan-report-consent-projection";
import {
  buildPersistedScanReportProjection,
  completionToReportProjectionMs,
  isCurrentScanReportProjectionReady,
  MAX_SCAN_REPORT_PROJECTION_BYTES,
  readPersistedScanReportProjection,
  REPORT_PROJECTION_READY_WARNING_MS,
  sanitizeJsonbValue,
  SCAN_REPORT_PROJECTION_VERSION
} from "./scan-report-projection-contract";
import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  getPersistedCanonicalReportProjection,
  PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION,
  type PersistedCanonicalReportProjection
} from "./persisted-canonical-report-projection";

const projectionPath = "apps/web/server/scans/scan-report-projection.ts";
const projectionContractPath = "apps/web/server/scans/scan-report-projection-contract.ts";
const statusProjectionPath = "apps/web/server/scans/scan-status-projection.ts";

test("scan report projection requires the canonical v2 consent assessment", async () => {
  const source = await readFile(projectionPath, "utf8");

  assert.match(source, /scoreVersion: canonicalScore === null \? null : "gdpr-eprivacy-canonical-shadow-v7"/);
  assert.match(source, /buildRuntimeCookieInventory/);
  assert.match(source, /runtimeCookieRows/);
  assert.match(source, /Refusing to mark scan .* report projection ready before ConsentControlAssessment v2 is materialized/);
  assert.match(source, /assessment\.controls\.accept\.state === "observed"/);
  assert.match(source, /assessment\.controls\.reject\.state === "observed"/);
  assert.match(source, /assessment\.controls\.options\.state === "observed"/);
  assert.match(source, /consent_control_assessment/);
  assert.match(source, /consent_coverage_status/);
  assert.match(source, /consent_surface_status/);
  assert.match(
    source,
    /runtimeArtifacts\?\.consentControlAssessment[\s\S]*record\(scanRecord\.snapshot\)\?\.consent_control_assessment/
  );
});

test("report projection writer and readiness query share one version contract", async () => {
  const [contractSource, projectionSource, statusSource] = await Promise.all([
    readFile(projectionContractPath, "utf8"),
    readFile(projectionPath, "utf8"),
    readFile(statusProjectionPath, "utf8")
  ]);

  assert.equal(SCAN_REPORT_PROJECTION_VERSION, "scan-report-projection-v17");
  assert.match(contractSource, /SCAN_REPORT_PROJECTION_VERSION = "scan-report-projection-v17"/);
  assert.match(projectionSource, /from "\.\/scan-report-projection-contract"/);
  assert.match(statusSource, /from "\.\/scan-report-projection-contract"/);
  assert.match(
    statusSource,
    /projection\.report_projection_version = '\$\{SCAN_REPORT_PROJECTION_VERSION\}'/
  );
  assert.doesNotMatch(projectionSource, /scan-report-projection-v\d+/);
  assert.doesNotMatch(statusSource, /scan-report-projection-v\d+/);
});

test("persisted display projection is bounded, checksum-verified, and scan-bound", () => {
  const scanRecord = {
    events: [],
    runtimeArtifacts: {
      cookieWriteObservations: [{ cookieName: "session" }],
      cookie_write_observations: [{ cookieName: "session" }],
      hybridRuntimeEvidence: { consentControlAssessment: { artifactVersion: "consent-control-assessment-v2" } },
      hybrid_runtime_evidence: { consentControlAssessment: { artifactVersion: "consent-control-assessment-v2" } },
      omittedAtTransport: undefined,
      observedAt: new Date("2026-07-30T19:22:38.000Z"),
      policyDisclosureSummary: { privacyPolicyPresent: true },
      policy_disclosure_summary: { privacyPolicyPresent: true },
      requestPurposeClassificationConfidence: [{ hostname: "metrics.example" }],
      request_purpose_classification_confidence: [{ hostname: "metrics.example" }]
    },
    scan: {
      completedAt: "2026-07-30T19:22:39.000Z",
      id: "5eb8e37d-7eac-4c45-bb4b-3c31c239a2df",
      status: "completed"
    },
    snapshot: {
      report_projection_payload: { stale: true },
      report_projection_payload_sha256: "stale"
    },
    previousSnapshot: {
      consent_control_assessment: { artifactVersion: "consent-control-assessment-v2" },
      report_projection_payload: {
        previousSnapshot: {
          report_projection_payload: { recursive: true }
        }
      },
      report_projection_payload_sha256: "stale",
      report_projection_status: "ready"
    }
  } as unknown as ScanDetailResponse;
  const persisted = buildPersistedScanReportProjection(scanRecord);
  assert.ok(persisted.sizeBytes < MAX_SCAN_REPORT_PROJECTION_BYTES);
  assert.equal(
    (persisted.payload.snapshot as Record<string, unknown>).report_projection_payload,
    undefined
  );
  assert.deepEqual(persisted.payload.runtimeArtifacts, {
    cookie_write_observations: [{ cookieName: "session" }],
    hybrid_runtime_evidence: { consentControlAssessment: { artifactVersion: "consent-control-assessment-v2" } },
    observedAt: "2026-07-30T19:22:38.000Z",
    policy_disclosure_summary: { privacyPolicyPresent: true },
    request_purpose_classification_confidence: [{ hostname: "metrics.example" }]
  });
  assert.deepEqual(persisted.payload.previousSnapshot, {
    consent_control_assessment: { artifactVersion: "consent-control-assessment-v2" }
  });

  const transportedPayload = JSON.parse(JSON.stringify(persisted.payload)) as Record<string, unknown>;

  const hydrated = readPersistedScanReportProjection({
    scan: scanRecord.scan,
    snapshot: {
      report_projection_computed_at: "2026-07-30T19:22:47.000Z",
      report_projection_payload: transportedPayload,
      report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes,
      report_projection_status: "ready",
      report_projection_version: SCAN_REPORT_PROJECTION_VERSION
    }
  });
  assert.equal(hydrated?.scan.id, scanRecord.scan.id);

  assert.equal(readPersistedScanReportProjection({
    scan: scanRecord.scan,
    snapshot: {
      report_projection_computed_at: "2026-07-30T19:22:47.000Z",
      report_projection_payload: transportedPayload,
      report_projection_payload_sha256: "0".repeat(64),
      report_projection_payload_size_bytes: persisted.sizeBytes,
      report_projection_status: "ready",
      report_projection_version: SCAN_REPORT_PROJECTION_VERSION
    }
  }), null);
});

test("persisted projection carries one scan-bound canonical output packet", () => {
  const scanRecord = {
    events: [],
    runtimeArtifacts: {},
    scan: {
      completedAt: "2026-08-05T18:40:44.000Z",
      id: "5eb8e37d-7eac-4c45-bb4b-3c31c239a2df",
      status: "completed"
    },
    snapshot: null
  } as unknown as ScanDetailResponse;
  const canonicalReportProjection = {
    artifactVersion: PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION,
    checklistRows: [],
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
    globalUnifiedFindings: [],
    legacyScoreAssessmentInput: {
      coverageConfidence: "insufficient",
      coverageRatio: 0,
      inputFindingIds: [],
      inputProjectionFingerprint: "sha256:" + "0".repeat(64),
      scanId: scanRecord.scan.id,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreSource: "wc01.regulatory-coverage-score",
      scoreValue: null,
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1",
      scoredAt: scanRecord.scan.completedAt as string,
      withholdingReason: "legacy_evidence_score_withheld:insufficient"
    },
    normalizedConcerns: [],
    ownerUnifiedFindings: [],
    topFindingIds: []
  } satisfies PersistedCanonicalReportProjection;

  const persisted = buildPersistedScanReportProjection(scanRecord, { canonicalReportProjection });
  const transported = JSON.parse(JSON.stringify(persisted.payload)) as ScanDetailResponse;
  assert.deepEqual(getPersistedCanonicalReportProjection(transported), canonicalReportProjection);
  assert.equal(getPersistedCanonicalReportProjection({
    ...transported,
    scan: { ...transported.scan, id: "00000000-0000-0000-0000-000000000000" }
  }), null);
});

test("projection sanitizes NUL characters rejected by PostgreSQL jsonb", () => {
  const scanRecord = {
    events: [{ message: "retained\u0000evidence" }],
    runtimeArtifacts: { policyText: "before\u0000after" },
    scan: {
      id: "5eb8e37d-7eac-4c45-bb4b-3c31c239a2df",
      status: "completed"
    },
    snapshot: null
  } as unknown as ScanDetailResponse;

  const persisted = buildPersistedScanReportProjection(scanRecord);
  assert.equal((persisted.payload.events[0] as Record<string, unknown>).message, "retained�evidence");
  assert.equal((persisted.payload.runtimeArtifacts as Record<string, unknown>).policyText, "before�after");
  assert.equal(JSON.stringify(persisted.payload).includes("\u0000"), false);
  assert.deepEqual(sanitizeJsonbValue({ nested: ["a\u0000b"] }), { nested: ["a�b"] });
});

test("persisted projection preserves conflicting runtime aliases instead of dropping evidence", () => {
  const scanRecord = {
    events: [],
    runtimeArtifacts: {
      policyDisclosureSummary: { privacyPolicyPresent: false },
      policy_disclosure_summary: { privacyPolicyPresent: true }
    },
    scan: {
      id: "5eb8e37d-7eac-4c45-bb4b-3c31c239a2df",
      status: "completed"
    },
    snapshot: null
  } as unknown as ScanDetailResponse;

  const persisted = buildPersistedScanReportProjection(scanRecord);
  assert.deepEqual(persisted.payload.runtimeArtifacts, scanRecord.runtimeArtifacts);
});

test("oversized display projections fail closed instead of truncating evidence", () => {
  const scanRecord = {
    events: [],
    runtimeArtifacts: {
      boundedFixture: "x".repeat(MAX_SCAN_REPORT_PROJECTION_BYTES)
    },
    scan: {
      id: "5eb8e37d-7eac-4c45-bb4b-3c31c239a2df",
      status: "completed"
    },
    snapshot: null
  } as unknown as ScanDetailResponse;
  assert.throws(
    () => buildPersistedScanReportProjection(scanRecord),
    /maximum is/
  );
});

test("only a ready current-version projection satisfies readiness", () => {
  const current = {
    report_projection_computed_at: "2026-07-30T19:22:47.000Z",
    report_projection_status: "ready",
    report_projection_version: SCAN_REPORT_PROJECTION_VERSION
  };
  assert.equal(isCurrentScanReportProjectionReady(current), true);
  assert.equal(isCurrentScanReportProjectionReady({
    ...current,
    report_projection_version: "scan-report-projection-v6"
  }), false);
  assert.equal(isCurrentScanReportProjectionReady({
    ...current,
    report_projection_status: "pending"
  }), false);
  assert.equal(isCurrentScanReportProjectionReady({
    ...current,
    report_projection_computed_at: null
  }), false);
  assert.equal(isCurrentScanReportProjectionReady({
    ...current,
    report_projection_computed_at: ""
  }), false);
});

test("report projection readiness latency is bounded and warning-calibrated", () => {
  const completedAt = "2026-07-30T19:22:39.000Z";
  assert.equal(
    completionToReportProjectionMs(completedAt, Date.parse("2026-07-30T19:22:47.000Z")),
    8_000
  );
  assert.equal(REPORT_PROJECTION_READY_WARNING_MS, 15_000);
  assert.equal(completionToReportProjectionMs(null), null);
  assert.equal(completionToReportProjectionMs("invalid"), null);
});

test("Oxfam retained controls survive the persisted report boundary", () => {
  const evidence = buildPersistedFirstLayerConsentEvidence({
    acceptControlObserved: true,
    actionableControlInventoryRetained: true,
    controls: [
      {
        actionType: "manage_preferences",
        classifierReasonCodes: ["matched_options"],
        label: "Cookie Settings",
        matchedTerm: "cookie settings",
        semanticRole: "preferences"
      },
      {
        actionType: "accept_all",
        classifierReasonCodes: ["matched_accept"],
        label: "Accept all cookies",
        matchedTerm: "accept all",
        semanticRole: "explicit_accept"
      },
      {
        actionType: "reject_all",
        classifierReasonCodes: ["matched_reject"],
        classifierVariant: "necessary_only",
        label: "Accept only essential cookies",
        matchedTerm: "only essential",
        semanticRole: "necessary_only"
      }
    ],
    layerInspected: "first_layer",
    managePreferencesControlObserved: true,
    rejectControlObserved: true,
    visibleChoiceLabels: [
      "Cookie Settings",
      "Accept all cookies",
      "Accept only essential cookies"
    ]
  });
  assert.ok(evidence);

  const hydrated = withPersistedFirstLayerConsentEvidence(
    { consentSurfaceObserved: true },
    { consent_control_evidence: evidence }
  );
  assert.deepEqual(
    (hydrated?.firstLayerConsentChoices as { controls: unknown[] }).controls,
    evidence.controls
  );
  assert.equal(
    ((hydrated?.hybridRuntimeEvidence as Record<string, unknown>)
      .firstLayerConsentChoices as { rejectControlObserved: boolean })
      .rejectControlObserved,
    true
  );

  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: true,
    runtimeArtifacts: hydrated,
    scanCompleted: true,
    snapshot: {
      consent_control_evidence: evidence,
      cookie_banner_present: true
    }
  });
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.match(
    outcomes.reject_all_path_availability?.evidenceRefs.join(" ") ?? "",
    /Accept only essential cookies/
  );
});

test("runtime-retained typed assessment hydrates CNN-style visual evidence into A/R/O", () => {
  const url = "https://edition.cnn.com/";
  const assessment = deriveConsentControlAssessment({
    scan: {
      scanId: "scan-cnn-visual-evidence",
      requestedUrl: url,
      finalUrl: url,
      scanStatus: "completed"
    },
    document: {
      canonicalDocumentId: url,
      observedDocumentIds: [url],
      identityStatus: "matched"
    },
    observations: [{
      observationId: "cnn-retained-consent-surface",
      observedAtMs: 1_000,
      likelyPresent: true,
      layerInspected: "first_layer",
      documentId: url,
      captureStatus: "observed",
      completedChannels: ["dom_inventory", "geometry"],
      controls: [
        {
          evidenceId: "accept-all",
          actionType: "accept_all",
          intent: "accept",
          label: "Accept All",
          layer: "first_layer",
          visible: true,
          actionable: true,
          observedAtMs: 1_001,
          documentId: url,
          channels: ["dom_inventory", "geometry"],
          artifactRefs: ["CanonicalEvidenceBundle.json"]
        },
        {
          evidenceId: "show-purposes",
          actionType: "manage_preferences",
          intent: "options",
          label: "Show Purposes",
          layer: "first_layer",
          visible: true,
          actionable: true,
          observedAtMs: 1_002,
          documentId: url,
          channels: ["dom_inventory", "geometry"],
          artifactRefs: ["CanonicalEvidenceBundle.json"]
        }
      ]
    }],
    geometry: {
      assessmentStatus: "complete",
      documentId: url,
      completedChannels: ["dom_inventory", "geometry"],
      incompleteChannels: [],
      candidates: []
    },
    surface: {
      status: "observed_actionable",
      firstObservedAtMs: 1_000,
      lastObservedAtMs: 1_002,
      evidenceRefs: ["CanonicalEvidenceBundle.json"]
    },
    coverage: {
      status: "complete",
      requiredChannels: ["dom_inventory", "geometry"],
      completedChannels: ["dom_inventory", "geometry"],
      incompleteChannels: []
    },
    source: {
      bundleVersion: "cnn-visual-regression",
      geometryVersion: "consent_control_geometry.v1",
      computedAt: "2026-07-28T00:00:00.000Z"
    }
  });

  const hydrated = withPersistedFirstLayerConsentEvidence(
    { hybridRuntimeEvidence: { consentControlAssessment: assessment } },
    null
  );
  assert.equal(hydrated?.consentSurfaceObserved, true);
  assert.deepEqual(hydrated?.firstLayerConsentChoices, {
    acceptControlObserved: true,
    actionableControlInventoryRetained: true,
    controls: [
      {
        actionType: "accept_all",
        classifierReasonCodes: [],
        classifierVariant: null,
        label: "Accept All",
        matchedLocale: null,
        matchedTerm: null,
        matchStrength: null,
        semanticRole: null,
        visible: true
      },
      {
        actionType: "manage_preferences",
        classifierReasonCodes: [],
        classifierVariant: null,
        label: "Show Purposes",
        matchedLocale: null,
        matchedTerm: null,
        matchStrength: null,
        semanticRole: null,
        visible: true
      }
    ],
    geometryAssessment: "complete",
    layerInspected: "first_layer",
    managePreferencesControlObserved: true,
    rejectControlObserved: false,
    visibleChoiceLabels: ["Accept All", "Show Purposes"]
  });
});

test("Oxfam first-layer controls project canonically to A/R/O", () => {
  assert.deepEqual(projectFirstLayerConsentChoices({
    acceptControlObserved: true,
    actionableControlInventoryRetained: true,
    controls: [
      { actionType: "manage_preferences", label: "Cookie Settings" },
      { actionType: "accept_all", label: "Accept all cookies" },
      { actionType: "reject_all", label: "Accept only essential cookies" }
    ],
    layerInspected: "first_layer",
    managePreferencesControlObserved: true,
    rejectControlObserved: true
  }), {
    accept: true,
    options: true,
    reject: true,
    retained: true
  });
});

test("incomplete control inventory remains unknown instead of projecting false", () => {
  assert.deepEqual(projectFirstLayerConsentChoices({
    acceptControlObserved: false,
    actionableControlInventoryRetained: false,
    geometryAssessment: "incomplete",
    layerInspected: "unknown",
    managePreferencesControlObserved: false,
    rejectControlObserved: false
  }), {
    accept: false,
    options: false,
    reject: false,
    retained: false
  });
});
