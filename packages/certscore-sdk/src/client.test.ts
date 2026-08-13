import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CertScoreClient } from "./client.js";
import { CertScoreScanFailedError, CertScoreTimeoutError, InvalidUrlError, ThrottledError } from "./errors.js";
import type { ScanNoGoReasonCode } from "./types.js";

type MockResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  text?: string;
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function textResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/markdown; charset=utf-8", ...headers }
  });
}

function installFetch(responses: MockResponse[]) {
  const calls: string[] = [];
  const callDetails: Array<{ body?: BodyInit | null; headers?: HeadersInit; method?: string }> = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    callDetails.push({ body: init?.body, headers: init?.headers, method: init?.method });
    const next = responses.shift();
    if (!next) {
      throw new Error("Unexpected fetch call");
    }
    if (next.text !== undefined) {
      return textResponse(next.status, next.text, next.headers);
    }
    return jsonResponse(next.status, next.body, next.headers);
  }) as typeof fetch;
  return {
    calls,
    callDetails,
    restore() {
      globalThis.fetch = previous;
    }
  };
}

const pulse = {
  type: "certscore_pulse",
  scanId: "scan_123",
  summary: { score: 88 },
  topFindings: [],
  links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
  disclaimer: "CertScore provides automated public-web observations for review."
} as const;

const supportedNoGoReasons: ScanNoGoReasonCode[] = [
  "blank_or_unusable_page", "loading_or_stalled", "not_found_404", "parked_or_placeholder",
  "site_not_ready", "captcha_or_challenge", "access_denied_or_forbidden_page", "rate_limited_429",
  "server_error_5xx", "configuration_error", "maintenance_or_unavailable", "tls_or_certificate_error",
  "unsupported_region", "target_unreachable_or_unsuitable", "navigation_transport_failure", "visual_capture_failed_or_placeholder",
  "retained_visual_error_shell", "unknown"
];

test("scan returns immediate 200 JSON", async () => {
  const mock = installFetch([{ status: 200, body: pulse }]);
  try {
    const client = new CertScoreClient();
    const result = await client.scan("https://example.com");
    assert.equal(result.scanId, "scan_123");
    assert.match(mock.calls[0] ?? "", /wait=60/);
  } finally {
    mock.restore();
  }
});

test("SDK identifies requests with the configured client name", async () => {
  const mock = installFetch([{ status: 200, body: pulse }]);
  try {
    const client = new CertScoreClient({ clientName: "sdk" });
    await client.scan("https://example.com");
    const headers = new Headers(mock.callDetails[0]?.headers);
    assert.equal(headers.get("X-CertScore-Client"), "sdk");
  } finally {
    mock.restore();
  }
});

test("anonymous gateway context forwards the requester IP without adding authorization", async () => {
  const mock = installFetch([{ status: 202, body: { type: "certscore_scan_job", status: "queued", jobId: "job_1" } }]);
  try {
    const client = new CertScoreClient({ clientName: "mcp", forwardedClientIp: "203.0.113.44", anonymousRequesterSecret: "anonymous-mcp-requester-test-secret" });
    await client.scans.create("https://example.com");
    const headers = new Headers(mock.callDetails[0]?.headers);
    assert.equal(headers.get("X-Forwarded-For"), "203.0.113.44");
    assert.match(headers.get("X-CertScore-Anonymous-Requester-IP") ?? "", /203\.0\.113\.44/);
    assert.match(headers.get("X-CertScore-Anonymous-Requester-Timestamp") ?? "", /^\d+$/);
    assert.match(headers.get("X-CertScore-Anonymous-Requester-Proof") ?? "", /^[A-Za-z0-9_-]+$/);
    assert.equal(headers.get("Authorization"), null);
  } finally {
    mock.restore();
  }
});

test("README documents current SDK resource clients", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  for (const method of [
    "certscore.scans.create()",
    "certscore.scans.get()",
    "certscore.scans.preConsentCookiesTrackers()",
    "certscore.scans.status()",
    "certscore.scans.wait()",
    "certscore.findings.list()",
    "certscore.findings.get()",
    "certscore.findings.explain()",
    "certscore.pulse.get()",
    "certscore.pulse.evidence()",
    "certscore.domains.latest()",
    "certscore.domains.latestPreConsentCookiesTrackers()",
    "certscore.scan()"
  ]) {
    assert.match(readme, new RegExp(method.replace(/[().]/g, "\\$&")));
  }

  assert.match(readme, /resource-oriented API v2 clients/i);
  assert.match(readme, /automated public-web observations for review/i);
  assert.doesNotMatch(readme, /legal violation|non-compliant|certifies compliance/i);
});

