import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { SCAN_NO_GO_REASON_CODES, SCAN_NO_GO_REASON_PRESENTATIONS } from "@website-signal-risk-scanner/shared";
import { pulseResponseSchema } from "@certscore/api-contracts";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, unknown>)[serverOnlyPath] = {
  exports: {},
  filename: serverOnlyPath,
  id: serverOnlyPath,
  isPreloading: false,
  loaded: true,
  path: serverOnlyPath,
  paths: []
};

const {
  assessPulseScanRecordQuality,
  buildCookieEvidenceExamples,
  buildRawHostInventory,
  buildTrackerFootprintBreakdown,
  buildPulseNoGoState,
  buildPulseProjection,
  deriveConsentPlatform,
  getPulseExecutiveActionLabel,
  hasProjectedFingerprintingFinding,
  hasMeaningfulPolicyAnchor,
  isPublicPulseApiFinding,
  projectedPolicySurfaceRows,
  selectPublicPulseFindingsFromUnifiedProjection
} = require("./projection") as typeof import("./projection");

test("Pulse fingerprinting highlights consume canonical projected findings", () => {
  assert.equal(hasProjectedFingerprintingFinding([]), false);
  assert.equal(hasProjectedFingerprintingFinding([{
    id: "device_identification_fingerprinting_signal_observed"
  }]), true);
  assert.equal(hasProjectedFingerprintingFinding([{
    id: "regulatory_gap__gdpr_eprivacy__device_identification_fingerprinting_signal_observed"
  }]), true);
});

test("Pulse evidence preserves canonical cookie, request, and policy provenance projections", () => {
  const scanRecord = pulseScanRecord({
    accessPostureSummary: {
      finalEffectiveUrl: "https://example.fr/",
      homepageFetchStatus: "ok",
      interruptionLabel: null,
      interruptionReason: null,
      stopOutcomeTitle: null,
      stopReason: null,
      stopReviewTitle: null
    },
    policyEnrichment: [{
      detectedLanguage: "en",
      directlyLinkedFromScannedPage: true,
      discoveryMethod: "footer_link",
      policy_page_title: "Example Privacy Notice",
      policy_page_type: "privacy_policy",
      policy_page_url: "https://example.fr/privacy",
      retrievedAt: "2026-08-01T20:00:00.000Z",
      status: "fetched",
      translationApplied: false
    }],
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        cookieWriteObservations: [{
          beforeConsent: true,
          category: "unknown",
          cookieName: "unclassified_cookie",
          domain: "example.fr",
          essentiality: "unknown",
          essentialityConfidence: null,
          essentialityReasonCodes: ["canonical_cookie_knowledge_no_match"],
          setMethod: "browser_snapshot"
        }],
        requestPurposeClassificationConfidence: [{
          cookieNamesSent: ["unclassified_cookie"],
          essentiality: "unknown",
          hostname: "metrics.example.net",
          identifierParameterNames: ["client_id"],
          initiatorUrl: "https://example.fr/app.js?secret=redacted",
          method: "POST",
          pathSample: "/collect",
          responseCookieNamesSet: [],
          responseObserved: true,
          responseStorageAttempted: false,
          vendor: "Example Metrics"
        }]
      },
      policyDisclosureSummary: {
        article13DisclosureSignals: [{
          disclosureType: "data_retention",
          evidenceText: "We retain account records while the account remains active and for statutory limitation periods.",
          selectedEvidenceStrength: "strong",
          selectedPolicySectionExcerpt: "We retain account records while the account remains active and for statutory limitation periods.",
          selectedPolicySectionHeading: "Retention",
          selectedPolicySectionUrl: "https://example.fr/privacy",
          source: "retained_policy_sections",
          status: "observed"
        }],
        policyDocumentProvenance: [{
          detectedLanguage: "en",
          directlyLinkedFromScannedPage: true,
          discoveryMethod: "footer_link",
          lastUpdatedText: "Updated July 2026",
          policyTitle: "Example Privacy Notice",
          retrievalTimestamp: "2026-08-01T20:00:00.000Z",
          sourceUrl: "https://example.fr/privacy",
          translationApplied: false
        }],
        policyEvidenceProvenanceContractVersion: "certscore.policy-evidence-provenance.v1",
        policyPrimaryLanguage: "en",
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://example.fr/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Privacy notice. ".repeat(400),
        scannedPageLanguage: "fr"
      }
    },
    scan: {
      completedAt: "2026-08-01T20:00:20.000Z",
      createdAt: "2026-08-01T20:00:00.000Z",
      domainHostname: "example.fr",
      id: "00000000-0000-4000-8000-000000000123",
      pagesRequested: 1,
      pagesScanned: 1,
      startedAt: "2026-08-01T20:00:01.000Z",
      status: "completed"
    },
    snapshot: {
      certscore_overall: 72,
      privacy_policy_present: true,
      score_source: "canonical.gdpr_eprivacy"
    }
  });

  const pulse = buildPulseProjection({
    detail: "evidence",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: "parity-fixture",
    requestedUrl: "https://example.fr/",
    resolutionMode: "test",
    scanRecord,
    waitSeconds: 0
  }) as Record<string, unknown>;
  pulseResponseSchema.parse(pulse);

  const cookies = (pulse.cookieStorageInventory as { items: Array<Record<string, unknown>> }).items;
  assert.equal(cookies[0]?.essentiality, "unknown");
  assert.deepEqual(cookies[0]?.essentialityReasonCodes, ["canonical_cookie_knowledge_no_match"]);

  const requests = (pulse.requestEvidenceInventory as { items: Array<Record<string, unknown>> }).items;
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.path, "/collect");
  assert.deepEqual(requests[0]?.identifierParameterNames, ["client_id"]);
  assert.equal(requests[0]?.initiatorUrl, "https://example.fr/app.js");

  const checklist = (pulse.gdprEprivacyChecklistRows as { items: Array<Record<string, unknown>> }).items;
  const retention = checklist.find((row) => row.id === "retention_disclosure_observed");
  const retainedEvidence = retention?.retainedEvidence as Record<string, unknown>;
  const provenance = retainedEvidence?.policyEvidenceProvenance as Record<string, unknown>;
  assert.equal(provenance?.policyTitle, "Example Privacy Notice");
  assert.equal(provenance?.detectedLanguage, "en");
  assert.equal(provenance?.bannerLanguage, "fr");
  assert.equal(provenance?.directlyLinkedFromScannedPage, true);
  assert.equal(provenance?.translationApplied, false);
});

