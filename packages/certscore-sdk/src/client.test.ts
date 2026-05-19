import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreClient } from "./client.js";
import { InvalidUrlError, ScanFailedError, ScanTimeoutError, ThrottledError } from "./errors.js";

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
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
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
        error instanceof ScanTimeoutError && error.jobId === "job_1" && error.scanId === "scan_123"
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
        (error: unknown) => error instanceof ScanFailedError && error.jobId === "job_1" && error.scanId === "scan_123"
      );
    } finally {
      mock.restore();
    }
  }
});
