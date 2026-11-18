import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION } from "@certscore/contracts";
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
  isReadableScanReportProjectionReady,
  MAX_SCAN_REPORT_PROJECTION_BYTES,
  readPersistedScanReportProjection,
  REPORT_PROJECTION_READY_WARNING_MS,
  sanitizeJsonbValue,
  ScanReportProjectionTooLargeError,
  SCAN_REPORT_PROJECTION_VERSION
} from "./scan-report-projection-contract";
import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  getPersistedCanonicalReportProjection,
  PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION,
  type PersistedCanonicalReportProjection
} from "./persisted-canonical-report-projection";
import { buildGdprEprivacyChecklistPresentation } from "../../lib/scans/gdpr-eprivacy-checklist-presentation";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import terminalFixtures from "../../lib/scans/test-fixtures/retained-terminal-confirmations.json";
import { afterRejectClickProjection, afterRejectProjection } from "../../lib/scans/test-fixtures/after-reject-scoring";
import { assessAfterRejectScoring } from "../../lib/scans/after-reject-scoring-policy";
import { assessChoicePathExecution, postRefusalReportProjectionSchema, type PostRefusalReportProjection } from "@certscore/contracts";
import { MAX_AUDIT_REJECT_ACTIVITY_BYTES } from "../../../../packages/certscore-contracts/src/audit-reject-activity";
import { buildAuditRejectActivity } from "./audit-reject-activity";

const projectionPath = "apps/web/server/scans/scan-report-projection.ts";
const projectionContractPath = "apps/web/server/scans/scan-report-projection-contract.ts";
const statusProjectionPath = "apps/web/server/scans/scan-status-projection.ts";

test("an unconfirmed Reject retains private activity for the existing completed click", () => {
  const projection = terminalFixtures.find(entry => entry.action === "reject")!.projection;
  const id = projection.sourceIdentity!.scanId;
  assert.equal(projection.status, "unconfirmed");
  const record = {
    scan: { id, status: "completed", createdAt: "2026-11-18T12:00:00.000Z" },
    runtimeArtifacts: { postRefusalEvidenceProjection: projection },
  } as unknown as ScanDetailResponse;
  const persisted = buildPersistedScanReportProjection(record);
  assert.deepEqual(persisted.payload.auditRejectActivity, [2, id, projection.packetSha256, "request"]);
  assert.ok(Buffer.byteLength(JSON.stringify(persisted.payload.auditRejectActivity)) <= MAX_AUDIT_REJECT_ACTIVITY_BYTES);
  assert.equal(Object.hasOwn(persisted.report, "auditRejectActivity"), false);
  const hydrated = readPersistedScanReportProjection({
    scan: record.scan,
    snapshot: {
      report_projection_computed_at: "2026-11-18T12:01:00.000Z",
      report_projection_payload: persisted.payload,
      report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes,
      report_projection_status: "ready",
      report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
    } as ScanDetailResponse["snapshot"],
  });
  assert.ok(hydrated);
  assert.equal(Object.hasOwn(hydrated, "auditRejectActivity"), false);
  const capture = projection.afterActionCapture!;
  const oldRoots = {
    ...projection,
    afterActionCapture: {
      ...capture,
      requestAncestry: capture.requestAncestry!.map(request => ({ ...request, rootStartedAtMs: capture.actionDispatchedAtMs })),
    },
  };
  assert.equal(buildAuditRejectActivity(id, oldRoots)?.[3], "classification_unavailable");
  assert.equal(buildAuditRejectActivity(id, { ...projection, sourceIdentity: { ...projection.sourceIdentity, targetSha256: "f".repeat(64) } })?.[3], "source_unbound");
  assert.equal(buildAuditRejectActivity(id, { ...projection, packetSha256: undefined }), undefined);
  const firstWrite = capture.storageWrites[0]!;
  const byWrite = {
    ...oldRoots, afterActionCapture: { ...oldRoots.afterActionCapture, writeDiagnostics: undefined,
      storageWrites: [{ ...firstWrite, nonEssential: true }] },
  };
  assert.equal(buildAuditRejectActivity(id, byWrite)?.[3], "storage_write");
});