test("packaged declarations expose API v2 scan timing fields", () => {
  execFileSync("pnpm", ["run", "build"], {
    cwd: new URL("..", import.meta.url),
    stdio: "ignore"
  });
  const declarations = readFileSync(new URL("../dist/types.d.ts", import.meta.url), "utf8");

  assert.match(declarations, /startedAt\?: string \| null;/);
  assert.match(declarations, /completedAt\?: string \| null;/);
  assert.match(declarations, /scanTimeSeconds\?: number \| null;/);
  assert.match(declarations, /evidenceExcerpt\?: string;/);
});

test("pulse.evidence retrieves the bounded Evidence JSON artifact", async () => {
  const mock = installFetch([{ status: 200, body: { ...pulse, type: "certscore_pulse_evidence" } }]);
  try {
    const client = new CertScoreClient();
    const result = await client.pulse.evidence("scan_123");
    assert.equal(result.type, "certscore_pulse_evidence");
    assert.match(mock.calls[0] ?? "", /scanId=scan_123/);
    assert.match(mock.calls[0] ?? "", /detail=evidence/);
  } finally {
    mock.restore();
  }
});

test("SDK preserves typed completed-limited no-go scan resources", async () => {
  const mock = installFetch([{ status: 200, body: {
    type: "certscore_scan",
    scanId: "scan_no_go",
    domain: "cerebras.com",
    status: "completed_limited",
    resultDisposition: "no_go",
    noGo: {
      reasonCode: "site_not_ready",
      title: "The site is not ready for scanning",
      explanation: "The retained page was a prelaunch experience.",
      summary: "A prelaunch page was observed.",
      limitationKind: "target_site_state",
      recommendedNextAction: "Retry after launch.",
      retryLikelyToHelp: false,
      evidenceExcerpt: "Your browser cannot render the visitor. Check back at launch."
    }
  }}]);
  try {
    const client = new CertScoreClient({ baseUrl: "https://certscore.test" });
    const result = await client.scans.get("scan_no_go");
    assert.equal(result.status, "completed_limited");
    assert.equal(result.resultDisposition, "no_go");
    assert.equal(result.noGo?.reasonCode, "site_not_ready");
    assert.equal(result.noGo?.recommendedNextAction, "Retry after launch.");
    assert.match(result.noGo?.evidenceExcerpt ?? "", /Check back at launch/);
  } finally {
    mock.restore();
  }
});

test("SDK preserves every supported no-go reason without changing terminal status", async () => {
  const mock = installFetch(supportedNoGoReasons.map((reasonCode) => ({ status: 200, body: {
    type: "certscore_scan",
    scanId: `scan_${reasonCode}`,
    domain: "example.com",
    status: "completed_limited",
    resultDisposition: "no_go",
    noGo: {
      reasonCode,
      title: "Customer-safe title",
      explanation: "Customer-safe explanation of the observed page state.",
      summary: "The scan completed with limited coverage.",
      limitationKind: "target_site_state",
      recommendedNextAction: "Review the retained evidence and retry when appropriate.",
      retryLikelyToHelp: true
    }
  }})));
  try {
    const client = new CertScoreClient({ baseUrl: "https://certscore.test" });
    for (const reasonCode of supportedNoGoReasons) {
      const result = await client.scans.get(`scan_${reasonCode}`);
      assert.equal(result.status, "completed_limited", reasonCode);
      assert.equal(result.resultDisposition, "no_go", reasonCode);
      assert.equal(result.noGo?.reasonCode, reasonCode, reasonCode);
    }
  } finally {
    mock.restore();
  }
});

test("scan returns immediate 200 markdown", async () => {
  const mock = installFetch([{ status: 200, text: "# CertScore Pulse" }]);
  try {
    const client = new CertScoreClient();
    const result = await client.scan("https://example.com", { format: "markdown" });
    assert.equal(result, "# CertScore Pulse");
  } finally {
    mock.restore();
  }
});