test("Pulse projects canonical transport-security rows with bounded detail semantics", () => {
  const scanRecord = pulseScanRecord({
    runtimeArtifacts: {
      transportSecuritySummary: {
        evidenceRetained: true,
        evidenceRefs: ["ref_transport_security"],
        pageHttpsObserved: true,
        httpProbeAttempted: true,
        httpRedirectsToHttps: true,
        tlsProbeAttempted: true,
        validTlsCertificate: true,
        mixedContentObserved: false,
        mixedContentObservedCount: 0,
        insecureFormTransportObserved: false,
        formTransportCount: 1,
        sampledPageUrls: ["https://example.com/"]
      }
    },
    scan: {
      completedAt: "2026-08-01T20:00:20.000Z",
      createdAt: "2026-08-01T20:00:00.000Z",
      domainHostname: "example.com",
      id: "00000000-0000-4000-8000-000000000123",
      pagesRequested: 1,
      pagesScanned: 1,
      startedAt: "2026-08-01T20:00:01.000Z",
      status: "completed"
    },
    snapshot: {
      certscore_overall: 90,
      score_source: "canonical.gdpr_eprivacy"
    }
  });
  const project = (detail: "summary" | "evidence" | "full") => buildPulseProjection({
    detail,
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: `transport-${detail}`,
    requestedUrl: "https://example.com/",
    resolutionMode: "test",
    scanRecord,
    waitSeconds: 0
  }) as Record<string, any>;

  const summary = project("summary");
  const evidence = project("evidence");
  const full = project("full");
  pulseResponseSchema.parse(summary);
  pulseResponseSchema.parse(evidence);
  pulseResponseSchema.parse(full);

  assert.equal(summary.transportSecurity.status, "available");
  assert.equal(summary.transportSecurity.evidenceRetained, true);
  assert.equal(summary.transportSecurity.observationCounts.total, 5);
  assert.deepEqual(summary.transportSecurity.observations, []);
  assert.equal(evidence.transportSecurity.observations.length, 5);
  assert.deepEqual(
    evidence.transportSecurity.observations.map((row: Record<string, unknown>) => row.status),
    ["Observed", "Observed", "Observed", "Observed", "Observed"]
  );
  assert.equal(full.transportSecurity.retainedSummary.validTlsCertificate, true);
  assert.equal(full.transportSecurity.retainedSummary.httpRedirectsToHttps, true);
  assert.equal("hstsEnabled" in full.transportSecurity.retainedSummary, false);
  assert.equal("tlsVersionMinSupported" in full.transportSecurity.retainedSummary, false);
  assert.equal("cipherSuites" in full.transportSecurity.retainedSummary, false);
});

test("Pulse represents missing canonical transport-security evidence as unavailable", () => {
  const pulse = buildPulseProjection({
    detail: "evidence",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: "transport-unavailable",
    requestedUrl: "https://example.com/",
    resolutionMode: "test",
    scanRecord: pulseScanRecord({
      runtimeArtifacts: {},
      scan: {
        completedAt: "2026-08-01T20:00:20.000Z",
        createdAt: "2026-08-01T20:00:00.000Z",
        domainHostname: "example.com",
        id: "00000000-0000-4000-8000-000000000123",
        pagesRequested: 1,
        pagesScanned: 1,
        startedAt: "2026-08-01T20:00:01.000Z",
        status: "completed"
      }
    }),
    waitSeconds: 0
  }) as Record<string, any>;

  assert.equal(pulse.transportSecurity.status, "unavailable");
  assert.equal(pulse.transportSecurity.evidenceRetained, false);
  assert.equal(pulse.transportSecurity.observationCounts.unavailable, 5);
  assert.equal(
    pulse.transportSecurity.observations.every((row: Record<string, unknown>) => row.status === "Not testable"),
    true
  );
});

test("Pulse executive action label follows the same posture as the rendered report", () => {
  assert.equal(getPulseExecutiveActionLabel("Action Needed"), "Action Needed");
  assert.equal(getPulseExecutiveActionLabel("Watch"), "Monitor");
  assert.equal(getPulseExecutiveActionLabel("Clear"), "Complete");
});

test("Pulse exposes the canonical policy/runtime contradiction finding", () => {
  assert.equal(isPublicPulseApiFinding({
    id: "policy_behavior_conflict",
    section: "Financial & Claims"
  }), true);
});

function pulseScanRecord(overrides: Record<string, unknown> = {}) {
  return {
    accessPostureSummary: {
      homepageFetchStatus: null,
      interruptionLabel: null,
      interruptionReason: null,
      stopOutcomeTitle: null,
      stopReason: null,
      stopReviewTitle: null
    },
    domainBenchmark: null,
    events: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    regulatoryRisk: null,
    scan: {
      pagesRequested: 1,
      pagesScanned: 0,
      status: "completed"
    },
    signals: [],
    snapshot: {},
    trackerVendors: [],
    validationFindings: [],
    ...overrides
  } as never;
}

test("Pulse reports a Reject Path barrier timeout without changing completed scan status", () => {
  const pulse = buildPulseProjection({
    detail: "summary",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: "reject-timeout-fixture",
    requestedUrl: "https://example.com/",
    resolutionMode: "test",
    scanRecord: pulseScanRecord({
      accessPostureSummary: {
        homepageFetchStatus: "ok",
        interruptionLabel: null,
        interruptionReason: null,
        stopOutcomeTitle: null,
        stopReason: null,
        stopReviewTitle: null,
      },
      runtimeArtifacts: {
        postRefusalObservationCoverage: {
          completedAt: "2026-08-26T12:00:16.000Z",
          evidenceJoined: false,
          limitationCode: "reject_path_timeout",
          maxTailWaitMs: 6_000,
          status: "limited",
        },
      },
      scan: {
        completedAt: "2026-08-26T12:00:16.000Z",
        createdAt: "2026-08-26T12:00:00.000Z",
        domainHostname: "example.com",
        id: "00000000-0000-4000-8000-000000000123",
        pagesRequested: 1,
        pagesScanned: 1,
        startedAt: "2026-08-26T12:00:01.000Z",
        status: "completed",
      },
      snapshot: { certscore_overall: 80 },
    }),
    waitSeconds: 0,
  }) as Record<string, unknown>;
  const coverage = pulse.coverage as { limitations?: string[]; status?: string };

  assert.equal(pulse.scanStatus, "completed");
  assert.equal((pulse.postRefusalObservation as Record<string, unknown>).status, "aborted");
  assert.equal((pulse.postRefusalObservation as Record<string, unknown>).productionProjectable, false);
  assert.equal(coverage.status, "complete");
  assert.ok(coverage.limitations?.includes(
    "Reject Path did not complete within the six-second post-primary allowance.",
  ));
});

