import assert from "node:assert/strict";
import test from "node:test";
import {
  apiV2ActiveScanRetryAfterSeconds,
  buildApiV2Error,
  buildApiV2ErrorFromPulse,
  buildApiV2DomainLatestScan,
  buildApiV2FindingDetail,
  buildApiV2FindingList,
  buildApiV2PreConsentCookiesTrackers,
  buildApiV2ScanJobFromPulseStatus,
  buildApiV2ScanPulse,
  buildApiV2ScanDiagnostics,
  buildApiV2ScanResource,
  buildApiV2ScanStatus,
  projectedFindingsFromPulse
} from "./scan-resource";
import { buildRuntimeInventoryProjectionFromScan } from "../scans/runtime-inventory-projection";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { SCAN_NO_GO_REASON_CODES, SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";

function fixture(overrides: Partial<ScanDetailResponse["scan"]> = {}) {
  return {
    scan: {
      id: "00000000-0000-4000-8000-000000000123",
      domainId: null,
      domainHostname: "example.com",
      scanType: "full",
      status: "completed",
      pagesRequested: 1,
      pagesScanned: 1,
      scanConfigJson: null,
      scanFromLabel: "Ireland",
      scanFromValue: "eu_ie",
      executionSummary: null,
      createdAt: "2026-06-30T12:00:00.000Z",
      startedAt: "2026-06-30T12:00:01.000Z",
      completedAt: "2026-06-30T12:00:10.000Z",
      errorMessage: null,
      provenance: {
        source: "unknown",
        signals: []
      },
      ...overrides
    },
    accessPostureSummary: {
      accessPostureClass: "ok",
      homepageFetchStatus: "ok",
      stopReason: null,
      interruptionReason: null
    },
    regulatoryRisk: {
      overallScore: 28
    },
    domainBenchmark: null,
    events: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    runtimeArtifacts: {},
    signals: [],
    snapshot: {
      certscore_overall: 32,
      report_projection_status: "ready",
      score_scored_at: "2026-06-30T12:00:10.000Z",
      score_version: "overall-score.v1"
    },
    trackerVendors: [],
    validationFindings: []
  } as unknown as ScanDetailResponse;
}

function gpcCanonicalFixture() {
  const assessment = {
    contractVersion: "certscore.gpc-response-assessment.v1",
    generatedAt: "2026-09-02T12:00:00.000Z",
    status: "no_observable_response",
    findingTitle: "No observable GPC response",
    scoreEffect: "none",
    legalInterpretation: "not_assessed",
    comparison: {
      comparable: true,
      protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: { lane: "runtime_evidence", sha256: "a".repeat(64), sizeBytes: 100, uri: "s3://private/baseline.json" },
      gpcArtifact: { lane: "gpc_observation", sha256: "b".repeat(64), sizeBytes: 110, uri: "s3://private/gpc.json" },
      enabledProof: {
        secGpcHeaderValue: "1",
        requestsWithSecGpc: 2,
        requestEventIds: ["gpc-request-1", "gpc-request-2"],
        navigatorGlobalPrivacyControl: true,
      },
      deltas: {
        cookies: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["session@example.com@/"] },
        trackers: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["Example Ads|tracker|advertising"] },
        advertisingOrMeasurementActivity: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["Example Ads|pixel|advertising"] },
        consentOrCmpBehavior: { baselineCount: 1, gpcCount: 1, countDelta: 0, baselineOnly: [], gpcOnly: [], shared: ["Example CMP|cmp"] },
      },
      evidenceRefs: ["s3://private/baseline.json", "s3://private/gpc.json"],
      limitationKeys: [],
    },
  } as const;
  const finding = {
    unifiedFindingId: "gpc_response",
    summary: "No observable baseline delta was retained under the equivalent passive GPC condition.",
    details: { family: "privacy_signal", kind: "gpc_response", assessment },
    presentationDecision: { status: "surface" },
    scoreEffects: [{
      appliesTo: "certscore_overall",
      deductionPoints: 15,
      evidenceRefs: assessment.comparison.evidenceRefs,
      framework: "california",
      observedActivity: ["Example Ads|pixel|advertising"],
      policyKey: "california.gpc_response.qualifying_activity_not_suppressed",
      policyVersion: "california-gpc-response.v1",
      reasonCode: "comparable_gpc_no_qualifying_suppression",
    }],
  };
  return {
    ...fixture(),
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2",
      checklistRows: [],
      collectionSurfaceAssessment: null,
      derivedContext: {},
      globalUnifiedFindings: [finding],
      legacyScoreAssessmentInput: { scanId: "00000000-0000-4000-8000-000000000123" },
      normalizedConcerns: [],
      ownerUnifiedFindings: [finding],
      topFindingIds: [],
    },
  } as unknown as ScanDetailResponse;
}

function retainedPreConsentInventoryFixture() {
  return {
    ...fixture(),
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        vendorSummary: {
          rawThirdPartyDomains: ["connect.facebook.net", "static.klaviyo.com", "cdn.example.com"]
        },
        cookieWriteObservations: [
          {
            beforeConsent: true,
            category: "advertising",
            cookieInitiatorDomain: "connect.facebook.net",
            cookieInitiatorUrl: "https://connect.facebook.net/fbevents.js?email=person@example.com",
            cookieInitiatorVendor: "Meta Pixel",
            cookieName: "_fbp",
            cookieSetMethod: "document_cookie",
            cookieValue: "must-not-leak",
            dataTypes: ["advertising identifier"],
            description: "Supports advertising delivery and measurement.",
            domain: ".example.com",
            essentiality: "non_essential",
            essentialityConfidence: 0.98,
            essentialityReasonCodes: ["canonical_cookie_knowledge_match"],
            expiresAt: "2027-09-01T00:00:00.000Z",
            initiatorChain: [
              "https://connect.facebook.net/fbevents.js?email=person@example.com"
            ],
            lifespanSeconds: 40000000,
            lifespanSource: "max_age",
            rawRequestBody: "email=person@example.com&token=secret",
            responseUrl: "https://connect.facebook.net/fbevents.js?token=secret",
            setByThirdPartyScript: true,
            setAtMs: 120
          },
          {
            beforeConsent: true,
            cookieInitiatorDomain: "static.klaviyo.com",
            cookieInitiatorVendor: "Klaviyo",
            cookieName: "__kla_id",
            cookieSetMethod: "document_cookie",
            cookieValue: "also-must-not-leak",
            domain: ".example.com",
            responseUrl: "https://static.klaviyo.com/onsite/js/klaviyo.js?customer_email=person@example.com",
            setAtMs: 260
          }
        ],
        requestPurposeClassificationConfidence: [{
          cookieNamesSent: ["_fbp"],
          essentiality: "non_essential",
          hostname: "connect.facebook.net",
          identifierParameterNames: ["id"],
          initiatorUrl: "https://example.com/app.js?secret=redacted",
          method: "POST",
          pathSample: "/tr",
          responseCookieNamesSet: ["_fbp"],
          responseObserved: true,
          responseStorageAttempted: true,
          vendor: "Meta"
        }],
        timelineMarkers: {
          consentBannerDetectedMs: 400
        },
        requestObservations: [
          {
            beforeConsent: true,
            domain: "connect.facebook.net",
            host: "connect.facebook.net",
            networkDestination: {
              asn: 32934,
              country: "United States",
              countryCode: "US",
              ip: "157.240.241.17",
              locationLabel: "server location (may be CDN edge)",
              provider: "Meta Platforms, Inc.",
              source: "geolite2"
            },
            requestUrl: "https://connect.facebook.net/tr?redacted=1",
            url: "https://connect.facebook.net/tr?id=123&email=person@example.com"
          },
          {
            beforeConsent: true,
            host: "static.klaviyo.com",
            url: "https://static.klaviyo.com/onsite/js/klaviyo.js?token=secret"
          }
        ]
      },
      initial_cookie_domains: [".example.com"],
      initial_cookie_names: ["_ga"]
    },
    trackerVendors: [
      {
        beforeConsent: true,
        confidence: 0.96,
        detectionSource: "request",
        firstSeenMs: 144,
        matchedSignatureId: "meta_pixel",
        rawRequestBody: "email=person@example.com",
        scriptHost: "connect.facebook.net/tr?id=123&email=person@example.com",
        vendorCategory: "advertising",
        vendorDisplayCategory: "Advertising",
        vendorName: "Meta Pixel"
      },
      {
        beforeConsent: true,
        confidence: 0.86,
        detectionSource: "request",
        firstSeenMs: 260,
        matchedSignatureId: "klaviyo",
        scriptHost: "static.klaviyo.com/onsite/js/klaviyo.js?token=secret",
        vendorCategory: "marketing_automation",
        vendorDisplayCategory: "Marketing automation",
        vendorName: "Klaviyo"
      }
    ]
  } as unknown as ScanDetailResponse;
}