test("the persisted Reject receipt distinguishes all three evidence types and uses canonical snapshot classification", () => {
  const id = "00000000-0000-4000-8000-000000000042";
  const cookie = {
    storageType: "cookie", name: "_pk_id.4.ac51", hostname: "example.test", identityBasis: "cookie_name_domain_path_partition",
    identityHash: "d".repeat(64), valueHash: "e".repeat(64), purpose: "unknown", nonEssential: false,
  } satisfies NonNullable<PostRefusalReportProjection["afterActionStorage"]>[number];
  const cases = [
    [false, false, false, "classification_unavailable"],
    [true, false, false, "request"],
    [false, true, false, "storage_write"],
    [true, true, false, "request_and_storage_write"],
    [false, false, true, "cookie_snapshot"],
    [true, false, true, "request_and_cookie_snapshot"],
    [false, true, true, "storage_write_and_cookie_snapshot"],
    [true, true, true, "request_and_storage_write_and_cookie_snapshot"],
  ] as const;
  function projection(request: boolean, write: boolean, snapshot: boolean) {
    const p = afterRejectClickProjection();
    const capture = p.afterActionCapture!;
    p.sourceIdentity = { policyVersion: "post_reject_source_identity.v1", scanId: id, targetSha256: p.actionControlProof!.authorizedTargetSha256! };
    if (!request) {
      p.afterActionRequests = [];
      p.scoringEvidence!.requests = [];
      capture.requestIds = [];
      capture.requestAncestry = [];
    }
    p.scoringEvidence!.preActionStorage = [cookie];
    p.scoringEvidence!.postActionStorage = snapshot ? [cookie] : [];
    p.afterActionStorage = structuredClone(p.scoringEvidence!.postActionStorage);
    if (write) capture.storageWrites = [{ storageType: "local_storage", name: "analytics", observedAtMs: capture.actionDispatchedAtMs + 1, nonEssential: true }];
    p.execution = assessChoicePathExecution(p, "reject");
    return postRefusalReportProjectionSchema.parse(p);
  }
  const stored = (p: PostRefusalReportProjection) => buildPersistedScanReportProjection({
    scan: { id, status: "completed", createdAt: "2026-11-18T12:00:00.000Z" },
    runtimeArtifacts: { postRefusalEvidenceProjection: p },
  } as unknown as ScanDetailResponse).payload.auditRejectActivity;

  for (const [request, write, snapshot, result] of cases) {
    const p = projection(request, write, snapshot);
    const evidence = assessAfterRejectScoring(p);
    assert.equal(Boolean(evidence?.cookieRefs?.length), snapshot);
    assert.equal(Boolean(evidence?.requestIds.length), request);
    const receipt = stored(p);
    assert.deepEqual(receipt, [2, id, p.packetSha256, result]);
    assert.ok(Buffer.byteLength(JSON.stringify(receipt)) <= MAX_AUDIT_REJECT_ACTIVITY_BYTES);
  }

  const snapshot = projection(false, false, true);
  const patched = (mutate: (p: PostRefusalReportProjection) => void) => {
    const copy = structuredClone(snapshot);
    mutate(copy);
    copy.execution = assessChoicePathExecution(copy, "reject");
    return stored(copy)?.[3];
  };
  assert.equal(patched(p => { p.scoringEvidence!.postActionCapturedAtMs = p.afterActionCapture!.actionDispatchedAtMs; }), "classification_unavailable");
  assert.equal(patched(p => { p.afterActionStorage![0]!.valueHash = "f".repeat(64); }), "classification_unavailable");
  assert.equal(patched(p => { p.afterActionStorage = []; p.afterActionCapture!.storageSnapshotRetained = false; }), "classification_unavailable");
  for (const name of ["osano_consentmanager", "unrecognized_cookie"]) {
    assert.equal(patched(p => {
      p.afterActionStorage![0]!.name = name;
      p.scoringEvidence!.postActionStorage[0]!.name = name;
    }), "classification_unavailable");
  }
  assert.equal(patched(p => { p.afterActionCapture!.stopReason = "target_changed"; }), "capture_unavailable");
  assert.equal(patched(p => { p.captureCoverage!.requestsDroppedAfterAction = 1; p.afterActionCapture!.requestsDropped = 1; }), "capture_unavailable");

  const confirmed = afterRejectProjection();
  confirmed.sourceIdentity = snapshot.sourceIdentity;
  confirmed.interactionDiagnostics = snapshot.interactionDiagnostics;
  confirmed.execution = assessChoicePathExecution(confirmed, "reject");
  confirmed.scoringEvidence!.requests = [];
  confirmed.scoringEvidence!.postActionStorage = [cookie];
  confirmed.registeredObservationCompletion = { ...confirmed.registeredObservationCompletion!, completedAtMs: 230, termination: "evidence_satisfied" };
  confirmed.scoringEvidence!.postActionCapturedAtMs = 225;
  assert.equal(stored(confirmed)?.[3], "cookie_snapshot");
  confirmed.scoringEvidence!.storageWrites = [{ storageType: "local_storage", name: "analytics", observedAtMs: 200, msOffsetFromRefusal: 80,
    purpose: "analytics", nonEssential: true, evidenceSource: "post_action_snapshot_delta" }];
  assert.equal(stored(confirmed)?.[3], "cookie_snapshot");
  confirmed.scoringEvidence!.storageWrites[0]!.evidenceSource = "instrumented_write";
  assert.equal(stored(confirmed)?.[3], "storage_write_and_cookie_snapshot");
});

