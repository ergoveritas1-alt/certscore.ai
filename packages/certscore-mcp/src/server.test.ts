import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCertScoreMcpServer } from "./server.js";

type MockResponse = {
  status: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
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

async function withMcpClient<T>(callback: (client: Client) => Promise<T>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer();
  const client = new Client({
    name: "certscore-mcp-test",
    version: "0.0.0"
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>) {
  const first = result.content[0];
  assert.equal(first?.type, "text");
  return JSON.parse(first.text) as Record<string, unknown>;
}

const pulse = {
  type: "certscore_pulse",
  scanId: "scan_123",
  domain: "example.com",
  summary: { headline: "Automated scan surfaced review signals.", score: 72 },
  findings: [
    {
      id: "pre_consent_tracking_detected",
      label: "Tracking started before consent",
      criticality: "critical",
      confidence: "strong",
      plainEnglish: "Runtime evidence showed non-essential tracking before a consent choice.",
      evidence: {
        summary: "A third-party tracking request was observed before consent.",
        exampleEvents: [{ type: "request", vendor: "Example Analytics" }],
        fullEvidenceUrl: "https://certscore.ai/scan/scan_123#finding-pre_consent_tracking_detected"
      },
      evidenceDigest: { basis: "runtime_observation", hasTimingAnchor: true },
      reviewLenses: ["GDPR / ePrivacy"],
      nextStep: "Review whether the vendor should be consent-gated."
    }
  ],
  topFindings: [],
  coverage: { limitations: ["Automated public-web scan only."] },
  disclaimer: "Automated public-web observations for review."
} as const;

test("CertScore MCP server exposes the scoped v1 tool surface", async () => {
  await withMcpClient(async (client) => {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "create_scan",
        "explain_finding",
        "export_findings",
        "get_latest_domain_pre_consent_cookies_trackers",
        "get_latest_domain_scan",
        "get_pre_consent_cookies_trackers",
        "get_report",
        "get_scan",
        "get_scan_status",
        "list_findings",
        "scan_site"
      ]
    );
  });
});

test("README documents current MCP tool surface and public docs", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  for (const tool of [
    "scan_site",
    "create_scan",
    "get_scan",
    "get_scan_status",
    "get_report",
    "export_findings",
    "list_findings",
    "get_pre_consent_cookies_trackers",
    "explain_finding",
    "get_latest_domain_scan",
    "get_latest_domain_pre_consent_cookies_trackers"
  ]) {
    assert.match(readme, new RegExp(`\\\`${tool}\\\``));
  }

  assert.match(readme, /https:\/\/certscore\.ai\/developers\/mcp/);
  assert.match(readme, /get_latest_domain_scan/);
  assert.match(readme, /automated public-web observations for review/i);
  assert.doesNotMatch(readme, /legal violation|non-compliant|certifies compliance/i);
});

test("create_scan returns async status and scan handles", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_pulse_status",
        status: "running",
        jobId: "pulse_job_123",
        scanId: "scan_123",
        statusUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
        reportUrl: "https://certscore.ai/scan/scan_123"
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(
        await client.callTool({
          name: "create_scan",
          arguments: { url: "https://example.com", detail: "standard" }
        })
      );
      assert.equal(result.type, "certscore_mcp_scan_created");
      assert.equal(result.status, "running");
      assert.equal(result.jobId, "pulse_job_123");
      assert.equal(result.scanId, "scan_123");
      assert.match(mock.calls[0] ?? "", /wait=0/);
    });
  } finally {
    mock.restore();
  }
});

test("create_scan returns immediate completed Pulse when API responds 200", async () => {
  const mock = installFetch([{ status: 200, body: pulse }]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(
        await client.callTool({
          name: "create_scan",
          arguments: { url: "https://example.com" }
        })
      );
      assert.equal(result.completed, true);
      assert.equal(result.scanId, "scan_123");
      assert.equal(typeof result.pulse, "object");
      assert.match(mock.calls[0] ?? "", /freshness=latest/);
    });
  } finally {
    mock.restore();
  }
});

test("scan_site uses API v2 scan creation", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_scan_job",
        status: "queued",
        jobId: "pulse_job_123",
        scanId: "scan_123"
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(
        await client.callTool({
          name: "scan_site",
          arguments: { url: "https://example.com", freshness: "refresh", scanFrom: "california" }
        })
      );
      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.status, "queued");
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans$/);
    });
  } finally {
    mock.restore();
  }
});

test("get_scan_status returns normalized scanId", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: { type: "certscore_pulse_status", status: "completed", jobId: "pulse_job_123", scan_id: "scan_123" }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({ name: "get_scan_status", arguments: { jobId: "pulse_job_123" } }));
      assert.equal(result.scanId, "scan_123");
      assert.match(mock.calls[0] ?? "", /pulse\/status\/pulse_job_123/);
    });
  } finally {
    mock.restore();
  }
});