test("Pulse surfaces canonical score-neutral post-Accept findings", () => {
  const pulse = buildPulseProjection({
    detail: "full",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: "accept-finding-fixture",
    requestedUrl: "https://example.com/",
    resolutionMode: "test",
    scanRecord: pulseScanRecord({
      accessPostureSummary: {
        homepageFetchStatus: "ok",
        interruptionLabel: null,
        interruptionReason: null,
        stopOutcomeTitle: null,
        stopReason: null,
        stopReviewTitle: null,
      },
      runtimeArtifacts: {
        postAcceptEvidenceProjection: {
          actionControlProof: { action: "accept" },
          contractVersion: "certscore.post_accept_report_projection.v1",
          completedAt: "2026-09-01T12:00:09.000Z",
          contradictionObserved: true,
          limitations: ["observation_early_exit:acceptance_signal_contradiction_observed"],
          observationCount: 2,
          observationWindowMs: 3_000,
          packetSha256: "b".repeat(64),
          postAcceptActivity: [{
            activityType: "network_request",
            category: "analytics",
            consentState: "post_accept",
            hostname: "analytics.example.net",
            msAfterAccept: 170,
            nonEssential: true,
            requestId: "request-1",
            url: "https://analytics.example.net/collect",
            vendor: "Example Analytics",
          }],
          productionProjectable: true,
          acceptanceExercised: true,
          acceptanceRegisteredAtMs: 500,
          registrationStatus: "confirmed",
          resolverMethod: "cmp_registry_recipe",
          status: "confirmed_observation",
        },
      },
      scan: {
        completedAt: "2026-09-01T12:00:10.000Z",
        createdAt: "2026-09-01T12:00:00.000Z",
        domainHostname: "example.com",
        id: "00000000-0000-4000-8000-000000000123",
        pagesRequested: 1,
        pagesScanned: 1,
        startedAt: "2026-09-01T12:00:01.000Z",
        status: "completed",
      },
      snapshot: {
        certscore_overall: 80,
        report_projection_status: "ready",
      },
    }),
    waitSeconds: 0,
  }) as Record<string, any>;

  assert.equal(pulse.summary.score, 80);
  assert.equal(pulse.postAcceptObservation.status, "confirmed_observation");
  assert.equal(pulse.postAcceptObservation.acceptanceExercised, true);
  assert.equal(pulse.postAcceptObservation.productionProjectable, true);
  assert.ok(pulse.findings.some((finding: Record<string, unknown>) =>
    finding.id === "post_accept_consent_dependent_activity"
  ));
  assert.ok(pulse.findings.some((finding: Record<string, unknown>) =>
    finding.id === "acceptance_signal_contradicts_action"
  ));
  assert.doesNotThrow(() => pulseResponseSchema.parse(pulse));
});

test("Pulse JSON surfaces GPC with retained proof alongside Accept and Reject results", () => {
  const delta = {
    baselineCount: 1,
    gpcCount: 1,
    countDelta: 0,
    baselineOnly: [],
    gpcOnly: [],
    shared: ["Example Ads|pixel|advertising"],
  };
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
        cookies: delta,
        trackers: delta,
        advertisingOrMeasurementActivity: delta,
        consentOrCmpBehavior: delta,
      },
      evidenceRefs: ["s3://private/baseline.json", "s3://private/gpc.json"],
      limitationKeys: [],
    },
  } as const;
  const gpcFinding = {
    unifiedFindingId: "gpc_response",
    title: "No observable GPC response",
    summary: "No observable baseline delta was retained under the equivalent passive GPC condition.",
    details: { family: "privacy_signal", kind: "gpc_response", assessment },
    presentationDecision: { status: "surface" },
    sourceRefs: [],
    surfacingDecision: {
      decisionState: "confirmed",
      reportLane: "confidence_and_coverage",
      reportable: true,
    },
    scoreEffects: [],
  };
  const pulse = buildPulseProjection({
    detail: "full",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: "all-observation-results-fixture",
    requestedUrl: "https://example.com/",
    resolutionMode: "test",
    scanRecord: pulseScanRecord({
      accessPostureSummary: {
        homepageFetchStatus: "ok",
        interruptionLabel: null,
        interruptionReason: null,
        stopOutcomeTitle: null,
        stopReason: null,
        stopReviewTitle: null,
      },
      canonicalReportProjection: {
        artifactVersion: "persisted-canonical-report-projection-v2",
        checklistRows: [],
        collectionSurfaceAssessment: null,
        derivedContext: {},
        globalUnifiedFindings: [gpcFinding],
        legacyScoreAssessmentInput: { scanId: "00000000-0000-4000-8000-000000000123" },
        normalizedConcerns: [],
        ownerUnifiedFindings: [gpcFinding],
        topFindingIds: [],
      },
      runtimeArtifacts: {
        postAcceptEvidenceProjection: {
          actionControlProof: { action: "accept" },
          acceptanceExercised: true,
          completedAt: "2026-09-02T12:00:08.000Z",
          contradictionObserved: false,
          limitations: ["observation_early_exit:non_essential_request_observed"],
          observationCount: 1,
          postAcceptActivity: [{ activityType: "network_request" }],
          productionProjectable: true,
          status: "confirmed_observation",
        },
        postRefusalEvidenceProjection: {
          actionControlProof: { action: "reject" },
          completedAt: "2026-09-02T12:00:09.000Z",
          contradictionObserved: false,
          limitations: [],
          observationCount: 0,
          postRefusalActivity: [],
          productionProjectable: true,
          refusalExercised: true,
          status: "confirmed_clean",
        },
      },
      scan: {
        completedAt: "2026-09-02T12:00:10.000Z",
        createdAt: "2026-09-02T12:00:00.000Z",
        domainHostname: "example.com",
        id: "00000000-0000-4000-8000-000000000123",
        pagesRequested: 1,
        pagesScanned: 1,
        startedAt: "2026-09-02T12:00:01.000Z",
        status: "completed",
      },
      snapshot: { certscore_overall: 80, report_projection_status: "ready" },
    }),
    waitSeconds: 0,
  }) as Record<string, any>;

  assert.equal(pulse.gpcResponse.status, "no_observable_response");
  assert.equal(pulse.gpcResponse.comparison.enabledProof.secGpcHeaderValue, "1");
  assert.equal(pulse.gpcResponse.comparison.deltas.trackers.shared.length, 1);
  assert.equal(pulse.postAcceptObservation.status, "confirmed_observation");
  assert.equal(pulse.postRefusalObservation.status, "confirmed_clean");
  assert.doesNotMatch(JSON.stringify(pulse.gpcResponse), /s3:\/\//);
  assert.doesNotThrow(() => pulseResponseSchema.parse(pulse));
});