test("scan polls 202 then completed and retrieves scan result", async () => {
  const mock = installFetch([
    {
      status: 202,
      headers: { "Retry-After": "0" },
      body: { type: "certscore_pulse_status", status: "running", jobId: "job_1", scanId: "scan_123" }
    },
    {
      status: 200,
      body: { type: "certscore_pulse_status", status: "completed", jobId: "job_1", scanId: "scan_123" }
    },
    { status: 200, body: pulse }
  ]);
  try {
    const updates: string[] = [];
    const client = new CertScoreClient();
    const result = await client.scan("https://example.com", {
      pollIntervalMs: 0,
      onStatusUpdate(status) {
        updates.push(status.status);
      }
    });
    assert.equal(result.scanId, "scan_123");
    assert.deepEqual(updates, ["running", "completed"]);
    assert.match(mock.calls[2] ?? "", /scanId=scan_123/);
  } finally {
    mock.restore();
  }
});

test("scan handles completed_limited as usable completion", async () => {
  const mock = installFetch([
    {
      status: 202,
      headers: { "Retry-After": "0" },
      body: { type: "certscore_pulse_status", status: "running", jobId: "job_1", scanId: "scan_123" }
    },
    {
      status: 200,
      body: { type: "certscore_pulse_status", status: "completed_limited", jobId: "job_1", scanId: "scan_123" }
    },
    { status: 200, body: pulse }
  ]);
  try {
    const client = new CertScoreClient();
    const result = await client.scan("https://example.com", { pollIntervalMs: 0 });
    assert.equal(result.scanId, "scan_123");
  } finally {
    mock.restore();
  }
});

test("scan prefers resultUrl when completed status provides one", async () => {
  const mock = installFetch([
    {
      status: 202,
      headers: { "Retry-After": "0" },
      body: { type: "certscore_pulse_status", status: "running", jobId: "job_1" }
    },
    {
      status: 200,
      body: {
        type: "certscore_pulse_status",
        status: "completed",
        jobId: "job_1",
        resultUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_result"
      }
    },
    { status: 200, body: { ...pulse, scanId: "scan_result" } }
  ]);
  try {
    const client = new CertScoreClient();
    const result = await client.scan("https://example.com", { pollIntervalMs: 0, detail: "full" });
    assert.equal(result.scanId, "scan_result");
    assert.match(mock.calls[2] ?? "", /scanId=scan_result/);
    assert.match(mock.calls[2] ?? "", /detail=full/);
  } finally {
    mock.restore();
  }
});

test("scan timeout includes jobId and scanId", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: { type: "certscore_pulse_status", status: "running", jobId: "job_1", scanId: "scan_123" }
    }
  ]);
  try {
    const client = new CertScoreClient();
    await assert.rejects(
      () => client.scan("https://example.com", { maxWaitMs: 0, pollIntervalMs: 0 }),
      (error: unknown) =>
        error instanceof CertScoreTimeoutError && error.jobId === "job_1" && error.scanId === "scan_123"
    );
  } finally {
    mock.restore();
  }
});

test("invalid URL maps to InvalidUrlError", async () => {
  const mock = installFetch([
    {
      status: 400,
      body: { type: "certscore_pulse_error", error: { code: "invalid_url", message: "Enter a valid public URL or domain." } }
    }
  ]);
  try {
    const client = new CertScoreClient();
    await assert.rejects(() => client.scan("::::"), InvalidUrlError);
  } finally {
    mock.restore();
  }
});

test("429 maps to ThrottledError with Retry-After", async () => {
  const mock = installFetch([
    {
      status: 429,
      headers: { "Retry-After": "42" },
      body: { type: "certscore_pulse_error", error: { code: "pulse_throttled", message: "Try again later." } }
    }
  ]);
  try {
    const client = new CertScoreClient();
    await assert.rejects(
      () => client.scan("https://example.com"),
      (error: unknown) => error instanceof ThrottledError && error.retryAfterSeconds === 42
    );
  } finally {
    mock.restore();
  }
});