test("scan report projection requires the canonical v2 consent assessment", async () => {
  const source = await readFile(projectionPath, "utf8");

  assert.match(source, /scoreVersion: canonicalScore === null \? null : CANONICAL_OVERALL_SCORE_VERSION/);
  assert.match(source, /scoreSource: canonicalScore === null[\s\S]*CANONICAL_OVERALL_SCORE_SOURCE/);
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

test("report projection writer stays current while readiness uses the bounded readable-version contract", async () => {
  const [contractSource, projectionSource, statusSource] = await Promise.all([
    readFile(projectionContractPath, "utf8"),
    readFile(projectionPath, "utf8"),
    readFile(statusProjectionPath, "utf8")
  ]);

  assert.equal(SCAN_REPORT_PROJECTION_VERSION, "scan-report-projection-v27");
  assert.match(contractSource, /SCAN_REPORT_PROJECTION_VERSION = "scan-report-projection-v27"/);
  assert.match(projectionSource, /from "\.\/scan-report-projection-contract"/);
  assert.match(statusSource, /from "\.\/scan-report-projection-contract"/);
  assert.match(
    statusSource,
    /READABLE_SCAN_REPORT_PROJECTION_VERSIONS\.map/
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
      scanFromLabel: "EU-IR",
      scanFromValue: "eu_ie",
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
  assert.equal(persisted.serialized, JSON.stringify(persisted.payload));
  assert.equal(Buffer.byteLength(persisted.serialized), persisted.sizeBytes);
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
  assert.ok(hydrated);
  assert.equal(hydrated.scan.id, scanRecord.scan.id);
  assert.equal(hydrated.scan.scanFromLabel, "EU-IE");
  assert.equal(hydrated.scan.scanFromValue, "eu_ie");
  assert.deepEqual(transportedPayload.scan, scanRecord.scan);

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
    checklistPresentation: buildGdprEprivacyChecklistPresentation([]),
    collectionSurfaceAssessment: null,
    preConsentBrowserStorageProjection: {
      contractVersion: PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION,
      scanId: scanRecord.scan.id,
      assessmentStatus: "not_testable",
      consentState: "pre_interaction",
      localStorageKeys: [],
      sessionStorageKeys: [],
      retainedStorageSnapshotCount: 0,
      storageFirstObservedAtMs: null,
      valuesRedacted: true,
      evidenceRefs: [],
      limitationKeys: ["storage_snapshot_not_retained"],
      sourceHash: "a".repeat(64),
      sourceLane: "runtime_evidence",
    },
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
    evidenceIndex: {},
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
    ownerUnifiedFindingIds: [],
    ownerUnifiedFindings: [],
    topFindingIds: []
  } satisfies PersistedCanonicalReportProjection;

  const persisted = buildPersistedScanReportProjection(scanRecord, { canonicalReportProjection });
  const transported = JSON.parse(JSON.stringify(persisted.payload)) as ScanDetailResponse;
  assert.deepEqual(getPersistedCanonicalReportProjection(transported), { ...canonicalReportProjection, consentControlSummary: null });
  const assessment = structuredClone(observedControlAssessment);
  assessment.scan.scanId = transported.scan.id;
  const limitedAssessment = {
    ...assessment,
    assessmentStatus: "limited",
    coverage: { ...assessment.coverage, status: "limited" },
    controls: { ...assessment.controls, reject: { ...assessment.controls.reject, state: "unknown" } },
  };
  const withAssessment = {
    ...transported,
    runtimeArtifacts: { ...transported.runtimeArtifacts, consentControlAssessment: limitedAssessment },
  } as unknown as ScanDetailResponse;
  const before = structuredClone(withAssessment);
  const binaryReport = getPersistedCanonicalReportProjection(withAssessment);
  assert.deepEqual(binaryReport?.consentControlSummary?.controls, {
    accept: "observed", reject: "not_observed", options: "observed",
  });
  assert.equal(binaryReport?.consentControlSummary?.sourceHash, assessment.provenance.sourceHash);
  assert.deepEqual(binaryReport?.legacyScoreAssessmentInput, canonicalReportProjection.legacyScoreAssessmentInput);
  assert.deepEqual(binaryReport?.normalizedConcerns, canonicalReportProjection.normalizedConcerns);
  assert.deepEqual(withAssessment, before, "historical assessment and stored report must remain unchanged");
  assert.equal(getPersistedCanonicalReportProjection({
    ...transported,
    canonicalReportProjection: {
      ...canonicalReportProjection,
      artifactVersion: "persisted-canonical-report-projection-v1"
    }
  } as unknown as ScanDetailResponse), null);
  assert.equal(getPersistedCanonicalReportProjection({
    ...transported,
    scan: { ...transported.scan, id: "00000000-0000-0000-0000-000000000000" }
  }), null);

  const indexedFinding = {
    unifiedFindingId: "unified-finding-1"
  } as PersistedCanonicalReportProjection["globalUnifiedFindings"][number];
  const indexedCanonicalReportProjection = {
    ...canonicalReportProjection,
    globalUnifiedFindings: [indexedFinding],
    ownerUnifiedFindingIds: [indexedFinding.unifiedFindingId],
    ownerUnifiedFindings: []
  };
  const indexedOwnerProjection = {
    ...transported,
    canonicalReportProjection: indexedCanonicalReportProjection
  } as unknown as ScanDetailResponse;
  assert.deepEqual(
    getPersistedCanonicalReportProjection(indexedOwnerProjection)?.ownerUnifiedFindings,
    [indexedFinding]
  );
  assert.equal(getPersistedCanonicalReportProjection({
    ...indexedOwnerProjection,
    canonicalReportProjection: {
      ...indexedCanonicalReportProjection,
      ownerUnifiedFindingIds: ["missing-finding"]
    }
  } as unknown as ScanDetailResponse), null);
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
    (error) => {
      assert.ok(error instanceof ScanReportProjectionTooLargeError);
      assert.equal(error.scanId, scanRecord.scan.id);
      assert.equal(error.maxBytes, MAX_SCAN_REPORT_PROJECTION_BYTES);
      assert.ok(error.sizeBytes > error.maxBytes);
      return true;
    }
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

test("verified v19 projections remain readable without becoming current publication output", () => {
  const historical = {
    report_projection_computed_at: "2026-08-27T17:28:31.376Z",
    report_projection_status: "ready",
    report_projection_version: "scan-report-projection-v19"
  };
  assert.equal(isReadableScanReportProjectionReady(historical), true);
  assert.equal(isCurrentScanReportProjectionReady(historical), false);
  assert.equal(isReadableScanReportProjectionReady({
    ...historical,
    report_projection_version: "scan-report-projection-v18"
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

test("policy provenance receipt belongs to the verified private payload only", () => {
  const scanRecord = {
    scan: { id: "5eb8e37d-7eac-4c45-bb4b-3c31c239a2df", status: "completed", createdAt: "2026-11-07T09:00:00.000Z" },
    snapshot: {},
  } as ScanDetailResponse;
  const receipt = {
    version: "certscore.audit-policy-provenance.v1",
    binding: {
      scanId: scanRecord.scan.id, createdAt: scanRecord.scan.createdAt,
      generation: SCAN_REPORT_PROJECTION_VERSION, sourceHash: "a".repeat(64),
    },
    bundle: "b".repeat(64), fetch: "fetched", owner: "producer_declared_usable", text: "producer_verified_complete_receipt",
  };
  const persisted = buildPersistedScanReportProjection(scanRecord, { auditPolicyProvenance: receipt });
  assert.deepEqual(persisted.payload.auditPolicyProvenance, receipt);
  assert.equal(Object.hasOwn(persisted.report, "auditPolicyProvenance"), false);
  const hydrated = readPersistedScanReportProjection({
    scan: scanRecord.scan,
    snapshot: {
      report_projection_computed_at: "2026-11-07T09:01:00.000Z",
      report_projection_payload: persisted.payload,
      report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes,
      report_projection_source_hash: receipt.binding.sourceHash,
      report_projection_status: "ready",
      report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
    },
  });
  assert.ok(hydrated);
  assert.equal(Object.hasOwn(hydrated, "auditPolicyProvenance"), false);
  const invalid = buildPersistedScanReportProjection(scanRecord, {
    auditPolicyProvenance: { ...receipt, binding: { ...receipt.binding, createdAt: "2026-11-07T09:00:00.001Z" } },
  });
  assert.equal(Object.hasOwn(invalid.payload, "auditPolicyProvenance"), false);
});