test("Pulse reports a truncated Accept observation as a neutral coverage limitation", () => {
  const pulse = buildPulseProjection({
    detail: "summary",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: "accept-truncated-fixture",
    requestedUrl: "https://example.com/",
    resolutionMode: "test",
    scanRecord: pulseScanRecord({
      accessPostureSummary: {
        homepageFetchStatus: "ok",
        interruptionLabel: null,
        interruptionReason: null,
        stopOutcomeTitle: null,
        stopReason: null,
        stopReviewTitle: null,
      },
      runtimeArtifacts: {
        postAcceptObservationCoverage: {
          completedAt: "2026-09-01T12:00:06.000Z",
          evidenceJoined: true,
          limitationCode: "accept_observation_window_truncated",
          maxTailWaitMs: 6_000,
          status: "limited",
        },
      },
      scan: {
        completedAt: "2026-09-01T12:00:10.000Z",
        createdAt: "2026-09-01T12:00:00.000Z",
        domainHostname: "example.com",
        id: "00000000-0000-4000-8000-000000000123",
        pagesRequested: 1,
        pagesScanned: 1,
        startedAt: "2026-09-01T12:00:01.000Z",
        status: "completed",
      },
      snapshot: {
        certscore_overall: 80,
        report_projection_status: "ready",
      },
    }),
    waitSeconds: 0,
  }) as Record<string, any>;

  assert.equal(pulse.scanStatus, "completed");
  assert.equal(pulse.summary.score, 80);
  assert.ok(pulse.coverage.limitations.includes(
    "Accept was confirmed, but the bounded post-accept observation window was truncated.",
  ));
  assert.ok(pulse.coverage.interruptions.some((row: Record<string, unknown>) =>
    row.label === "Accept Path unavailable"
  ));
});

test("Pulse projection does not cap top findings by detail level", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /selectPublicPulseFindingsFromUnifiedProjection/);
  assert.match(source, /reportSurface\.topFindings\.map\(/);
  assert.match(source, /buildChecklistConcernTopFindings/);
  assert.match(source, /selectCanonicalHighPriorityFindings/);
  assert.match(source, /evidenceLabel: getEvidenceLabel\(item\)/);
  assert.doesNotMatch(source, /row\.assessmentStatus === "gap_observed"/);
  assert.doesNotMatch(source, /topFindings = executive\.topFindings\.slice\(/);
  assert.doesNotMatch(source, /input\.detail === "tiny" \? 3 : 5/);
});

test("Pulse serializes canonical unified findings without promoting neutral checklist rows", () => {
  const preConsentTracking = {
    confidence: "strong",
    description: "Retained runtime tracking evidence.",
    evidenceDetails: {},
    id: "pre_consent_tracking_detected",
    regulationTags: ["GDPR / ePrivacy"],
    section: "Privacy & Tracking",
    severity: "high",
    title: "Pre-consent tracking"
  } as unknown as import("../scans/finding-registry").CertScoreFinding;
  const apiOnlyChecklistPromotion = {
    ...preConsentTracking,
    id: "regulatory_gap__gdpr_eprivacy__accept_consent_control",
    title: "Accept consent control"
  } as import("../scans/finding-registry").CertScoreFinding;

  const selected = selectPublicPulseFindingsFromUnifiedProjection({
    findings: [preConsentTracking],
    neutralChecklistFindingIds: new Set([apiOnlyChecklistPromotion.id]),
    topFindings: [preConsentTracking]
  });

  assert.deepEqual(selected.allFindings.map((finding) => finding.id), ["pre_consent_tracking_detected"]);
  assert.deepEqual(selected.topFindings.map((finding) => finding.id), ["pre_consent_tracking_detected"]);
  assert.equal(selected.allFindings.some((finding) => finding.id === apiOnlyChecklistPromotion.id), false);
});

test("CNN complete no-surface evidence cannot create API-only consent-control findings", () => {
  const canonicalFindings = [
    {
      confidence: "strong",
      description: "CMP infrastructure loaded after retained third-party activity.",
      evidenceDetails: {},
      id: "cmp_load_order_gap",
      regulationTags: ["GDPR / ePrivacy"],
      section: "Privacy & Tracking",
      severity: "medium",
      title: "CMP load order"
    },
    {
      confidence: "strong",
      description: "Retained third-party tracking preceded a recorded affirmative choice.",
      evidenceDetails: {},
      id: "pre_consent_tracking_detected",
      regulationTags: ["GDPR / ePrivacy"],
      section: "Privacy & Tracking",
      severity: "high",
      title: "Pre-consent tracking"
    }
  ] as unknown as import("../scans/finding-registry").CertScoreFinding[];
  const neutralChecklistFindingIds = new Set([
    "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    "regulatory_gap__gdpr_eprivacy__accept_consent_control",
    "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control"
  ]);

  const selected = selectPublicPulseFindingsFromUnifiedProjection({
    findings: canonicalFindings,
    neutralChecklistFindingIds,
    topFindings: [canonicalFindings[1]!]
  });

  assert.deepEqual(selected.allFindings.map((finding) => finding.id), [
    "cmp_load_order_gap",
    "pre_consent_tracking_detected"
  ]);
  assert.deepEqual(selected.topFindings.map((finding) => finding.id), ["pre_consent_tracking_detected"]);
  assert.equal(
    selected.allFindings.some((finding) => neutralChecklistFindingIds.has(finding.id)),
    false
  );
});