test("failed and expired statuses map to ScanFailedError", async () => {
  for (const status of ["failed", "expired"] as const) {
    const mock = installFetch([
      {
        status: 202,
        body: { type: "certscore_pulse_status", status, jobId: "job_1", scanId: "scan_123" }
      }
    ]);
    try {
      const client = new CertScoreClient();
      await assert.rejects(
        () => client.scan("https://example.com", { pollIntervalMs: 0 }),
        (error: unknown) => error instanceof CertScoreScanFailedError && error.jobId === "job_1" && error.scanId === "scan_123"
      );
    } finally {
      mock.restore();
    }
  }
});

test("scans.wait resolves to completed API v2 scan resource", async () => {
  const scanResource = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    status: "completed"
  };
  const mock = installFetch([
    {
      status: 200,
      body: { type: "certscore_scan_job", status: "running", jobId: "job_1", scanId: "scan_123" }
    },
    {
      status: 200,
      body: { type: "certscore_scan_job", status: "completed", jobId: "job_1", scanId: "scan_123" }
    },
    { status: 200, body: scanResource }
  ]);

  try {
    const updates: string[] = [];
    const client = new CertScoreClient();
    const result = await client.scans.wait(
      { type: "certscore_scan_job", status: "running", jobId: "job_1", scanId: "scan_123" },
      {
        pollIntervalMs: 0,
        onStatusUpdate(status) {
          updates.push(status.status);
        }
      }
    );

    assert.deepEqual(result, scanResource);
    assert.deepEqual(updates, ["running", "completed"]);
    assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/scan_123\/status$/);
    assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123\/status$/);
    assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/scan_123$/);
  } finally {
    mock.restore();
  }
});

test("scans.wait falls back to the accepted job while the scan resource materializes", async () => {
  const scanResource = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    status: "completed"
  };
  const mock = installFetch([
    {
      status: 404,
      body: { type: "certscore_api_error", error: { code: "not_found", message: "Scan not found yet." } }
    },
    {
      status: 200,
      body: { type: "certscore_pulse_status", status: "completed", jobId: "job_1", scanId: "scan_123" }
    },
    { status: 200, body: scanResource }
  ]);

  try {
    const client = new CertScoreClient();
    const result = await client.scans.wait(
      { type: "certscore_scan_job", status: "queued", jobId: "job_1", scanId: "scan_123" },
      { pollIntervalMs: 0 }
    );

    assert.deepEqual(result, scanResource);
    assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/scan_123\/status$/);
    assert.match(mock.calls[1] ?? "", /\/api\/v1\/pulse\/status\/job_1$/);
    assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/scan_123$/);
  } finally {
    mock.restore();
  }
});

test("scans.wait returns a provided completed scan resource without fetching", async () => {
  const client = new CertScoreClient();
  const scan = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    status: "completed"
  } as const;

  assert.equal(await client.scans.wait(scan), scan);
});