test("buildApiV2ScanResource projects a completed scan into public-safe v2 shape", () => {
  const resource = buildApiV2ScanResource(fixture());

  assert.equal(resource.type, "certscore_scan");
  assert.equal(resource.scanId, "00000000-0000-4000-8000-000000000123");
  assert.equal(resource.domain, "example.com");
  assert.equal(resource.score, 32);
  assert.equal(resource.scoreStatus, "final");
  assert.equal(resource.scoreVersion, "overall-score.v1");
  assert.equal(resource.scoreUpdatedAt, "2026-06-30T12:00:10.000Z");
  assert.equal(resource.riskLevel, "significant_review_recommended");
  assert.equal(resource.scanTimeSeconds, 9);
  assert.equal(resource.coverage?.status, "complete");
  assert.equal(resource.links?.findings, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings");
});

test("API v2 resource and status surface the canonical GPC response without private artifact URIs", () => {
  const resource = buildApiV2ScanResource(gpcCanonicalFixture());
  const status = buildApiV2ScanStatus(gpcCanonicalFixture(), { canonicalScan: resource });

  assert.equal(resource.gpcResponse?.status, "no_observable_response");
  assert.equal(resource.gpcResponse?.findingTitle, "No observable GPC response");
  assert.equal(resource.gpcResponse?.comparison.enabledProof.secGpcHeaderValue, "1");
  assert.equal(resource.gpcResponse?.comparison.enabledProof.requestsWithSecGpc, 2);
  assert.equal(resource.gpcResponse?.comparison.deltas.trackers.shared.length, 1);
  assert.deepEqual(resource.gpcResponse?.californiaPolicy, { applied: true, deductionPoints: 15 });
  assert.equal(resource.gpcResponse?.evidenceUrl, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings/gpc_response");
  assert.doesNotMatch(JSON.stringify(resource.gpcResponse), /s3:\/\//);
  assert.deepEqual(status.gpcResponse, resource.gpcResponse);
});

test("API v2 and status expose joined canonical post-refusal observation metadata", () => {
  const retained = {
    ...fixture(),
    runtimeArtifacts: {
      postRefusalEvidenceProjection: {
        status: "confirmed_observation",
        actionControlProof: { action: "reject" },
        refusalExercised: true,
        observationCount: 2,
        productionProjectable: true,
        completedAt: "2026-08-26T12:00:09.000Z",
        contradictionObserved: false,
        postRefusalActivity: [
          { activityType: "storage_write" },
          { activityType: "storage_write" },
        ],
        limitations: [
          "observation_early_exit:non_essential_storage_write_observed",
          "persistence_observation_not_settled_due_to_early_exit",
        ],
      },
    },
  } as unknown as ScanDetailResponse;

  const resource = buildApiV2ScanResource(retained);
  const status = buildApiV2ScanStatus(retained, { canonicalScan: resource });
  assert.deepEqual(resource.postRefusalObservation, {
    status: "confirmed_observation",
    refusalExercised: true,
    observationCount: 2,
    productionProjectable: true,
    evidenceDisposition: "confirmed",
    indeterminateReason: null,
    verdict: "eligible_nonessential_activity_observed_after_confirmed_refusal",
    interpretation: "Reject was confirmed, and eligible non-essential storage activity was observed afterward.",
    observationStrategy: "stop_on_first_eligible_activity",
    termination: {
      kind: "evidence_satisfied",
      intentional: true,
      trigger: "non_essential_storage_write_observed",
    },
    completedAt: "2026-08-26T12:00:09.000Z",
    coverageLimitations: ["The remainder of the persistence window was not measured."],
    limitations: ["The remainder of the persistence window was not measured."],
  });
  assert.deepEqual(status.postRefusalObservation, resource.postRefusalObservation);
});

test("API v2 keeps unchanged post-refusal storage persistence review-only", () => {
  const retained = {
    ...fixture(),
    runtimeArtifacts: {
      postRefusalEvidenceProjection: {
        status: "confirmed_observation",
        actionControlProof: { action: "reject" },
        refusalExercised: true,
        observationCount: 3,
        productionProjectable: true,
        completedAt: "2026-09-02T02:36:02.321Z",
        contradictionObserved: false,
        postRefusalActivity: [],
        preConsentStorageNotCleared: [
          { name: "_ga", storageType: "cookie", exactIdentityVerified: true, sameValueHashVerified: true },
          { name: "_ga_A", storageType: "cookie", exactIdentityVerified: true, sameValueHashVerified: true },
          { name: "_ga_B", storageType: "cookie", exactIdentityVerified: true, sameValueHashVerified: true },
        ],
        limitations: [],
      },
    },
  } as unknown as ScanDetailResponse;

  const resource = buildApiV2ScanResource(retained);
  const status = buildApiV2ScanStatus(retained, { canonicalScan: resource });

  assert.equal(resource.postRefusalObservation?.status, "confirmed_observation");
  assert.equal(
    resource.postRefusalObservation?.verdict,
    "no_eligible_nonessential_activity_observed_during_completed_window",
  );
  assert.equal(
    resource.postRefusalObservation?.interpretation,
    "Reject was confirmed. No eligible post-refusal request or storage write was observed; unchanged non-essential storage remained as a score-neutral review signal.",
  );
  assert.deepEqual(resource.postRefusalObservation?.termination, {
    kind: "window_elapsed",
    intentional: true,
    trigger: "window_elapsed",
  });
  assert.deepEqual(status.postRefusalObservation, resource.postRefusalObservation);
});

test("API v2 and status expose joined canonical post-Accept observation metadata", () => {
  const retained = {
    ...fixture(),
    runtimeArtifacts: {
      postAcceptEvidenceProjection: {
        status: "confirmed_observation",
        actionControlProof: { action: "accept" },
        acceptanceExercised: true,
        observationCount: 3,
        productionProjectable: true,
        completedAt: "2026-09-01T12:00:09.000Z",
        contradictionObserved: true,
        postAcceptActivity: [
          { activityType: "network_request" },
          { activityType: "storage_write" },
        ],
        limitations: [
          "observation_early_exit:acceptance_signal_contradiction_observed",
        ],
      },
    },
  } as unknown as ScanDetailResponse;

  const resource = buildApiV2ScanResource(retained);
  const status = buildApiV2ScanStatus(retained, { canonicalScan: resource });
  assert.deepEqual(resource.postAcceptObservation, {
    status: "confirmed_observation",
    acceptanceExercised: true,
    observationCount: 3,
    productionProjectable: true,
    evidenceDisposition: "confirmed",
    indeterminateReason: null,
    verdict: "eligible_nonessential_activity_observed_after_confirmed_acceptance",
    interpretation: "Accept was confirmed, and eligible non-essential network and storage activity was observed afterward.",
    observationStrategy: "stop_on_first_eligible_activity",
    termination: {
      kind: "evidence_satisfied",
      intentional: true,
      trigger: "acceptance_signal_contradiction_observed",
    },
    completedAt: "2026-09-01T12:00:09.000Z",
    coverageLimitations: [],
    limitations: [],
  });
  assert.deepEqual(status.postAcceptObservation, resource.postAcceptObservation);
});

test("API v2 returns indeterminate when confirmed Accept evidence lacks verified control proof", () => {
  const retained = {
    ...fixture(),
    runtimeArtifacts: {
      postAcceptEvidenceProjection: {
        status: "confirmed_observation",
        acceptanceExercised: true,
        observationCount: 1,
        productionProjectable: false,
        evidenceDisposition: "indeterminate",
        indeterminateReason: "verified_action_control_proof_missing",
        completedAt: "2026-09-01T12:00:09.000Z",
        contradictionObserved: false,
        postAcceptActivity: [{ activityType: "network_request" }],
        limitations: [],
      },
    },
  } as unknown as ScanDetailResponse;

  const resource = buildApiV2ScanResource(retained);
  assert.equal(resource.postAcceptObservation?.evidenceDisposition, "indeterminate");
  assert.equal(
    resource.postAcceptObservation?.indeterminateReason,
    "verified_action_control_proof_missing",
  );
  assert.equal(resource.postAcceptObservation?.productionProjectable, false);
  assert.equal(resource.postAcceptObservation?.observationCount, 0);
  assert.equal(resource.postAcceptObservation?.verdict, "no_confirmed_post_accept_verdict");
  assert.match(
    resource.postAcceptObservation?.interpretation ?? "",
    /not tied to a verified Accept control/,
  );
});

test("API v2 fails closed when a joined Accept observation window was truncated", () => {
  const retained = {
    ...fixture(),
    runtimeArtifacts: {
      postAcceptEvidenceProjection: {
        status: "confirmed_observation",
        acceptanceExercised: true,
        observationCount: 1,
        productionProjectable: false,
        completedAt: "2026-09-01T12:00:05.000Z",
        contradictionObserved: false,
        postAcceptActivity: [{ activityType: "network_request" }],
        limitations: ["observer_result_budget_exhausted_after_confirmed_acceptance"],
      },
      postAcceptObservationCoverage: {
        completedAt: "2026-09-01T12:00:05.000Z",
        evidenceJoined: true,
        limitationCode: "accept_observation_window_truncated",
        maxTailWaitMs: 6_000,
        status: "limited",
      },
    },
  } as unknown as ScanDetailResponse;

  const resource = buildApiV2ScanResource(retained);
  const status = buildApiV2ScanStatus(retained, { canonicalScan: resource });
  assert.deepEqual(resource.postAcceptObservation, {
    status: "aborted",
    acceptanceExercised: false,
    observationCount: 0,
    productionProjectable: false,
    evidenceDisposition: "indeterminate",
    indeterminateReason: "accept_observation_window_truncated",
    verdict: "no_confirmed_post_accept_verdict",
    interpretation: "Accept was confirmed, but the bounded post-accept observation window was truncated, so no production post-accept verdict was established.",
    observationStrategy: "not_applicable",
    termination: {
      kind: "unavailable",
      intentional: false,
      trigger: "accept_observation_window_truncated",
    },
    completedAt: "2026-09-01T12:00:05.000Z",
    coverageLimitations: ["Accept was confirmed, but the bounded post-accept observation window was truncated, so no production post-accept verdict was established."],
    limitations: ["Accept was confirmed, but the bounded post-accept observation window was truncated, so no production post-accept verdict was established."],
  });
  assert.deepEqual(status.postAcceptObservation, resource.postAcceptObservation);
  assert.ok(resource.coverage?.limitations?.includes(
    "Accept was confirmed, but the bounded post-accept observation window was truncated.",
  ));
});

test("API v2 and status expose a six-second Reject Path timeout as a neutral limitation", () => {
  const retained = {
    ...fixture(),
    runtimeArtifacts: {
      postRefusalObservationCoverage: {
        completedAt: "2026-08-26T12:00:16.000Z",
        evidenceJoined: false,
        limitationCode: "reject_path_timeout",
        maxTailWaitMs: 6_000,
        status: "limited",
      },
    },
  } as unknown as ScanDetailResponse;

  const resource = buildApiV2ScanResource(retained);
  const status = buildApiV2ScanStatus(retained, { canonicalScan: resource });
  assert.deepEqual(resource.postRefusalObservation, {
    status: "aborted",
    refusalExercised: false,
    observationCount: 0,
    productionProjectable: false,
    evidenceDisposition: "indeterminate",
    indeterminateReason: "reject_path_timeout",
    verdict: "no_confirmed_post_refusal_verdict",
    interpretation: "Reject Path did not complete within the six-second post-primary allowance, so no post-refusal verdict was established.",
    observationStrategy: "not_applicable",
    termination: {
      kind: "unavailable",
      intentional: false,
      trigger: "reject_path_timeout",
    },
    completedAt: "2026-08-26T12:00:16.000Z",
    coverageLimitations: ["Reject Path did not complete within the six-second post-primary allowance, so no post-refusal verdict was established."],
    limitations: ["Reject Path did not complete within the six-second post-primary allowance, so no post-refusal verdict was established."],
  });
  assert.deepEqual(status.postRefusalObservation, resource.postRefusalObservation);
  assert.ok(resource.coverage?.limitations?.includes(
    "Reject Path did not complete within the six-second post-primary allowance.",
  ));
});

test("buildApiV2ScanResource preserves the configured page path", () => {
  const resource = buildApiV2ScanResource(fixture({
    scanConfigJson: { normalizedUrl: "https://example.com/test/consent.html" }
  }));

  assert.equal(resource.url, "https://example.com/test/consent.html");
});

test("API v2 resource links honor the configured app origin", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

  try {
    const resource = buildApiV2ScanResource(fixture());
    assert.equal(resource.links?.self, "http://localhost:3000/api/v2/scans/00000000-0000-4000-8000-000000000123");
    assert.equal(resource.links?.status, "http://localhost:3000/api/v2/scans/00000000-0000-4000-8000-000000000123/status");
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
  }
});

test("buildApiV2ScanResource marks partial coverage without exposing raw evidence", () => {
  const resource = buildApiV2ScanResource(fixture({ pagesRequested: 4, pagesScanned: 1 }));

  assert.equal(resource.coverage?.status, "partial");
  assert.deepEqual(resource.coverage?.limitations, ["Automated public-web scan only."]);
  assert.equal("rawEvidence" in resource, false);
});

test("API v2 scan resource and status preserve every canonical no-go reason", () => {
  for (const reasonCode of SCAN_NO_GO_REASON_CODES) {
    const presentation = SCAN_NO_GO_REASON_PRESENTATIONS[reasonCode];
    const scanRecord = {
      ...fixture({ pagesScanned: 0 }),
      runtimeArtifacts: {
        scan_no_go_assessment: {
          decision: "no_go",
          reasonCodes: [reasonCode, "scan_no_go_corroborated"]
        },
        visual_access_review: {
          page_state: presentation.pageState,
          reason_code: reasonCode
        }
      }
    } as ScanDetailResponse;
    const resource = buildApiV2ScanResource(scanRecord);
    const status = buildApiV2ScanStatus(scanRecord);

    assert.equal(resource.status, "completed_limited", reasonCode);
    assert.equal(status.status, "completed_limited", reasonCode);
    assert.equal(resource.resultDisposition, "no_go", reasonCode);
    assert.equal(resource.noGo?.reasonCode, reasonCode, reasonCode);
    assert.equal(resource.noGo?.title, presentation.customerTitle, reasonCode);
    assert.equal(resource.noGo?.recommendedNextAction, presentation.recommendedNextAction, reasonCode);
    assert.equal(resource.score, null, reasonCode);
    assert.equal(resource.riskLevel, null, reasonCode);
    assert.equal(status.retryAfterSeconds, null, reasonCode);
  }
});

test("buildApiV2ScanDiagnostics projects bounded phase and policy discovery timings", () => {
  const scanRecord = {
    ...fixture({
      executionSummary: {
        completedAt: "2026-06-30T12:00:10.000Z",
        contractVersion: "scanner-execution.v1",
        degradedStages: [],
        failureCategory: null,
        lifecycle: "completed",
        startedAt: "2026-06-30T12:00:01.000Z",
        updatedAt: "2026-06-30T12:00:10.000Z",
        stages: [
          {
            attempts: 1,
            completedAt: "2026-06-30T12:00:05.000Z",
            durationMs: 3000,
            errorCategory: null,
            message: null,
            metadata: null,
            outcome: "success",
            recoverable: false,
            stage: "runtime_snapshot_capture",
            startedAt: "2026-06-30T12:00:02.000Z"
          }
        ]
      }
    }),
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          discoveryDebug: {
            candidateCount: 20,
            prefetchTargets: [
              { url: "https://example.com/privacy" },
              { url: "https://example.com/privacy" },
              { url: "https://example.com/cookies" }
            ]
          },
          phase: "page_discovery_fetch",
          prefetchTargetCount: 3,
          staticFetchConcurrency: 3,
          status: "ok",
          subtimings: { prefetchedPageCount: 2 }
        }
      }
    ],
    runtimeArtifacts: {
      v2DagPolicyDiscoveryDiagnostics: {
        candidatesDiscovered: 24,
        candidatesAfterDeduplication: 18,
        requestsStarted: 4,
        successfulDocuments: 3,
        timeouts: 1,
        phaseWallMs: 1500,
        maxConcurrency: 4,
        shortCircuitReason: "v2_static_short_circuit"
      },
      buildPhaseSummaries: [
        {
          attempts: 1,
          completedAt: "2026-06-30T12:00:07.200Z",
          durationMs: 1200,
          error: null,
          outcome: "success",
          phase: "policy_enrichment",
          startedAt: "2026-06-30T12:00:06.000Z"
        }
      ],
      scanLaneRuns: [
        {
          laneId: "runtime_evidence",
          physicalInvocationId: "aws-request-runtime-1",
          region: "eu-west-1",
          phaseName: "preConsentRuntimeScanner",
          startedAt: "2026-06-30T12:00:02.000Z",
          firstResponseAt: "2026-06-30T12:00:02.120Z",
          firstResponseOffsetMs: 120,
          firstHttpStatus: 403,
          firstEffectiveUrl: "https://example.com/?token=%5Bredacted%5D",
          navigationCount: 1,
          challengeDetected: true,
          challengeType: "captcha_or_challenge",
          executionOutcome: "success",
          accessOutcome: "bot_challenge",
          completedAt: "2026-06-30T12:00:05.000Z",
          durationMs: 3000
        }
      ]
    }
  } as unknown as ScanDetailResponse;

  const diagnostics = buildApiV2ScanDiagnostics(scanRecord);
  assert.equal(diagnostics.totalWallMs, 9000);
  assert.equal(diagnostics.phases.find((phase) => phase.name === "runtime_snapshot_capture")?.lane, "browser");
  assert.equal(diagnostics.policyDiscovery.candidatesDiscovered, 24);
  assert.equal(diagnostics.policyDiscovery.candidatesAfterDeduplication, 18);
  assert.equal(diagnostics.policyDiscovery.requestsStarted, 4);
  assert.equal(diagnostics.policyDiscovery.successfulDocuments, 3);
  assert.equal(diagnostics.policyDiscovery.timeouts, 1);
  assert.equal(diagnostics.policyDiscovery.phaseWallMs, 1500);
  assert.equal(diagnostics.policyDiscovery.maxConcurrency, 4);
  assert.equal(diagnostics.policyDiscovery.shortCircuitReason, "v2_static_short_circuit");
  assert.equal(diagnostics.lanes.length, 1);
  assert.equal(diagnostics.lanes[0]?.physicalInvocationId, "aws-request-runtime-1");
  assert.equal(diagnostics.lanes[0]?.firstResponse?.httpStatus, 403);
  assert.equal(diagnostics.lanes[0]?.executionOutcome, "success");
  assert.equal(diagnostics.lanes[0]?.accessOutcome, "bot_challenge");
});