test("CNN typed first-layer evidence projects only the canonical decline gap", () => {
  const canonicalFinding = {
    confidence: "strong",
    description: "Retained third-party tracking preceded a recorded affirmative choice.",
    evidenceDetails: {},
    id: "pre_consent_tracking_detected",
    regulationTags: ["GDPR / ePrivacy"],
    section: "Privacy & Tracking",
    severity: "high",
    title: "Pre-consent tracking"
  } as unknown as import("../scans/finding-registry").CertScoreFinding;
  const declineGap = {
    ...canonicalFinding,
    id: "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    title: "Decline consent control"
  } as import("../scans/finding-registry").CertScoreFinding;
  const neutralIds = new Set([
    "regulatory_gap__gdpr_eprivacy__accept_consent_control",
    "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control"
  ]);

  const selected = selectPublicPulseFindingsFromUnifiedProjection({
    checklistFindings: [declineGap],
    findings: [canonicalFinding],
    neutralChecklistFindingIds: neutralIds,
    topFindings: [canonicalFinding]
  });

  assert.deepEqual(selected.allFindings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    "pre_consent_tracking_detected"
  ]);
  assert.deepEqual(selected.topFindings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
    "pre_consent_tracking_detected"
  ]);
  assert.equal(selected.allFindings.some((finding) => neutralIds.has(finding.id)), false);
});

test("Pulse public API scope excludes non-GDPR product risk findings", () => {
  assert.equal(
    isPublicPulseApiFinding({
      id: "high_risk_product_risk_disclosure_missing",
      section: "Financial & Claims"
    }),
    false
  );
  assert.equal(
    isPublicPulseApiFinding({
      id: "pre_consent_tracking_detected",
      section: "Privacy & Tracking"
    }),
    true
  );
  assert.equal(
    isPublicPulseApiFinding({
      id: "scan_quality_visual_no_go",
      section: "Runtime & Diagnostics"
    }),
    true
  );
});

test("Pulse quality gate rejects completed shells with no retained public evidence", () => {
  const quality = assessPulseScanRecordQuality(pulseScanRecord());

  assert.equal(quality.usable, false);
  assert.equal(quality.level, "unavailable");
  assert.equal(quality.reason, "completed_without_retained_public_evidence");
});

test("Pulse quality gate keeps explicit access-limited scans usable as limitations", () => {
  const quality = assessPulseScanRecordQuality(
    pulseScanRecord({
      accessPostureSummary: {
        homepageFetchStatus: null,
        interruptionLabel: "Access limited",
        interruptionReason: "Bot challenge prevented retained homepage evidence.",
        stopOutcomeTitle: "Public site access was limited",
        stopReason: "bot_challenge",
        stopReviewTitle: "Public site access was limited"
      }
    })
  );

  assert.equal(quality.usable, true);
  assert.equal(quality.level, "usable_with_limitations");
  assert.equal(quality.reason, "retained_access_limitation");
});

test("Pulse no-go state preserves every canonical reason", () => {
  for (const reasonCode of SCAN_NO_GO_REASON_CODES) {
    const presentation = SCAN_NO_GO_REASON_PRESENTATIONS[reasonCode];
    const state = buildPulseNoGoState({
      scan_no_go_assessment: { decision: "no_go", reasonCodes: [reasonCode, "scan_no_go_corroborated"] },
      visual_access_review: { page_state: presentation.pageState, reason_code: reasonCode }
    });
    assert.equal(state?.scanStatus, "completed_limited", reasonCode);
    assert.equal(state?.resultDisposition, "no_go", reasonCode);
    assert.equal(state?.noGo.reasonCode, reasonCode, reasonCode);
    assert.equal(state?.noGo.title, presentation.customerTitle, reasonCode);
    assert.equal(state?.noGo.recommendedNextAction, presentation.recommendedNextAction, reasonCode);
    assert.equal(state?.resultQuality.reason, "scan_no_go", reasonCode);
  }
});

test("Pulse route rejects unusable completed scan records before projection", () => {
  const source = readFileSync(new URL("../../app/api/v1/pulse/route.ts", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../../app/pulse/[domain]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /loadPulseScanRecord/);
  assert.match(source, /assessPulseScanRecordQuality\(scanRecord\)/);
  assert.match(source, /pulseUnavailableResponse/);
  assert.match(source, /getRecentScanReuseEligibility/);
  assert.match(source, /bypassRecentScanReuse: forceNewScan/);
  assert.match(source, /format === "markdown" \? "standard" : null/);
  assert.match(pageSource, /getPublicScanRecord/);
  assert.doesNotMatch(pageSource, /getAnonymousScanById/);
  assert.doesNotMatch(source, /recentScanWasUnusable/);
});

test("Pulse projection exposes explicit counts for agent summaries", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function buildPulseCounts/);
  assert.match(source, /totalObservationCount: input\.allFindingCount/);
  assert.match(source, /highPriorityFindingCount/);
  assert.match(source, /counts: base\.counts/);
});

test("Pulse cache identity includes canonical report projection version and source hash", () => {
  const projectionSource = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../../app/api/v1/pulse/route.ts", import.meta.url), "utf8");

  assert.match(projectionSource, /reportProjectionVersion/);
  assert.match(projectionSource, /reportProjectionSourceHash/);
  assert.match(routeSource, /pulse\.meta\?\.reportProjectionVersion/);
  assert.match(routeSource, /pulse\.meta\?\.reportProjectionSourceHash/);
});

test("Pulse uses the same canonical overall score model as the report", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /gdprEprivacyScoreAssessment/);
  assert.match(source, /deriveCanonicalOverallScoreForReport/);
  assert.match(source, /customerScoreAssessment/);
  assert.match(source, /canonical_overall_score_unavailable/);
  assert.doesNotMatch(source, /getCustomerFacingGdprEprivacyPostureAssessment/);
  assert.match(source, /coverageRatio: reportSurface\.customerScoreAssessment\.coverageRatio/);
  assert.match(source, /kind: reportSurface\.customerScoreAssessment\.scoreKind/);
  assert.match(source, /metricLabel: "Overall score"/);
  assert.match(source, /selectedWithholdingReason/);
  assert.match(source, /version: reportSurface\.customerScoreAssessment\.scoreVersion/);
});

