import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApiV2Error,
  buildApiV2ErrorFromPulse,
  buildApiV2DomainLatestScan,
  buildApiV2FindingDetail,
  buildApiV2FindingList,
  buildApiV2ScanJobFromPulseStatus,
  buildApiV2ScanPulse,
  buildApiV2ScanResource,
  buildApiV2ScanStatus,
  projectedFindingsFromPulse
} from "./scan-resource";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";

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
    }
  } as unknown as ScanDetailResponse;
}

test("buildApiV2ScanResource projects a completed scan into public-safe v2 shape", () => {
  const resource = buildApiV2ScanResource(fixture());

  assert.equal(resource.type, "certscore_scan");
  assert.equal(resource.scanId, "00000000-0000-4000-8000-000000000123");
  assert.equal(resource.domain, "example.com");
  assert.equal(resource.score, 72);
  assert.equal(resource.riskLevel, "review_recommended");
  assert.equal(resource.coverage?.status, "complete");
  assert.equal(resource.links?.findings, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings");
});

test("buildApiV2ScanResource marks partial coverage without exposing raw evidence", () => {
  const resource = buildApiV2ScanResource(fixture({ pagesRequested: 4, pagesScanned: 1 }));

  assert.equal(resource.coverage?.status, "partial");
  assert.deepEqual(resource.coverage?.limitations, ["Automated public-web scan only."]);
  assert.equal("rawEvidence" in resource, false);
});

test("buildApiV2Error returns the shared error envelope", () => {
  const error = buildApiV2Error({ code: "not_found", message: "Scan not found." });

  assert.equal(error.type, "certscore_api_error");
  assert.equal(error.error.code, "not_found");
  assert.equal(error.links.docs, "https://certscore.ai/api/v2/openapi.json");
});

test("buildApiV2ScanStatus exposes public scan status links", () => {
  const status = buildApiV2ScanStatus(fixture());

  assert.equal(status.type, "certscore_scan_job");
  assert.equal(status.jobId, "00000000-0000-4000-8000-000000000123");
  assert.equal(status.status, "completed");
  assert.equal(status.phase, "completed");
  assert.equal(status.retryAfterSeconds, null);
  assert.equal(status.links?.findings, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings");
});

test("buildApiV2ScanStatus degrades unknown scan states to running", () => {
  const status = buildApiV2ScanStatus(fixture({ status: "materializing" }));

  assert.equal(status.status, "running");
  assert.equal(status.phase, "runtime_observation");
  assert.equal(status.retryAfterSeconds, 30);
  assert.equal(status.links?.findings, undefined);
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
  assert.equal(status.retryAfterSeconds, 45);
  assert.equal(status.links?.status, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/status");
});

test("buildApiV2ErrorFromPulse maps Pulse throttles to v2 rate-limit errors", () => {
  const error = buildApiV2ErrorFromPulse({
    body: {
      error: {
        code: "pulse_throttled",
        message: "A Pulse scan for this domain was requested recently.",
        retryAfterSeconds: 60
      }
    },
    fallbackMessage: "Request failed.",
    status: 429
  });

  assert.equal(error.error.code, "rate_limited");
  assert.equal(error.error.retryAfterSeconds, 60);
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
        confidence: "strong",
        plainEnglish: "A third-party tracking request was observed before consent.",
        evidence: {
          summary: "Representative tracker request was retained in the public report projection.",
          observedPhase: "before_consent",
          exampleEvents: [
            {
              type: "request",
              vendor: "Example Analytics",
              urlHost: "analytics.example.test",
              registrableDomain: "example.test",
              timestampMs: 123,
              rawRequestBody: "must not be copied"
            },
            { type: "request", urlHost: "cdn.example.test" },
            { type: "request", urlHost: "tag.example.test" },
            { type: "request", urlHost: "pixel.example.test" },
            { type: "request", urlHost: "ads.example.test" },
            { type: "request", urlHost: "extra.example.test" }
          ]
        },
        evidenceDigest: {
          basis: "runtime_observation",
          phase: "before_consent",
          exampleCount: 6,
          examplesShown: 6,
          hasTimingAnchor: true,
          hasVendorAnchor: true,
          hasConsentContext: true
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
  assert.equal(finding?.confidence, "strong");
  assert.equal(finding?.evidence.basis, "runtime_observation");
  assert.equal(finding?.evidence.examples?.length, 5);
  assert.equal(finding?.evidence.examples?.[0]?.observedAtMs, 123);
  assert.equal("rawRequestBody" in (finding?.evidence.examples?.[0] ?? {}), false);
  assert.equal(finding?.links?.self, "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings/pre_consent_tracking_detected");
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