test("resource clients call API v2 read endpoints", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        status: "completed"
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan_diagnostics",
        schemaVersion: "scan-diagnostics.v1",
        scanId: "00000000-0000-4000-8000-000000000123",
        generatedAt: "2026-06-30T12:00:10.000Z",
        totalWallMs: 9000,
        phases: [],
        lanes: [{
          laneId: "runtime_evidence",
          physicalInvocationId: "aws-request-runtime-1",
          region: "eu-west-1",
          phaseName: "preConsentRuntimeScanner",
          startedAt: "2026-06-30T12:00:01.000Z",
          firstResponse: {
            at: "2026-06-30T12:00:01.120Z",
            offsetMs: 120,
            httpStatus: 200,
            effectiveUrl: "https://example.com/"
          },
          navigationCount: 1,
          challengeDetection: { detected: false, type: null },
          executionOutcome: "success",
          accessOutcome: "representative_page",
          completedAt: "2026-06-30T12:00:05.000Z",
          durationMs: 4000
        }],
        policyDiscovery: {
          candidatesDiscovered: null,
          candidatesAfterDeduplication: null,
          requestsStarted: null,
          successfulDocuments: null,
          timeouts: null,
          phaseWallMs: null,
          maxConcurrency: null,
          shortCircuitReason: null
        }
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        jobId: "00000000-0000-4000-8000-000000000123",
        scanId: "00000000-0000-4000-8000-000000000123",
        status: "completed"
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_pre_consent_cookies_trackers",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        summary: { rowCount: 0, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: []
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_finding_list",
        scanId: "00000000-0000-4000-8000-000000000123",
        findings: []
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_finding",
        id: "pre_consent_tracking_detected",
        scanId: "00000000-0000-4000-8000-000000000123",
        label: "Tracking started before consent",
        criticality: "high",
        confidence: "strong",
        plainEnglish: "A third-party tracking request was observed before consent.",
        evidence: {
          basis: "runtime_observation",
          summary: "Public-safe projected evidence summary.",
          exampleCount: 1,
          examplesShown: 1
        }
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan_pulse",
        scanId: "00000000-0000-4000-8000-000000000123",
        pulse
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_domain_latest_scan",
        domain: "example.com",
        scan: null
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_pre_consent_cookies_trackers",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        summary: { rowCount: 0, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: []
      }
    }
  ]);

  try {
    const client = new CertScoreClient({ baseUrl: "https://certscore.ai/" });
    const scan = await client.scans.get("00000000-0000-4000-8000-000000000123");
    const diagnostics = await client.scans.diagnostics("00000000-0000-4000-8000-000000000123");
    const status = await client.scans.status("00000000-0000-4000-8000-000000000123");
    const inventory = await client.scans.preConsentCookiesTrackers("00000000-0000-4000-8000-000000000123");
    const findings = await client.findings.list("00000000-0000-4000-8000-000000000123");
    const finding = await client.findings.explain("00000000-0000-4000-8000-000000000123", "pre_consent_tracking_detected");
    const wrappedPulse = await client.pulse.get("00000000-0000-4000-8000-000000000123");
    const latest = await client.domains.latest("example.com", { scanFrom: "california" });
    const latestInventory = await client.domains.latestPreConsentCookiesTrackers("example.com", { scanFrom: "california" });

    assert.equal(scan.type, "certscore_scan");
    assert.equal(diagnostics.type, "certscore_scan_diagnostics");
    assert.equal(diagnostics.totalWallMs, 9000);
    assert.equal(diagnostics.lanes?.[0]?.physicalInvocationId, "aws-request-runtime-1");
    assert.equal(status.type, "certscore_scan_job");
    assert.equal(inventory.type, "certscore_pre_consent_cookies_trackers");
    assert.equal(findings.type, "certscore_finding_list");
    assert.equal(finding.id, "pre_consent_tracking_detected");
    assert.equal(wrappedPulse.type, "certscore_scan_pulse");
    assert.equal(latest.type, "certscore_domain_latest_scan");
    assert.equal(latestInventory.type, "certscore_pre_consent_cookies_trackers");
    assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123$/);
    assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/diagnostics$/);
    assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/status$/);
    assert.match(mock.calls[3] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/pre-consent-cookies-trackers$/);
    assert.match(mock.calls[4] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/findings$/);
    assert.match(mock.calls[5] ?? "", /\/findings\/pre_consent_tracking_detected$/);
    assert.match(mock.calls[6] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/pulse$/);
    assert.match(mock.calls[7] ?? "", /\/api\/v2\/domains\/example.com\/latest\?scanFrom=california$/);
    assert.match(mock.calls[8] ?? "", /\/api\/v2\/domains\/example.com\/latest\/pre-consent-cookies-trackers\?scanFrom=california$/);
  } finally {
    mock.restore();
  }
});

test("scans.create uses the same API v2 submission path for every production region", async () => {
  const regions = ["eu_de", "eu_ie", "california"] as const;
  const mock = installFetch(regions.map((scanFrom, index) => ({
      status: 202,
      body: { type: "certscore_scan_job", status: "queued", jobId: `job_${index + 1}`, scanId: `scan_${index + 1}`, scanFrom }
    })));

  try {
    const client = new CertScoreClient();
    for (const [index, scanFrom] of regions.entries()) {
      const pending = await client.scans.create("https://example.com", {
        freshness: "refresh",
        metadata: { source: "test" },
        scanFrom
      });

      assert.equal(pending.type, "certscore_scan_job");
      assert.equal(pending.status, "queued");
      assert.match(mock.calls[index] ?? "", /\/api\/v2\/scans$/);
      assert.equal(mock.callDetails[index]?.method, "POST");
      assert.deepEqual(JSON.parse(String(mock.callDetails[index]?.body)), {
        freshness: "refresh",
        metadata: { source: "test" },
        scanFrom,
        url: "https://example.com"
      });
    }
  } finally {
    mock.restore();
  }
});