test("Pulse policy surfaces exclude unfetched guessed aliases and retain verified canonical pages", () => {
  const rows = projectedPolicySurfaceRows(pulseScanRecord({
    accessPostureSummary: { finalEffectiveUrl: "https://medal.tv/" },
    policyEnrichment: [
      { discoveryMethod: "guessed_common_path", policy_page_type: "privacy_policy", policy_page_url: "https://medal.tv/privacy-notice", status: "failed" },
      { discoveryMethod: "footer_link", policy_page_type: "privacy_policy", policy_page_url: "https://medal.tv/privacy", status: "fetched" },
      { discoveryMethod: "footer_link", policy_page_type: "cookie_policy", policy_page_url: "https://medal.tv/cookie-notice", status: "fetched" },
      { discoveryMethod: "footer_link", policy_page_type: "terms", policy_page_url: "https://medal.tv/terms", status: "fetched" }
    ],
    scan: { domainHostname: "medal.tv", pagesRequested: 1, pagesScanned: 1, status: "completed" }
  }));

  assert.deepEqual(rows.map((row) => row.url).sort(), [
    "https://medal.tv/cookie-notice",
    "https://medal.tv/privacy",
    "https://medal.tv/terms"
  ]);
});

test("Pulse projection exposes Summary JSON and Evidence JSON artifacts", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../../app/api/v1/pulse/route.ts", import.meta.url), "utf8");
  const adminSource = readFileSync(new URL("../../server/admin/list-pulse-requests.ts", import.meta.url), "utf8");

  assert.match(source, /type: "certscore_pulse_summary"/);
  assert.match(source, /type: "certscore_pulse_evidence"/);
  assert.match(source, /summaryJsonUrl/);
  assert.match(source, /evidenceJsonUrl/);
  assert.match(source, /function capArray/);
  assert.match(routeSource, /recordPulseArtifactDownload/);
  assert.match(routeSource, /summary_json/);
  assert.match(routeSource, /evidence_json/);
  assert.match(adminSource, /pulse_artifact_downloads/);
  assert.match(adminSource, /summary_json_downloads/);
  assert.match(adminSource, /evidence_json_downloads/);
});

test("Pulse evidence JSON includes diagnostic metadata and projection warnings", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");
  const calibrationSource = readFileSync(new URL("./calibration-context.ts", import.meta.url), "utf8");

  assert.match(source, /CANONICAL_VENDOR_RESOLVER_VERSION/);
  assert.match(source, /canonicalResolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION/);
  assert.match(source, /projectionWarnings/);
  assert.match(source, /regulatory_gap_runtime_anchor_from_retained_checklist_evidence/);
  assert.match(source, /social_media_embed_pre_consent/);
  assert.match(source, /session_replay_fingerprinting_review/);
  assert.match(source, /retainedEvidencePointer/);
  assert.match(source, /sourceEvidencePath/);
  assert.match(source, /sourceFindingId/);
  assert.match(source, /canonical_endpoint_vendor_replaced_raw_vendor/);
  assert.match(source, /request_event_missing_url/);
  assert.match(source, /projectionDiagnostics/);
  assert.match(source, /calibrationContext/);
  assert.match(calibrationSource, /scannerRegion: input\.scan\.provenance\?\.lambdaAwsRegion/);
  assert.match(calibrationSource, /site_language_primary/);
  assert.match(source, /gdprTransparencyTopicCandidateSummary/);
  assert.match(source, /domainsRejected/);
  assert.match(source, /hostsRejected/);
  assert.match(source, /policy_surface_url_recovered_from_alternate_field/);
  assert.match(source, /coverage_limited_by_scan_quality_no_go/);
  assert.match(source, /promotion_grade_preconsent_request_not_available/);
});

test("Pulse cookie findings require concrete cookie evidence and preserve snapshot timing limits", () => {
  const rows = [
    {
      category: "advertising",
      cookieName: "test_cookie",
      domain: ".doubleclick.net",
      firstObservedAtMs: 1500,
      initiatorVendor: "Google Tag Manager",
      party: "third_party",
      provider: "Google",
      setAtMs: 1500,
      setMethod: "set_cookie_header",
      sourceRequestUrl: "https://doubleclick.net/pagead/test",
      timingBasis: "set_cookie_header",
      timingEvidence: "before_consent_cookie_write"
    },
    {
      category: "analytics",
      cookieName: "_ym_uid",
      domain: ".life.ru",
      firstObservedAtMs: 10875,
      initiatorVendor: null,
      party: "first_party",
      provider: "Yandex Metrica",
      setAtMs: null,
      setMethod: "browser_snapshot",
      sourceRequestUrl: null,
      timingBasis: "periodic_cookie_snapshot",
      timingEvidence: "periodic_cookie_snapshot"
    }
  ] as unknown as Parameters<typeof buildCookieEvidenceExamples>[1];

  assert.deepEqual(buildCookieEvidenceExamples("third_party_cookie_pre_consent", rows), [
    {
      category: "advertising",
      cookieDomain: ".doubleclick.net",
      cookieName: "test_cookie",
      exactWriteTimeObserved: true,
      party: "third_party",
      phase: "pre_consent",
      provider: "Google",
      relatedOrInitiatingVendor: "Google Tag Manager",
      setMethod: "set_cookie_header",
      sourceRequestUrl: "https://doubleclick.net/pagead/test",
      timestampMs: 1500,
      timingBasis: "set_cookie_header",
      type: "cookie_write"
    }
  ]);
  assert.deepEqual(buildCookieEvidenceExamples("analytics_cookie_pre_consent", rows), [
    {
      category: "analytics",
      cookieDomain: ".life.ru",
      cookieName: "_ym_uid",
      exactWriteTimeObserved: false,
      party: "first_party",
      phase: null,
      provider: "Yandex Metrica",
      relatedOrInitiatingVendor: null,
      setMethod: "browser_snapshot",
      sourceRequestUrl: null,
      timestampMs: null,
      timingBasis: "periodic_cookie_snapshot",
      type: "cookie_snapshot"
    }
  ]);
  assert.deepEqual(buildCookieEvidenceExamples("third_party_cookie_pre_consent", rows.slice(1)), []);
});

