import assert from "node:assert/strict";
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
      ["create_scan", "explain_finding", "export_findings", "get_report", "get_scan_status"]
    );
  });
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

test("export_findings and explain_finding use full report detail", async () => {
  const mock = installFetch([{ status: 200, body: pulse }, { status: 200, body: pulse }]);
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
      assert.equal(explanation.found, true);
      assert.deepEqual(explanation.caveats, ["Automated public-web scan only."]);
      assert.match(mock.calls[0] ?? "", /detail=full/);
      assert.match(mock.calls[1] ?? "", /detail=full/);
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