test("buildApiV2ScanDiagnostics normalizes database Date timestamps", () => {
  const scanRecord = fixture({
    startedAt: new Date("2026-06-30T12:00:01.000Z") as unknown as string,
    completedAt: new Date("2026-06-30T12:00:10.000Z") as unknown as string
  });

  const diagnostics = buildApiV2ScanDiagnostics(scanRecord);

  assert.equal(diagnostics.generatedAt, "2026-06-30T12:00:10.000Z");
  assert.equal(diagnostics.totalWallMs, 9000);
});

test("buildApiV2Error returns the shared error envelope", () => {
  const error = buildApiV2Error({ code: "not_found", message: "Scan not found." });

  assert.equal(error.type, "certscore_api_error");
  assert.equal(error.error.code, "not_found");
  assert.equal(error.error.retryable, false);
  assert.equal(error.error.retryAfterSeconds, null);
  assert.ok(error.error.recommendedNextAction);
  assert.equal(error.links.docs, "https://certscore.ai/api/v2/openapi.json");
});

test("buildApiV2ScanStatus exposes public scan status links", () => {
  const status = buildApiV2ScanStatus(fixture());

  assert.equal(status.type, "certscore_scan_job");
  assert.equal(status.jobId, "00000000-0000-4000-8000-000000000123");
  assert.equal(status.status, "completed");
  assert.equal(status.phase, "completed");
  assert.equal(status.startedAt, "2026-06-30T12:00:01.000Z");
  assert.equal(status.completedAt, "2026-06-30T12:00:10.000Z");
  assert.equal(status.scanTimeSeconds, 9);
  assert.equal(status.url, "https://example.com");
  assert.equal(status.scanFrom, "eu_ie");
  assert.equal(status.score, 32);
  assert.equal(status.scoreStatus, "final");
  assert.equal(status.scoreVersion, "overall-score.v1");
  assert.equal(status.scoreUpdatedAt, "2026-06-30T12:00:10.000Z");
  assert.equal(status.riskLevel, "significant_review_recommended");
  assert.equal(status.coverage?.status, "complete");
  assert.equal(status.retryAfterSeconds, null);
  assert.equal(status.lastHeartbeatAt, "2026-06-30T12:00:10.000Z");
  assert.equal(status.progressPercent, 100);
  assert.equal(status.stalled, false);
  assert.equal(status.reportUrl, "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123");
  assert.match(status.recommendedNextAction ?? "", /certscore_get_scan_bundle/);
  assert.equal(status.links?.findings, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings");
});

test("buildApiV2ScanStatus preserves every supported canonical execution region", () => {
  for (const scanFrom of ["eu_de", "eu_ie", "california"] as const) {
    const status = buildApiV2ScanStatus(fixture({ scanFromValue: scanFrom }));
    assert.equal(status.scanFrom, scanFrom);
  }
});

test("buildApiV2ScanStatus does not invent unavailable execution provenance", () => {
  const status = buildApiV2ScanStatus(fixture({ scanFromValue: "default" }));
  assert.equal(status.scanFrom, undefined);
});

test("buildApiV2ScanStatus keeps completed scanner work finalizing until the canonical score is ready", () => {
  const scanRecord = {
    ...fixture(),
    snapshot: {
      certscore_overall: 71,
      report_projection_status: "pending",
      score_scored_at: null,
      score_version: null
    }
  } as unknown as ScanDetailResponse;
  const status = buildApiV2ScanStatus(scanRecord, {
    nowMs: Date.parse("2026-06-30T12:00:30.000Z")
  });
  const resource = buildApiV2ScanResource(scanRecord);

  assert.equal(status.status, "finalizing");
  assert.equal(status.phase, "report_finalization");
  assert.equal(status.progressPercent, 89);
  assert.equal(status.progressIsEstimate, true);
  assert.equal(status.links?.findings, undefined);
  assert.equal(resource.status, "finalizing");
  assert.equal(resource.scoreStatus, "provisional");
});

test("buildApiV2ScanStatus fails closed when canonical report projection fails", () => {
  const scanRecord = {
    ...fixture(),
    snapshot: {
      certscore_overall: null,
      report_projection_status: "failed",
      report_projection_error: "private internal detail"
    }
  } as unknown as ScanDetailResponse;
  const status = buildApiV2ScanStatus(scanRecord);

  assert.equal(status.status, "failed");
  assert.equal(status.error?.code, "report_projection_failed");
  assert.equal(status.error?.retryable, true);
  assert.doesNotMatch(JSON.stringify(status), /private internal detail/);
});

test("buildApiV2ScanStatus degrades unknown scan states to running", () => {
  const early = buildApiV2ScanStatus(fixture({ status: "materializing" }), {
    nowMs: Date.parse("2026-06-30T12:00:11.000Z")
  });
  const status = buildApiV2ScanStatus(fixture({ status: "materializing" }), {
    nowMs: Date.parse("2026-06-30T12:03:00.000Z")
  });

  assert.equal(status.status, "running");
  assert.equal(status.phase, "runtime_observation");
  assert.equal(status.retryAfterSeconds, 5);
  assert.ok((status.progressPercent ?? 0) > (early.progressPercent ?? 0));
  assert.equal(status.progressIsEstimate, true);
  assert.equal(status.estimatedRemainingSeconds, null);
  assert.equal(status.stalled, true);
  assert.equal(status.links?.findings, undefined);
});

test("buildApiV2ScanStatus returns bounded terminal failure guidance", () => {
  const status = buildApiV2ScanStatus(fixture({
    status: "failed",
    completedAt: "2026-06-30T12:01:20.000Z",
    errorMessage: "Navigation timeout after 80000ms with internal target details"
  }));

  assert.equal(status.status, "failed");
  assert.deepEqual(status.error, {
    code: "navigation_timeout",
    message: "The public site did not finish navigation within the scan budget.",
    retryable: true,
    retryAfterSeconds: 30,
    recommendedNextAction: "Retry certscore_scan_site with freshness=refresh after the recommended delay."
  });
  assert.doesNotMatch(JSON.stringify(status), /internal target details/);
});

test("active scan retry timing is fast initially and backs off for long scans", () => {
  const startedAt = "2026-06-30T12:00:00.000Z";
  assert.equal(apiV2ActiveScanRetryAfterSeconds({ startedAt, nowMs: Date.parse("2026-06-30T12:00:10.000Z") }), 1);
  assert.equal(apiV2ActiveScanRetryAfterSeconds({ startedAt, nowMs: Date.parse("2026-06-30T12:00:20.000Z") }), 2);
  assert.equal(apiV2ActiveScanRetryAfterSeconds({ startedAt, nowMs: Date.parse("2026-06-30T12:01:00.000Z") }), 5);
});

test("buildApiV2ScanStatus leaves runtime duration unknown instead of zero when timestamps are incomplete", () => {
  const status = buildApiV2ScanStatus(fixture({ completedAt: null, startedAt: null, status: "running" }));

  assert.equal(status.status, "running");
  assert.equal(status.startedAt, null);
  assert.equal(status.completedAt, null);
  assert.equal(status.scanTimeSeconds, null);
});

test("buildApiV2ScanJobFromPulseStatus maps pending Pulse jobs to v2 status", () => {
  const status = buildApiV2ScanJobFromPulseStatus({
    jobId: "pulse_job_123",
    scanId: "00000000-0000-4000-8000-000000000123",
    domain: "example.com",
    status: "queued",
    phase: "queued",
    createdAt: "2026-06-30T12:00:00.000Z",
    retryAfterSeconds: 45
  });

  assert.equal(status.type, "certscore_scan_job");
  assert.equal(status.jobId, "pulse_job_123");
  assert.equal(status.scanId, "00000000-0000-4000-8000-000000000123");
  assert.equal(status.status, "queued");
  assert.equal(status.retryAfterSeconds, 5);
  assert.equal(status.links?.status, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/status");
});

test("buildApiV2ScanJobFromPulseStatus preserves a preliminary runtime preview on an active job", () => {
  const status = buildApiV2ScanJobFromPulseStatus({
    jobId: "pulse_job_preview",
    scanId: "00000000-0000-4000-8000-000000000123",
    domain: "example.com",
    status: "running",
    preConsentPreview: {
      type: "certscore_pre_consent_preview",
      resultStage: "preliminary",
      final: false,
      sourceLane: "runtime_evidence",
      generatedAt: "2026-08-28T18:00:03.000Z",
      runtimeCoverage: { status: "usable", limitationKeys: [] },
      summary: { cookieCount: 1, trackerCount: 1, thirdPartyRequestCount: 1, vendorCount: 1 },
      cookies: [{
        name: "_ga",
        domain: "example.com",
        party: "first_party",
        purpose: "analytics",
        essentiality: "non_essential",
        observedAtMs: 1_200,
      }],
      trackers: [{
        vendor: "Google",
        product: "Google Analytics",
        purpose: "analytics",
        confidence: 0.96,
        domains: ["www.google-analytics.com"],
      }],
      truncated: { cookies: false, trackers: false },
      mustContinuePolling: true,
      observationOnlyDisclaimer: "Preliminary passive observations only; continue polling for the canonical result.",
    },
  });

  assert.equal(status.status, "running");
  assert.equal(status.preConsentPreview?.summary.trackerCount, 1);
  assert.equal(status.preConsentPreview?.final, false);
  assert.equal(status.preConsentPreview?.mustContinuePolling, true);
});

test("buildApiV2ScanJobFromPulseStatus preserves a requested page path", () => {
  const status = buildApiV2ScanJobFromPulseStatus({
    jobId: "job-path",
    scanId: "scan-path",
    domain: "ergoveritas.com",
    status: "queued"
  }, {
    requestedUrl: "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html"
  });

  assert.equal(
    status.url,
    "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html"
  );
});

test("buildApiV2ScanJobFromPulseStatus preserves completed status timing for SDK consumers", () => {
  const status = buildApiV2ScanJobFromPulseStatus({
    jobId: "pulse_job_123",
    scanId: "00000000-0000-4000-8000-000000000123",
    domain: "example.com",
    status: "completed",
    phase: "completed",
    createdAt: "2026-06-30T12:00:00.000Z",
    startedAt: "2026-06-30T12:00:01.000Z",
    completedAt: "2026-06-30T12:00:06.100Z"
  });

  assert.equal(status.status, "completed");
  assert.equal(status.startedAt, "2026-06-30T12:00:01.000Z");
  assert.equal(status.completedAt, "2026-06-30T12:00:06.100Z");
  assert.equal(status.scanTimeSeconds, 5.1);
});

test("terminal Pulse statuses always include actionable bounded errors", () => {
  for (const statusValue of ["failed", "expired", "rate_limited"] as const) {
    const status = buildApiV2ScanJobFromPulseStatus({
      jobId: "pulse_job_123",
      scanId: "00000000-0000-4000-8000-000000000123",
      status: statusValue,
      retryAfterSeconds: statusValue === "rate_limited" ? 45 : null
    });

    assert.equal(status.status, statusValue);
    assert.equal(status.error?.retryable, true);
    assert.ok(status.error?.code);
    assert.ok(status.error?.message);
    assert.ok(status.error?.recommendedNextAction);
    assert.equal(status.retryAfterSeconds, status.error?.retryAfterSeconds);
  }
});

test("buildApiV2ErrorFromPulse maps Pulse throttles to v2 rate-limit errors", () => {
  const error = buildApiV2ErrorFromPulse({
    body: {
      error: {
        code: "pulse_throttled",
        creationRateLimit: {
          kind: "concurrency",
          limit: 4,
          remaining: 0,
          scope: "session",
          used: 4,
          windowId: "concurrent",
          windowSeconds: null
        },
        message: "A Pulse scan for this domain was requested recently.",
        retryAfterSeconds: 60
      }
    },
    fallbackMessage: "Request failed.",
    status: 429
  });

  assert.equal(error.error.code, "rate_limited");
  assert.equal(error.error.retryable, true);
  assert.equal(error.error.recommendedNextAction, "Wait for the recommended delay, then retry the same request.");
  assert.equal(error.error.retryAfterSeconds, 60);
  assert.deepEqual(error.error.creationRateLimit, {
    kind: "concurrency",
    limit: 4,
    remaining: 0,
    scope: "session",
    used: 4,
    windowId: "concurrent",
    windowSeconds: null
  });
});

test("buildApiV2ErrorFromPulse preserves non-public target classification", () => {
  const error = buildApiV2ErrorFromPulse({
    body: { error: { code: "invalid_url", message: "Target is not eligible.", reasonCode: "non_public_target" } },
    fallbackMessage: "Request failed.",
    status: 400
  });
  assert.equal(error.error.code, "invalid_url");
  assert.equal(error.error.reasonCode, "non_public_target");
  assert.equal(error.error.retryable, false);
});

test("buildApiV2DomainLatestScan wraps the latest public scan or null", () => {
  const withScan = buildApiV2DomainLatestScan({
    domain: "example.com",
    scanRecord: fixture()
  });
  const withoutScan = buildApiV2DomainLatestScan({
    domain: "missing.example",
    scanRecord: null
  });

  assert.equal(withScan.type, "certscore_domain_latest_scan");
  assert.equal(withScan.scan?.scanId, "00000000-0000-4000-8000-000000000123");
  assert.equal(withScan.links?.pulse, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/pulse");
  assert.equal(withoutScan.scan, null);
  assert.equal(withoutScan.links?.docs, "https://certscore.ai/api/v2/openapi.json");
});

test("API v2 resources serialize production Date timestamps", () => {
  const scanRecord = retainedPreConsentInventoryFixture();
  scanRecord.scan.createdAt = new Date("2026-06-30T12:00:00.000Z") as unknown as string;
  scanRecord.scan.startedAt = new Date("2026-06-30T12:00:01.000Z") as unknown as string;
  scanRecord.scan.completedAt = new Date("2026-06-30T12:00:10.000Z") as unknown as string;

  const scan = buildApiV2ScanResource(scanRecord);
  const status = buildApiV2ScanStatus(scanRecord);
  const latest = buildApiV2DomainLatestScan({
    domain: "example.com",
    scanRecord
  });
  const inventory = buildApiV2PreConsentCookiesTrackers(scanRecord);

  assert.equal(scan.createdAt, "2026-06-30T12:00:00.000Z");
  assert.equal(scan.startedAt, "2026-06-30T12:00:01.000Z");
  assert.equal(scan.completedAt, "2026-06-30T12:00:10.000Z");
  assert.equal(status.createdAt, "2026-06-30T12:00:00.000Z");
  assert.equal(status.lastUpdatedAt, "2026-06-30T12:00:10.000Z");
  assert.equal(latest.scan?.createdAt, "2026-06-30T12:00:00.000Z");
  assert.equal(inventory.generatedAt, "2026-06-30T12:00:10.000Z");
});

test("buildApiV2ScanPulse wraps an existing Pulse projection", () => {
  const wrapped = buildApiV2ScanPulse({
    scanId: "00000000-0000-4000-8000-000000000123",
    pulse: {
      type: "certscore_pulse",
      scanId: "00000000-0000-4000-8000-000000000123",
      summary: { score: 72 },
      topFindings: []
    }
  });

  assert.equal(wrapped.type, "certscore_scan_pulse");
  assert.equal(wrapped.pulse.type, "certscore_pulse");
  assert.equal(wrapped.links?.self, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/pulse");
});

test("projectedFindingsFromPulse deduplicates full and top findings", () => {
  const findings = projectedFindingsFromPulse({
    type: "certscore_pulse",
    scanId: "00000000-0000-4000-8000-000000000123",
    summary: { score: 72 },
    topFindings: [{ id: "pre_consent_tracking_detected", label: "Tracking started before consent" }],
    findings: [
      { id: "pre_consent_tracking_detected", label: "Tracking started before consent" },
      { id: "cookie_disclosure_gap", label: "Cookie disclosure gap" }
    ]
  });

  assert.deepEqual(
    findings.map((finding) => finding.id),
    ["pre_consent_tracking_detected", "cookie_disclosure_gap"]
  );
});

test("buildApiV2FindingList maps public Pulse findings into compact v2 summaries", () => {
  const list = buildApiV2FindingList({
    scanId: "00000000-0000-4000-8000-000000000123",
    findings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Tracking started before consent",
        criticality: "high",
        confidence: "good",
        plainEnglish: "A third-party tracking request was observed before consent.",
        evidence: {
          summary: "Representative tracker request was retained in the public report projection.",
          observedPhase: "before_consent",
          exampleEvents: [
            {
              type: "request",
              vendor: "Sourcepoint CMP",
              urlHost: "analytics.example.test",
              registrableDomain: "example.test",
              timestampMs: 123,
              requestUrl: "https://analytics.example.test/collect?email=person@example.com&token=secret",
              rawObservedVendor: "Amazon Ads",
              rawObservedVendorCategory: "advertising",
              resolvedEndpointVendor: "Sourcepoint CMP",
              resolvedEndpointVendorCategory: "cmp",
              vendorAttributionBasis: "canonical_endpoint",
              relatedOrInitiatingVendor: "Amazon Ads",
              pageContextId: "primary_document",
              scannedPageUrl: "https://example.com/?session=secret",
              frameUrl: "https://frame.example.test/embed?uid=secret",
              finalUrl: "https://analytics.example.test/final?uid=secret",
              initiatorHost: "www.example.com",
              initiatorType: "script",
              initiatorUrl: "https://www.example.com/app.js?build=secret",
              redirectChain: ["https://analytics.example.test/start?uid=secret"],
              resourceType: "script",
              projectionWarnings: ["canonical_endpoint_vendor_replaced_raw_vendor"],
              rawRequestBody: "must not be copied"
            },
            {
              type: "request",
              urlHost: "cdn.example.test",
              scannedPageUrl: "https://img.example.test/favicon.ico",
              requestUrl: "https://img.example.test/logo.png"
            },
            { type: "request", urlHost: "tag.example.test" },
            { type: "request", urlHost: "pixel.example.test" },
            { type: "request", urlHost: "ads.example.test" },
            { type: "request", urlHost: "extra.example.test" }
          ]
        },
        evidenceDigest: {
          basis: "runtime_observation",
          phase: "pre_consent",
          exampleCount: 6,
          examplesShown: 6,
          examplesAvailable: 6,
          authRequiredForExamples: false,
          hasTimingAnchor: true,
          hasVendorAnchor: true,
          hasConsentContext: true,
          projectionWarnings: ["canonical_endpoint_vendor_replaced_raw_vendor"]
        },
        reviewLenses: ["GDPR / ePrivacy", "FTC"],
        nextStep: "Review retained evidence."
      }
    ]
  });

  const finding = list.findings[0];
  assert.equal(list.type, "certscore_finding_list");
  assert.equal(finding?.type, "certscore_finding");
  assert.equal(finding?.criticality, "high");
  assert.equal(finding?.confidence, "good");
  assert.equal(finding?.evidence.basis, "runtime_observation");
  assert.equal(finding?.evidence.phase, "pre_consent");
  assert.equal(finding?.evidence.examples?.length, 5);
  assert.equal(finding?.evidence.examplesShown, 5);
  assert.equal(finding?.evidence.examplesAvailable, 6);
  assert.equal(finding?.evidence.authRequiredForExamples, false);
  assert.equal(finding?.evidence.examples?.[0]?.observedAtMs, 123);
  assert.equal(finding?.evidence.examples?.[0]?.vendor, "Sourcepoint CMP");
  assert.equal(finding?.evidence.examples?.[0]?.requestUrl, "https://analytics.example.test/collect?redacted=1");
  assert.equal(finding?.evidence.examples?.[0]?.rawObservedVendor, "Amazon Ads");
  assert.equal(finding?.evidence.examples?.[0]?.resolvedEndpointVendor, "Sourcepoint CMP");
  assert.equal(finding?.evidence.examples?.[0]?.vendorAttributionBasis, "canonical_endpoint");
  assert.equal(finding?.evidence.examples?.[0]?.relatedOrInitiatingVendor, "Amazon Ads");
  assert.equal(finding?.evidence.examples?.[0]?.documentUrl, "https://example.com/?redacted=1");
  assert.equal(finding?.evidence.examples?.[0]?.pageContextId, "primary_document");
  assert.equal(finding?.evidence.examples?.[0]?.scannedPageUrl, "https://example.com/?redacted=1");
  assert.equal(finding?.evidence.examples?.[1]?.documentUrl, null);
  assert.equal(finding?.evidence.examples?.[1]?.scannedPageUrl, null);
  assert.equal(finding?.evidence.examples?.[1]?.requestUrl, "https://img.example.test/logo.png");
  assert.equal(finding?.evidence.examples?.[0]?.frameUrl, "https://frame.example.test/embed?redacted=1");
  assert.equal(finding?.evidence.examples?.[0]?.finalUrl, "https://analytics.example.test/final?redacted=1");
  assert.equal(finding?.evidence.examples?.[0]?.initiatorHost, "www.example.com");
  assert.equal(finding?.evidence.examples?.[0]?.initiatorType, "script");
  assert.equal(finding?.evidence.examples?.[0]?.initiatorUrl, "https://www.example.com/app.js?redacted=1");
  assert.deepEqual(finding?.evidence.examples?.[0]?.redirectChain, ["https://analytics.example.test/start?redacted=1"]);
  assert.equal(finding?.evidence.examples?.[0]?.resourceType, "script");
  assert.deepEqual(finding?.evidence.examples?.[0]?.projectionWarnings, ["canonical_endpoint_vendor_replaced_raw_vendor"]);
  assert.deepEqual(finding?.evidence.projectionWarnings, ["canonical_endpoint_vendor_replaced_raw_vendor"]);
  assert.equal(finding?.evidence.excerpt?.isTruncated, false);
  assert.equal(finding?.evidence.excerpt?.sourceUrl, "https://example.com/?redacted=1");
  assert.equal(finding?.evidence.excerpt?.truncationMarker, null);
  assert.match(finding?.evidence.excerpt?.evidenceUrl ?? "", /findings\/pre_consent_tracking_detected$/);
  assert.equal("rawRequestBody" in (finding?.evidence.examples?.[0] ?? {}), false);
  assert.equal(finding?.links?.self, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings/pre_consent_tracking_detected");
});

test("API v2 finding lists preserve canonical post-Accept finding IDs", () => {
  const list = buildApiV2FindingList({
    scanId: "00000000-0000-4000-8000-000000000123",
    findings: [{
      id: "post_accept_consent_dependent_activity",
      label: "Consent-dependent activity observed after acceptance",
      criticality: "low",
      confidence: "strong",
      plainEnglish: "Confirmed acceptance was followed by eligible non-essential analytics activity.",
      evidence: {
        summary: "A bounded post-Accept request observation was retained.",
        observedPhase: "post_accept",
        exampleEvents: [{
          type: "request",
          urlHost: "analytics.example.test",
          timestampMs: 670,
        }],
      },
      evidenceDigest: {
        basis: "runtime_observation",
        phase: "post_accept",
        exampleCount: 1,
        examplesShown: 1,
        examplesAvailable: 1,
        authRequiredForExamples: false,
        hasTimingAnchor: true,
        hasVendorAnchor: false,
        hasConsentContext: true,
      },
      reviewLenses: ["GDPR / ePrivacy"],
      nextStep: "Compare the retained baseline with pre-consent and post-Reject behavior.",
    }],
  });

  assert.equal(list.findings[0]?.id, "post_accept_consent_dependent_activity");
  assert.equal(list.findings[0]?.evidence.phase, "post_accept");
  assert.equal(list.findings[0]?.criticality, "low");
});

test("buildApiV2FindingList makes retained excerpt truncation machine-readable", () => {
  const list = buildApiV2FindingList({
    scanId: "00000000-0000-4000-8000-000000000123",
    findings: [{
      id: "regulatory_gap__gdpr_eprivacy__automated_decision_making_profiling_disclosure",
      label: "Profiling disclosure needs review",
      evidence: {
        summary: "Policy evidence was retained: Some Mozilla.org pages use clear GIFs...[more in evidence packet]",
        exampleEvents: [{
          type: "policy_surface",
          documentUrl: "https://mozilla.org/en-US/privacy/websites"
        }]
      }
    }]
  });

  const excerpt = list.findings[0]?.evidence.excerpt;
  assert.equal(excerpt?.isTruncated, true);
  assert.equal(excerpt?.truncationMarker, "...[more in evidence packet]");
  assert.equal(excerpt?.sourceUrl, "https://mozilla.org/en-US/privacy/websites");
  assert.match(excerpt?.evidenceUrl ?? "", /automated_decision_making_profiling_disclosure$/);
});

test("buildApiV2FindingList derives evidence anchors from structured events when digest flags are absent", () => {
  const list = buildApiV2FindingList({
    scanId: "00000000-0000-4000-8000-000000000123",
    findings: [
      {
        id: "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
        label: "Reject path availability needs review",
        criticality: "medium",
        confidence: "good",
        plainEnglish: "A consent control was first seen 2310ms after scan start.",
        evidence: {
          summary: "OneTrust evidence was retained.",
          observedPhase: "before_consent",
          exampleEvents: [
            {
              type: "request",
              vendorName: "OneTrust",
              urlHost: "cdn.cookielaw.org",
              firstSeenMs: 2310,
              phase: "pre_consent"
            }
          ]
        },
        evidenceDigest: {
          basis: "runtime_observation",
          exampleCount: 1,
          examplesShown: 1,
          hasTimingAnchor: false,
          hasVendorAnchor: false
        }
      }
    ]
  });

  const finding = list.findings[0];
  assert.equal(finding?.confidence, "good");
  assert.equal(finding?.evidence.hasTimingAnchor, true);
  assert.equal(finding?.evidence.hasVendorAnchor, true);
  assert.equal(finding?.evidence.phase, "pre_consent");
  assert.equal(finding?.evidence.examples?.[0]?.vendor, "OneTrust");
  assert.equal(finding?.evidence.examples?.[0]?.observedAtMs, 2310);
});

test("buildApiV2FindingDetail uses unknown enums conservatively", () => {
  const detail = buildApiV2FindingDetail({
    scanId: "00000000-0000-4000-8000-000000000123",
    finding: {
      id: "coverage_limited",
      criticality: "severe",
      confidence: "absolute",
      plainEnglish: "Coverage was limited."
    },
    caveats: ["Coverage was limited; absence of findings should not be interpreted as absence of risk."]
  });

  assert.equal(detail.criticality, "unknown");
  assert.equal(detail.confidence, "unknown");
  assert.equal(detail.evidence.basis, "public_report_projection");
  assert.equal(detail.detail?.caveats?.[0], "Coverage was limited; absence of findings should not be interpreted as absence of risk.");
});

test("buildApiV2PreConsentCookiesTrackers matches the shared public report table projection", () => {
  const scanRecord = retainedPreConsentInventoryFixture();
  const projection = buildRuntimeInventoryProjectionFromScan(scanRecord);
  const resource = buildApiV2PreConsentCookiesTrackers(scanRecord);
  const secondResource = buildApiV2PreConsentCookiesTrackers(scanRecord);
  const serialized = JSON.stringify(resource);

  assert.equal(resource.type, "certscore_pre_consent_cookies_trackers");
  assert.equal(resource.summary.rowCount, projection.groupedRows.length);
  assert.equal(resource.rows.length, projection.groupedRows.length);
  assert.equal(resource.summary.cookieCount, new Set(projection.groupedRows.flatMap((row) =>
    row.cookieDetails.map((cookie) => `${cookie.cookieName}\u0000${cookie.domain ?? ""}`)
  )).size);
  assert.equal(resource.summary.trackerCount, projection.groupedRows.filter((row) => row.type === "tracker").length);
  assert.equal(resource.summary.trackerCountScope, "canonical_inventory_rows_including_operational");
  assert.equal(
    Object.values(resource.summary.trackerCategoryCounts ?? {}).reduce((sum, count) => sum + count, 0),
    resource.summary.trackerCount,
  );
  assert.ok(resource.summary.cookieCount > 0);
  assert.ok(resource.summary.trackerCount > 0);
  assert.deepEqual(
    resource.rows.map((row) => row.id),
    secondResource.rows.map((row) => row.id)
  );
  assert.ok(resource.rows.every((row) => !row.host || (!row.host.startsWith(".") && !row.host.startsWith("_") && row.host.includes("."))));
  const metaRow = resource.rows.find((row) => row.vendor === "Meta");
  assert.equal(metaRow?.kind, "cookie");
  assert.ok(metaRow?.domains?.includes("example.com"));
  assert.ok(metaRow?.cookieDetails?.some((cookie) => cookie.name === "_fbp"));
  const metaCookie = metaRow?.cookieDetails?.find((cookie) => cookie.name === "_fbp");
  assert.equal(metaCookie?.set_by_third_party_script, true);
  assert.equal(metaCookie?.setByThirdPartyScript, true);
  assert.equal(metaCookie?.description, "Supports advertising delivery and measurement.");
  assert.deepEqual(metaCookie?.dataTypes, ["advertising identifier"]);
  assert.equal(metaCookie?.expiresAt, "2027-09-01T00:00:00.000Z");
  assert.equal(metaCookie?.lifespanSeconds, 40000000);
  assert.equal(metaCookie?.lifespanSource, "max_age");
  assert.equal(metaCookie?.longLived, true);
  assert.equal(metaCookie?.essentiality, "non_essential");
  assert.equal(metaCookie?.essentialityConfidence, 0.98);
  assert.deepEqual(metaCookie?.essentialityReasonCodes, ["canonical_cookie_knowledge_match"]);
  assert.equal(metaCookie?.essentialitySource, "canonical_registry");
  assert.deepEqual(metaCookie?.initiatorChain, ["https://connect.facebook.net/fbevents.js"]);
  assert.deepEqual(metaRow?.dataFlows, []);
  assert.deepEqual(metaRow?.requestDetails?.[0], {
    cookieNamesSent: ["_fbp"],
    essentiality: "non_essential",
    hostname: "connect.facebook.net",
    identifierParameterNames: ["id"],
    initiatorUrl: "https://example.com/app.js",
    method: "POST",
    path: "/tr",
    responseCookieNamesSet: ["_fbp"],
    responseObserved: true,
    responseStorageAttempted: true,
    vendor: "Meta"
  });
  const klaviyoRow = resource.rows.find((row) => row.kind === "tracker" && row.vendor === "Klaviyo");
  assert.ok(klaviyoRow?.purposes?.includes("Marketing automation"));
  assert.equal(klaviyoRow?.category, "Advertising");
  assert.notEqual(klaviyoRow?.category, klaviyoRow?.purpose);
  assert.ok(resource.rows.every((row) => row.evidenceBasis === "public_report_projection"));
  assert.ok(resource.rows.every((row) => row.observedBeforeConsent === true));
  assert.ok(resource.rows.every((row) => !row.host?.includes("?")));
  assert.equal(resource.summary.vendorCount, resource.rows.length);
  assert.ok(resource.summary.domainCount > 0);
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("also-must-not-leak"), false);
  assert.equal(serialized.includes("person@example.com"), false);
  assert.equal(serialized.includes("rawRequestBody"), false);
  assert.equal(serialized.includes("cookieValue"), false);
  assert.equal(serialized.includes("token=secret"), false);
});

test("buildApiV2PreConsentCookiesTrackers maps report table rows without raw values or URLs", () => {
  const resource = buildApiV2PreConsentCookiesTrackers({
    ...fixture(),
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        vendorSummary: {
          rawThirdPartyDomains: ["tracker.example.test"]
        },
        cookieWriteObservations: [
          {
            cookieName: "_ga",
            cookieValue: "secret-cookie-value",
            domain: ".doubleclick.net",
            category: "advertising",
            beforeConsent: true,
            setAtMs: 123,
            sourceRequestUrl: "https://doubleclick.net/pixel?email=person@example.com",
            rawRequestBody: "token=secret"
          }
        ],
        requestObservations: [
          {
            host: "tracker.example.test",
            url: "https://tracker.example.test/collect?email=person@example.com",
            beforeConsent: true
          }
        ]
      }
    },
    trackerVendors: [
      {
        vendorName: "Example Analytics",
        vendorCategory: "analytics",
        beforeConsent: true,
        confidence: 0.95,
        scriptHost: "tracker.example.test/path?secret=true",
        detectionSource: "tracker inventory",
        firstSeenMs: 456,
        rawRequestBody: "secret"
      }
    ]
  } as unknown as ScanDetailResponse);

  const serialized = JSON.stringify(resource);

  assert.equal(resource.type, "certscore_pre_consent_cookies_trackers");
  assert.equal(resource.scanId, "00000000-0000-4000-8000-000000000123");
  assert.ok(resource.summary.rowCount >= 2);
  assert.ok(resource.summary.cookieCount >= 1);
  assert.ok(resource.summary.trackerCount >= 1);
  assert.ok(resource.rows.every((row) => row.evidenceBasis === "public_report_projection"));
  assert.ok(resource.rows.every((row) => row.phase === "pre_consent"));
  assert.ok(resource.rows.every((row) => !row.host?.includes("?")));
  assert.ok(resource.rows.every((row) => !row.host || (!row.host.startsWith(".") && !row.host.startsWith("_") && row.host.includes("."))));
  assert.ok(resource.rows.some((row) => row.kind === "tracker" && row.host === "tracker.example.test"));
  assert.equal(serialized.includes("secret-cookie-value"), false);
  assert.equal(serialized.includes("person@example.com"), false);
  assert.equal(serialized.includes("rawRequestBody"), false);
});

test("buildApiV2PreConsentCookiesTrackers returns a valid empty response", () => {
  const resource = buildApiV2PreConsentCookiesTrackers({
    ...fixture(),
    runtimeArtifacts: { hybrid_runtime_evidence: { vendorSummary: { rawThirdPartyDomains: [] } } },
    trackerVendors: []
  } as unknown as ScanDetailResponse);

  assert.equal(resource.type, "certscore_pre_consent_cookies_trackers");
  assert.deepEqual(resource.summary, {
    rowCount: 0,
    trackerCount: 0,
    trackerCountScope: "canonical_inventory_rows_including_operational",
    trackerCategoryCounts: {
      advertising: 0,
      analytics: 0,
      essential: 0,
      functional: 0,
      review: 0,
    },
    cookieCount: 0,
    requestCount: 0,
    vendorCount: 0,
    domainCount: 0
  });
  assert.deepEqual(resource.rows, []);
});