test("Pulse descriptive storage totals include explicit pre-consent observations without weakening promotion-grade timing", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /eligibleNonEssentialPreConsentStorageCount: input\.reportSurface\.runtimeCookieRows\.filter\(isEligibleNonEssentialPreconsentStorageRow\)\.length/);
  assert.match(source, /observedNonEssentialPreConsentStorageCount:/);
  assert.match(source, /hasUnresolvedNonEssentialPreconsentStorageEvidence/);
  assert.match(source, /nonEssentialPreConsentStorageCount =/);
  assert.match(source, /nonEssentialPreConsentStorage: nonEssentialPreConsentStorageCount/);
  assert.match(source, /unclassifiedPreConsentStorageCount/);
  assert.match(source, /buildPreConsentStorageAssessment/);
  assert.match(source, /projectPreConsentStorageMetric/);
  assert.match(source, /const cookiesBeforeConsentCount = nonEssentialPreConsentStorageCount/);
  assert.match(source, /storageMetricLabel: storageMetric\.label/);
  assert.match(source, /storageMetricScope: storageMetric\.scope/);
  assert.match(source, /storageMetricStatus: storageMetric\.status/);
  assert.match(source, /storageMetricExplanation: storageMetric\.explanation/);
});

test("Pulse evidence inventory filters display hostnames and deduplicates vendor rows", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function scanRecordVendors/);
  assert.match(source, /isInventoryDisplayHostname\(vendor\.scriptHost\)/);
  assert.match(source, /row\.domains\.filter\(isInventoryDisplayHostname\)\.slice\(0, 4\)/);
  assert.match(source, /const rows = new Map/);
  assert.match(source, /const groupedTrackerRows = buildTrackerInventoryGroupRows/);
  assert.match(source, /classifiedTrackerVendors = groupedTrackerRows\.length/);
  assert.doesNotMatch(source, /return scanRecord\.trackerVendors\.map/);
  assert.doesNotMatch(source, /total: input\.scanRecord\.trackerVendors\.length/);
});

test("Pulse iFIT footprint separates vendor categories while preserving literal raw hosts", () => {
  const reportSurface = {
    runtimeCookieRows: [{ cookieName: "_ga" }, { cookieName: "wisepops_visitor" }],
    trackerInventoryRows: [
      {
        category: "analytics",
        confidence: 0.98,
        domains: ["region1.analytics.google.com"],
        firstSeenMs: 2_343,
        label: "Google Analytics",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Analytics"
      },
      {
        category: "analytics",
        confidence: 0.98,
        domains: ["api2.branch.io"],
        firstSeenMs: 25_309,
        label: "Branch Deep Linking and Attribution",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Analytics"
      },
      {
        category: "cdn",
        confidence: 0.95,
        domains: ["iconcdn-res.cloudinary.com"],
        firstSeenMs: 2_500,
        label: "Cloudinary CDN",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Functional"
      },
      {
        category: "analytics",
        confidence: 0.98,
        domains: ["wisepops.net"],
        firstSeenMs: 7_000,
        label: "WisePops Onsite Campaigns",
        observedVia: ["network_request"],
        party: "third_party",
        preConsent: true,
        requestCount: 1,
        source: "runtime",
        vendorDisplayCategory: "Analytics"
      }
    ]
  } as never;

  const hosts = buildRawHostInventory(reportSurface);
  assert.deepEqual(hosts.map((row) => row.host), [
    "api2.branch.io",
    "iconcdn-res.cloudinary.com",
    "region1.analytics.google.com",
    "wisepops.net"
  ]);
  assert.deepEqual(buildTrackerFootprintBreakdown(reportSurface), {
    cdns: 1,
    consentPlatforms: 0,
    cookies: 2,
    displayedRows: 4,
    domains: 4,
    functionalServices: 0,
    products: 4,
    purposeCounts: { Analytics: 3, Functional: 1 },
    priorityCounts: { contextual: 1, high: 0, medium: 3, review_needed: 0 },
    confidenceCounts: { high: 4, low: 0, medium: 0 },
    providerFamilies: 4,
    rawHosts: 4,
    trackers: 3,
    vendors: 4
  });
});

test("Pulse example events do not borrow vendors by list position", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /inferDirectEndpointVendorFromUrl/);
  assert.match(source, /rawObservedVendor/);
  assert.match(source, /resolvedEndpointVendor/);
  assert.match(source, /relatedOrInitiatingVendor/);
  assert.match(source, /requestUrl: safeUrl/);
  assert.match(source, /initiatorUrl: safeUrl/);
  assert.match(source, /frameUrl: safeUrl/);
  assert.match(source, /redirectChain/);
  assert.match(source, /resourceType/);
  assert.match(source, /registrableDomain: getUrlRegistrableDomain/);
  assert.doesNotMatch(source, /const firstVendor = vendors\[0\]/);
  assert.doesNotMatch(source, /firstVendor\?\.name/);
  assert.doesNotMatch(source, /asStringArray\(details\.runtimeVendors\)\[0\]/);
});

test("Pulse full JSON policy surfaces use all retained policy URL field shapes", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /function policySurfaceUrl/);
  assert.match(source, /row\.policy_page_url/);
  assert.match(source, /row\.policyPageUrl/);
  assert.match(source, /row\.page_url/);
  assert.match(source, /row\.pageUrl/);
  assert.match(source, /row\.source_url/);
  assert.match(source, /row\.sourceUrl/);
  assert.doesNotMatch(source, /url:\s*typeof row\.policy_page_url === "string" \? row\.policy_page_url : null/);
});

test("Pulse policy surfaces canonicalize URLs, deduplicate aliases, and exclude an untyped effective landing page", () => {
  const scanRecord = pulseScanRecord({
    accessPostureSummary: { finalEffectiveUrl: "https://www.cira.ca/en/cybersecurity/" },
    policyEnrichment: [
      { pageType: "policy_surface", sourceUrl: "https://cira.ca/en/cybersecurity" },
      { pageType: "policy_surface", sourceUrl: "https://www.cira.ca/en/cybersecurity/" },
      { pageType: "privacy_policy", sourceUrl: "https://www.cira.ca/en/privacy-policy/" },
      { policy_page_type: "privacy_policy", policy_page_url: "https://cira.ca/en/privacy-policy" }
    ]
  });

  assert.deepEqual(
    projectedPolicySurfaceRows(scanRecord).map(({ type, url }) => ({ type, url })),
    [{ type: "privacy_policy", url: "https://cira.ca/en/privacy-policy" }]
  );
});