test("get_scan_status supports API v2 scanId status", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        jobId: "00000000-0000-4000-8000-000000000123",
        scanId: "00000000-0000-4000-8000-000000000123",
        status: "completed"
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(
        await client.callTool({
          name: "get_scan_status",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
        })
      );
      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.scanId, "00000000-0000-4000-8000-000000000123");
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/status/);
    });
  } finally {
    mock.restore();
  }
});

test("get_report supports markdown and JSON report retrieval", async () => {
  const mock = installFetch([{ status: 200, text: "# CertScore Pulse" }, { status: 200, body: pulse }]);
  try {
    await withMcpClient(async (client) => {
      const markdown = parseToolJson(
        await client.callTool({ name: "get_report", arguments: { scanId: "scan_123", format: "markdown" } })
      );
      assert.equal(markdown, "# CertScore Pulse");

      const json = parseToolJson(await client.callTool({ name: "get_report", arguments: { scanId: "scan_123", detail: "full" } }));
      assert.equal(json.scanId, "scan_123");
      assert.match(mock.calls[0] ?? "", /format=markdown/);
      assert.match(mock.calls[1] ?? "", /detail=full/);
    });
  } finally {
    mock.restore();
  }
});

test("export_findings uses full Pulse detail and explain_finding uses API v2 finding detail", async () => {
  const mock = installFetch([
    { status: 200, body: pulse },
    {
      status: 200,
      body: {
        type: "certscore_finding",
        id: "pre_consent_tracking_detected",
        scanId: "scan_123",
        label: "Tracking started before consent",
        criticality: "critical",
        confidence: "strong",
        plainEnglish: "Runtime evidence showed non-essential tracking before a consent choice.",
        evidence: {
          basis: "runtime_observation",
          summary: "A third-party tracking request was observed before consent.",
          exampleCount: 1,
          examplesShown: 1
        },
        detail: { caveats: ["Automated public-web scan only."] },
        disclaimer: "Automated public-web observations for review."
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const exported = parseToolJson(await client.callTool({ name: "export_findings", arguments: { scanId: "scan_123" } }));
      assert.equal(exported.type, "certscore_mcp_findings_export");
      assert.equal((exported.findings as unknown[]).length, 1);

      const explanation = parseToolJson(
        await client.callTool({
          name: "explain_finding",
          arguments: { scanId: "scan_123", findingId: "pre_consent_tracking_detected" }
        })
      );
      assert.equal(explanation.type, "certscore_finding");
      assert.equal(explanation.id, "pre_consent_tracking_detected");
      assert.match(mock.calls[0] ?? "", /detail=full/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123\/findings\/pre_consent_tracking_detected/);
    });
  } finally {
    mock.restore();
  }
});

test("API v2 MCP tools return scan, findings, and latest domain resources", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan",
        scanId: "scan_123",
        domain: "example.com",
        status: "completed"
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_finding_list",
        scanId: "scan_123",
        findings: []
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_pre_consent_cookies_trackers",
        scanId: "scan_123",
        domain: "example.com",
        summary: { rowCount: 0, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: []
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
        scanId: "scan_123",
        domain: "example.com",
        summary: { rowCount: 0, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: []
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const scan = parseToolJson(await client.callTool({ name: "get_scan", arguments: { scanId: "scan_123" } }));
      const findings = parseToolJson(await client.callTool({ name: "list_findings", arguments: { scanId: "scan_123" } }));
      const inventory = parseToolJson(await client.callTool({ name: "get_pre_consent_cookies_trackers", arguments: { scanId: "scan_123" } }));
      const latest = parseToolJson(
        await client.callTool({ name: "get_latest_domain_scan", arguments: { domain: "example.com", scanFrom: "california" } })
      );
      const latestInventory = parseToolJson(
        await client.callTool({ name: "get_latest_domain_pre_consent_cookies_trackers", arguments: { domain: "example.com", scanFrom: "california" } })
      );

      assert.equal(scan.type, "certscore_scan");
      assert.equal(findings.type, "certscore_finding_list");
      assert.equal(inventory.type, "certscore_pre_consent_cookies_trackers");
      assert.equal(latest.type, "certscore_domain_latest_scan");
      assert.equal(latestInventory.type, "certscore_pre_consent_cookies_trackers");
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/scan_123$/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123\/findings$/);
      assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/scan_123\/pre-consent-cookies-trackers$/);
      assert.match(mock.calls[3] ?? "", /\/api\/v2\/domains\/example.com\/latest\?scanFrom=california$/);
      assert.match(mock.calls[4] ?? "", /\/api\/v2\/domains\/example.com\/latest\/pre-consent-cookies-trackers\?scanFrom=california$/);
    });
  } finally {
    mock.restore();
  }
});

test("tool errors are returned as structured JSON", async () => {
  const mock = installFetch([
    {
      status: 400,
      body: { type: "certscore_pulse_error", error: { code: "invalid_url", message: "Enter a valid public URL or domain." } }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({ name: "create_scan", arguments: { url: "::::" } }));
      const error = result.error as Record<string, unknown>;
      assert.equal(error.name, "InvalidUrlError");
      assert.equal(error.code, "invalid_url");
    });
  } finally {
    mock.restore();
  }
});