test("Pulse policy surfaces type iFIT privacy, accessibility, and terms pages without treating the homepage as policy", () => {
  const scanRecord = pulseScanRecord({
    accessPostureSummary: { finalEffectiveUrl: "https://www.ifit.com/en-gb/" },
    policyEnrichment: [
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/" },
      { pageType: "policy_surface", sourceUrl: "https://www3.ifit.com/en-gb/legal/privacy-policy/" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/legal/consumer-health-data-privacy" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/accessibility" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/legal/mobile-terms-and-conditions" },
      { pageType: "policy_surface", sourceUrl: "https://www.ifit.com/en-gb/legal/terms-of-use" }
    ]
  });

  assert.deepEqual(
    projectedPolicySurfaceRows(scanRecord).map(({ type, url }) => ({ type, url })),
    [
      { type: "privacy_policy", url: "https://www3.ifit.com/en-gb/legal/privacy-policy" },
      { type: "privacy_policy", url: "https://ifit.com/en-gb/legal/consumer-health-data-privacy" },
    { type: "terms_of_service", url: "https://ifit.com/en-gb/legal/mobile-terms-and-conditions" },
    { type: "terms_of_service", url: "https://ifit.com/en-gb/legal/terms-of-use" },
    { type: "accessibility_statement", url: "https://ifit.com/en-gb/accessibility" }
    ]
  );
});

test("Pulse analytics evidence names captured Google and WisePops cookies without inventing write times", () => {
  const rows = ["_ga", "_gid", "_gat_UA-123", "wisepops_visitor"].map((cookieName) => ({
    category: "analytics",
    cookieName,
    domain: "ifit.com",
    firstObservedAtMs: 26_951,
    initiatorVendor: null,
    party: "first_party",
    provider: null,
    setAtMs: null,
    setMethod: "browser_snapshot",
    sourceRequestUrl: null,
    timingBasis: "periodic_cookie_snapshot",
    timingEvidence: "periodic_cookie_snapshot"
  })) as unknown as Parameters<typeof buildCookieEvidenceExamples>[1];

  const examples = buildCookieEvidenceExamples("analytics_cookie_pre_consent", rows);
  assert.deepEqual(examples.map((example) => example.cookieName), ["_ga", "_gat_UA-123", "_gid", "wisepops_visitor"]);
  assert.ok(examples.every((example) => example.timestampMs === null));
  assert.ok(examples.every((example) => example.exactWriteTimeObserved === false));
});

test("Pulse consent platform falls back to canonical nested consent evidence", () => {
  const scanRecord = pulseScanRecord({
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentSummary: {
          cmpDetected: true,
          cmpName: "Osano CMP"
        }
      }
    }
  });
  assert.equal(deriveConsentPlatform(scanRecord, { topObservedEntities: [] } as never), "Osano");
});

test("Pulse evidence projection reads canonical nested runtime summaries and distinguishes all third-party requests", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");
  assert.match(source, /asRecord\(recordValue\(hybrid, "consentSummary"\)\)/);
  assert.match(source, /asRecord\(recordValue\(hybrid, "networkSummary"\)\)/);
  assert.match(source, /trackingClassifiedThirdPartyRequests/);
  assert.match(source, /thirdPartyRequests: allThirdPartyRequestCount/);
  assert.match(source, /"controls"/);
  assert.match(source, /"textSnippet"/);
  assert.match(source, /"layerInspected"/);
  assert.match(source, /"defaultToggleStatesObserved"/);
  assert.match(source, /"nonEssentialDefaultsOff"/);
  assert.match(source, /"observedAtMs"/);
  assert.match(source, /"policyLinks"/);
  assert.match(source, /"firstVisibleMs"/);
  assert.match(source, /"screenshotRefs"/);
  assert.match(source, /"redirectChain"/);
});

test("Pulse evidence digest keeps runtime basis for runtime-anchored findings", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /canonicalPhase \|\| hasTimingAnchor \|\| hasVendorAnchor/);
  assert.doesNotMatch(source, /hasPolicyAnchor \? "policy_surface_detection" : "runtime_observation"/);
});

test("Pulse evidence digest requires a real policy anchor", () => {
  assert.equal(hasMeaningfulPolicyAnchor({ policyRuntimeConflict: {} }), false);
  assert.equal(hasMeaningfulPolicyAnchor({ policyEvidence: { coveredTypes: ["privacy_policy"] } }), false);
  assert.equal(hasMeaningfulPolicyAnchor({ policyEvidence: { policyUrl: "https://example.com/privacy" } }), true);
  assert.equal(hasMeaningfulPolicyAnchor({ policyEvidenceDetails: { sourceUrl: "https://example.com/privacy" } }), true);
  assert.equal(hasMeaningfulPolicyAnchor({ policyRuntimeConflict: { policySnippet: "Cookies may be used." } }), true);
});

test("Pulse no-go scans add coverage-limited framing to projected finding evidence", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /coverageLimitedByNoGo/);
  assert.match(source, /Coverage-limited:/);
  assert.match(source, /confidence: applyNoGoCoverageFraming \? "moderate" : finding\.confidence/);
  assert.match(source, /scan_quality_visual_no_go/);
});

test("Pulse evidence JSON exposes bounded cookie setter context", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /getRuntimeCookiePrimaryProvider/);
  assert.match(source, /primaryProvider/);
  assert.match(source, /relatedOrInitiatingVendor/);
  assert.match(source, /initiatorDomain: row\.initiatorDomain/);
  assert.match(source, /initiatorUrl: safeUrl\(row\.initiatorUrl\)/);
  assert.match(source, /initiatorVendor: row\.initiatorVendor/);
  assert.match(source, /responseUrl: safeUrl\(row\.responseUrl\)/);
  assert.match(source, /sourceRequestUrl: safeUrl\(row\.sourceRequestUrl\)/);
  assert.match(source, /setMethod: row\.setMethod/);
});
