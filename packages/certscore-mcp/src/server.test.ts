import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { certScoreMcpToolContracts } from "@certscore/api-contracts";
import { CERTSCORE_MCP_VERSION, getCertScoreMcpDoctorReport } from "./index.js";
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
  const requestBodies: Array<string | undefined> = [];
  const requestHeaders: Headers[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    requestBodies.push(typeof init?.body === "string" ? init.body : undefined);
    requestHeaders.push(new Headers(init?.headers));
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
    requestBodies,
    requestHeaders,
    restore() {
      globalThis.fetch = previous;
    }
  };
}

async function withMcpClient<T>(callback: (client: Client) => Promise<T>, options: Parameters<typeof createCertScoreMcpServer>[0] = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer(options);
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
  if (result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
    return result.structuredContent as Record<string, unknown>;
  }
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

function apiFinding(id: string) {
  return {
    type: "certscore_finding",
    id,
    scanId: "scan_123",
    label: "Tracking started before consent",
    criticality: "high",
    confidence: "good",
    plainEnglish: "Runtime evidence showed non-essential tracking before a consent choice.",
    evidence: {
      basis: "runtime_observation",
      summary: "A third-party tracking request was observed before consent.",
      exampleCount: 1,
      examplesShown: 1,
      hasTimingAnchor: true,
      hasVendorAnchor: true
    },
    reviewLenses: ["GDPR / ePrivacy"],
    disclaimer: "Automated public-web observations for review."
  };
}

function preConsentRow(id: string) {
  return {
    id,
    kind: "tracker",
    name: "Example Analytics",
    vendor: "Example Analytics",
    host: "analytics.example.test",
    registrableDomain: "example.test",
    priority: "high",
    confidence: "high",
    party: "third_party",
    requestDetails: [{
      cookieNamesSent: ["analytics_id"],
      essentiality: "unknown",
      hostname: "analytics.example.test",
      identifierParameterNames: ["client_id"],
      initiatorUrl: "https://example.com/app.js",
      method: "POST",
      path: "/collect",
      responseCookieNamesSet: [],
      responseObserved: true,
      responseStorageAttempted: false,
      vendor: "Example Analytics"
    }],
    requestCount: 1,
    phase: "pre_consent",
    observedBeforeConsent: true,
    evidenceBasis: "public_report_projection",
    firstObservedAtMs: 1200,
    pageUrlHost: "example.com"
  };
}

test("CertScore MCP server exposes the scoped v1 tool surface", async () => {
  await withMcpClient(async (client) => {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "certscore_explain_finding",
        "certscore_export_findings",
        "certscore_get_evidence",
        "certscore_get_latest_domain_pre_consent_cookies_trackers",
        "certscore_get_latest_domain_scan",
        "certscore_get_pre_consent_cookies_trackers",
        "certscore_get_report",
        "certscore_get_scan",
        "certscore_get_scan_bundle",
        "certscore_get_scan_status",
        "certscore_list_findings",
        "certscore_scan_site"
      ]
    );
  });
});

test("CertScore Light exposes only the focused no-account workflow", async () => {
  await withMcpClient(async (client) => {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["certscore_get_scan_bundle", "certscore_get_scan_status", "certscore_scan_site"]
    );
    const scanSiteTool = tools.tools.find((tool) => tool.name === "certscore_scan_site");
    assert.ok(scanSiteTool?.outputSchema?.required?.includes("error"));
    assert.ok(scanSiteTool?.outputSchema?.required?.includes("recommendedNextAction"));
    const statusTool = tools.tools.find((tool) => tool.name === "certscore_get_scan_status");
    assert.deepEqual(statusTool?.inputSchema.required, ["scanId"]);
    assert.equal(statusTool?.inputSchema.additionalProperties, false);
    assert.ok(statusTool?.outputSchema?.required?.includes("error"));
    assert.ok(statusTool?.outputSchema?.required?.includes("recommendedNextAction"));
    const bundleTool = tools.tools.find((tool) => tool.name === "certscore_get_scan_bundle");
    assert.equal(bundleTool?.inputSchema.additionalProperties, false);
    assert.deepEqual((bundleTool?.inputSchema.properties?.detail as { enum?: string[] })?.enum, ["summary", "findings", "evidence", "full"]);
    assert.equal((bundleTool?.inputSchema.properties?.maxBytes as { minimum?: number })?.minimum, 5_000);
    assert.ok(bundleTool?.outputSchema?.required?.includes("detail"));
    assert.ok(bundleTool?.outputSchema?.required?.includes("error"));
    const metadataSchema = bundleTool?.outputSchema?.properties?.mcpMetadata as { required?: string[] } | undefined;
    for (const field of ["requestedMaxBytes", "actualBytes", "truncated", "truncationReason", "omittedSections", "nextRecommendedMaxBytes", "omittedContentAvailableViaUrl", "contentUrls"]) {
      assert.ok(metadataSchema?.required?.includes(field), `mcpMetadata.${field} must be required`);
    }
  }, { toolProfile: "light" });
});

test("CertScore MCP server tool metadata stays aligned with shared contracts", async () => {
  await withMcpClient(async (client) => {
    const tools = await client.listTools();
    const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

    for (const contract of certScoreMcpToolContracts) {
      const listed = byName.get(contract.name);
      assert.ok(listed, `Expected listed MCP tool ${contract.name}`);
      assert.equal(listed.title, contract.title);
      assert.equal(listed.description, contract.description);
      assert.deepEqual(listed.annotations, contract.annotations);
      assert.equal(listed.outputSchema?.type, "object");
    }
  });
});

test("README documents current MCP tool surface and public docs", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    files?: string[];
    name?: string;
    private?: boolean;
  };

  for (const tool of [
    "certscore_scan_site",
    "certscore_get_scan",
    "certscore_get_scan_status",
    "certscore_get_report",
    "certscore_get_evidence",
    "certscore_get_scan_bundle",
    "certscore_export_findings",
    "certscore_list_findings",
    "certscore_get_pre_consent_cookies_trackers",
    "certscore_explain_finding",
    "certscore_get_latest_domain_scan",
    "certscore_get_latest_domain_pre_consent_cookies_trackers"
  ]) {
    assert.match(readme, new RegExp(`\\\`${tool}\\\``));
  }

  assert.match(readme, /https:\/\/certscore\.ai\/developers\/mcp/);
  assert.match(readme, /certscore_get_latest_domain_scan/);
  assert.match(readme, /brew install --cask certscore-mcp/);
  assert.match(readme, /certscore-mcp doctor/);
  assert.match(readme, /"command": "certscore-mcp"/);
  assert.doesNotMatch(readme, /npx -y certscore-mcp/);
  assert.doesNotMatch(readme, /"command": "npx"/);
  assert.match(readme, /automated public-web observations for review/i);
  assert.doesNotMatch(readme, /legal violation|non-compliant|certifies compliance/i);

  assert.equal(packageJson.name, "@certscore/mcp");
  assert.equal(packageJson.private, false);
  assert.equal(packageJson.bin?.["certscore-mcp"], "dist/certscore-mcp.mjs");
  assert.deepEqual(packageJson.files, ["dist", "README.md", "LICENSE", "server.json", "server-light.json"]);
  assert.equal(packageJson.dependencies?.["@certscore/api-contracts"], undefined);
  assert.equal(packageJson.dependencies?.["@certscore/sdk"], undefined);
  assert.equal(packageJson.devDependencies?.["@certscore/api-contracts"], "workspace:*");
  assert.equal(packageJson.devDependencies?.["@certscore/sdk"], "workspace:*");

  assert.match(readme, /scanTimeSeconds/);
  assert.match(readme, /scanTimeSeconds: null/);
  assert.match(readme, /should not be displayed as `0`/);
});

test("doctor reports healthy API and missing API key without failing", async () => {
  const fetchCalls: string[] = [];
  const result = await getCertScoreMcpDoctorReport({
    env: {},
    fetch: (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return jsonResponse(200, { type: "certscore_api_v2_health", status: "ok" });
    }) as typeof fetch,
    nodeVersion: "22.12.0"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.lines.join("\n"), new RegExp(`version ${CERTSCORE_MCP_VERSION.replaceAll(".", "\\.")}`));
  assert.match(result.lines.join("\n"), /Node\.js 22\.12\.0 is compatible/);
  assert.match(result.lines.join("\n"), /API health reachable/);
  assert.match(result.lines.join("\n"), /CERTSCORE_API_KEY is not set/);
  assert.equal(fetchCalls[0], "https://certscore.ai/api/v2/health");
});

test("doctor reports present API key without leaking the secret", async () => {
  const secret = "cs_test_super_secret_value";
  const result = await getCertScoreMcpDoctorReport({
    env: {
      CERTSCORE_API_KEY: secret,
      CERTSCORE_BASE_URL: "https://certscore.ai"
    },
    fetch: (async () => jsonResponse(200, { status: "ok" })) as typeof fetch,
    nodeVersion: "24.1.0"
  });

  const output = result.lines.join("\n");
  assert.equal(result.exitCode, 0);
  assert.match(output, /CERTSCORE_API_KEY is present/);
  assert.match(output, /doctor --check-auth/);
  assert.doesNotMatch(output, new RegExp(secret));
});

test("doctor can validate a credential without creating a scan", async () => {
  const requests: Array<{ url: string; authorization?: string }> = [];
  const result = await getCertScoreMcpDoctorReport({
    checkAuth: true,
    env: {
      CERTSCORE_API_KEY: "cs_test_super_secret_value",
      CERTSCORE_BASE_URL: "https://certscore.ai"
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") ?? undefined });
      return jsonResponse(200, { authenticated: true });
    }) as typeof fetch,
    nodeVersion: "22.12.0"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.lines.join("\n"), /API key authenticated/);
  assert.deepEqual(requests.at(-1), {
    url: "https://certscore.ai/api/v2/auth/check",
    authorization: "Bearer cs_test_super_secret_value"
  });
  assert.doesNotMatch(result.lines.join("\n"), /cs_test_super_secret_value/);
});

test("doctor fails for unreachable API health", async () => {
  const result = await getCertScoreMcpDoctorReport({
    env: { CERTSCORE_BASE_URL: "https://api.example.test" },
    fetch: (async () => {
      throw new Error("network unavailable");
    }) as typeof fetch,
    nodeVersion: "22.12.0"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.lines.join("\n"), /API health unreachable/);
  assert.match(result.lines.join("\n"), /network unavailable/);
});

test("doctor fails for incompatible Node runtime", async () => {
  const result = await getCertScoreMcpDoctorReport({
    env: {},
    fetch: (async () => jsonResponse(200, { status: "ok" })) as typeof fetch,
    nodeVersion: "25.0.0"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.lines.join("\n"), /Node\.js 25\.0\.0 is not compatible/);
});

test("version constant stays aligned with package version", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    engines?: { node?: string };
    version: string;
  };
  assert.equal(CERTSCORE_MCP_VERSION, packageJson.version);
  assert.equal(packageJson.engines?.node, ">=20");
});

test("certscore_scan_site can return immediately for an explicitly asynchronous workflow", async () => {
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
          name: "certscore_scan_site",
          arguments: { url: "https://example.com", freshness: "refresh", scanFrom: "eu_ie", waitForCompletion: false }
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

test("certscore_scan_site forwards EU-Germany, EU-Ireland, and California contexts", async () => {
  for (const scanFrom of ["eu_de", "eu_ie", "california"] as const) {
    const mock = installFetch([{ status: 202, body: { type: "certscore_scan_job", status: "queued", jobId: `job_${scanFrom}`, scanId: `scan_${scanFrom}` } }]);
    try {
      await withMcpClient(async (client) => {
        const result = parseToolJson(await client.callTool({ name: "certscore_scan_site", arguments: { url: "https://example.com", scanFrom, waitForCompletion: false } }));
        assert.equal(result.status, "queued");
        assert.equal(JSON.parse(mock.requestBodies[0] ?? "{}").scanFrom, scanFrom);
      });
    } finally {
      mock.restore();
    }
  }
});

test("certscore_scan_site waits by default and returns the completed scan resource", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_scan_job",
        status: "queued",
        jobId: "pulse_job_123",
        scanId: "scan_123",
        retryAfterSeconds: 0,
        links: { status: "https://certscore.ai/api/v2/scans/scan_123/status" }
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        status: "completed",
        score: 78,
        riskLevel: "monitor",
        jobId: "pulse_job_123",
        scanId: "scan_123"
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan",
        status: "completed",
        scanId: "scan_123",
        domain: "example.com",
        scanTimeSeconds: 21.4
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://example.com" }
      }));
      assert.equal(result.type, "certscore_scan");
      assert.equal(result.status, "completed");
      assert.equal(result.scanTimeSeconds, 21.4);
      assert.equal(mock.calls.length, 3);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123\/status$/);
      assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/scan_123$/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_scan_site preserves the accepted scan identity when follow-up polling fails", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_scan_job",
        status: "queued",
        jobId: "pulse_job_123",
        scanId: "scan_123",
        retryAfterSeconds: 0,
        links: { status: "https://certscore.ai/api/v2/scans/scan_123/status" }
      }
    },
    {
      status: 503,
      body: {
        error: {
          code: "internal_error",
          message: "Status is temporarily unavailable."
        }
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://example.com" }
      }));

      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.status, "queued");
      assert.equal(result.scanId, "scan_123");
      assert.equal(result.jobId, "pulse_job_123");
      assert.equal(result.recommendedNextTool, "certscore_get_scan_status");
      assert.equal(result.error, null);
      assert.equal(mock.calls.length, 2);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_status requires the stable scanId", async () => {
  await withMcpClient(async (client) => {
    await client.listTools();
    const missing = await client.callTool({ name: "certscore_get_scan_status", arguments: {} });

    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent, undefined);
    const payload = parseToolJson(missing);
    assert.deepEqual(payload.error, {
      code: "invalid_arguments",
      message: "The scanId field is required.",
      field: "scanId",
      retryable: false,
      retryAfterSeconds: null,
      recommendedNextAction: "Provide the stable scanId returned by certscore_scan_site.",
      mcpCode: -32602
    });
  });
});

test("certscore_scan_site returns typed validation details when url is missing", async () => {
  await withMcpClient(async (client) => {
    await client.listTools();
    const missing = await client.callTool({ name: "certscore_scan_site", arguments: {} });
    assert.equal(missing.isError, true);
    const payload = parseToolJson(missing);
    assert.equal(payload.type, "certscore_tool_error");
    assert.equal(payload.status, "invalid_arguments");
    assert.deepEqual(payload.error, {
      code: "invalid_arguments",
      message: "The url field is required.",
      field: "url",
      retryable: false,
      retryAfterSeconds: null,
      recommendedNextAction: "Provide a public URL or domain.",
      mcpCode: -32602
    });
  }, { toolProfile: "light" });
});

test("certscore_get_scan_status supports API v2 scanId status with timing fields", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        jobId: "00000000-0000-4000-8000-000000000123",
        scanId: "00000000-0000-4000-8000-000000000123",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:00:34.000Z",
        scanTimeSeconds: 34
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        status: "completed",
        score: 78,
        riskLevel: "monitor",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:00:34.000Z",
        scanTimeSeconds: 34
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(
        await client.callTool({
          name: "certscore_get_scan_status",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
        })
      );
      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.scanId, "00000000-0000-4000-8000-000000000123");
      assert.equal(result.startedAt, "2026-07-08T12:00:00.000Z");
      assert.equal(result.completedAt, "2026-07-08T12:00:34.000Z");
      assert.equal(result.scanTimeSeconds, 34);
      assert.equal(result.score, 78);
      assert.equal(result.riskLevel, "monitor");
      assert.equal(mock.calls.length, 2);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/status/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123$/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_status hydrates terminal API v2 status with completed-limited no-go details", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        jobId: "scan_123",
        scanId: "scan_123",
        domain: "example.com",
        status: "completed",
        phase: "completed"
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_scan",
        scanId: "scan_123",
        domain: "example.com",
        status: "completed_limited",
        resultDisposition: "no_go",
        noGo: {
          reasonCode: "parked_or_placeholder",
          title: "The domain shows a placeholder page",
          explanation: "The retained page was a placeholder.",
          summary: "A placeholder page was observed.",
          limitationKind: "target_site_state",
          recommendedNextAction: "Publish the intended site.",
          retryLikelyToHelp: false
        },
        startedAt: "2026-07-15T20:32:53.182Z",
        completedAt: "2026-07-15T20:32:56.188Z",
        scanTimeSeconds: 3
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({ name: "certscore_get_scan_status", arguments: { scanId: "scan_123" } }));
      assert.equal(result.status, "completed_limited");
      assert.equal(result.resultDisposition, "no_go");
      assert.equal((result.noGo as Record<string, unknown>).reasonCode, "parked_or_placeholder");
      assert.equal((result.error as Record<string, unknown>).code, "parked_or_placeholder");
      assert.equal((result.error as Record<string, unknown>).retryable, false);
      assert.equal((result.error as Record<string, unknown>).retryAfterSeconds, null);
      assert.equal((result.error as Record<string, unknown>).recommendedNextAction, "Publish the intended site.");
      assert.match(String(result.observationOnlyDisclaimer), /not proof of compliance/i);
      assert.equal(result.scanTimeSeconds, 3);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/scan_123\/status$/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123$/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_status returns complete errors for failed, expired, and rate-limited scans", async () => {
  const statuses = ["failed", "expired", "rate_limited"] as const;
  const mock = installFetch(statuses.map((status) => ({
    status: 200,
    body: {
      type: "certscore_scan_job",
      jobId: `scan_${status}`,
      scanId: `scan_${status}`,
      status,
      ...(status === "rate_limited" ? { retryAfterSeconds: 45 } : {})
    }
  })));
  try {
    await withMcpClient(async (client) => {
      for (const status of statuses) {
        const result = parseToolJson(await client.callTool({
          name: "certscore_get_scan_status",
          arguments: { scanId: `scan_${status}` }
        }));
        const error = result.error as Record<string, unknown>;
        assert.equal(result.status, status);
        assert.equal(result.recommendedNextTool, null);
        assert.equal(typeof error.code, "string");
        assert.equal(typeof error.message, "string");
        assert.equal(error.retryable, true);
        assert.equal(typeof error.retryAfterSeconds, "number");
        assert.equal(typeof error.recommendedNextAction, "string");
      }
      assert.equal(mock.calls.length, 3);
    }, { toolProfile: "light" });
  } finally {
    mock.restore();
  }
});

test("certscore_get_report supports markdown and JSON report retrieval", async () => {
  const mock = installFetch([{ status: 200, text: "# CertScore Pulse" }, { status: 200, body: pulse }]);
  try {
    await withMcpClient(async (client) => {
      const markdown = parseToolJson(
        await client.callTool({ name: "certscore_get_report", arguments: { scanId: "scan_123", format: "markdown" } })
      );
      assert.equal(markdown.value, "# CertScore Pulse");

      const json = parseToolJson(await client.callTool({ name: "certscore_get_report", arguments: { scanId: "scan_123", detail: "full" } }));
      assert.equal(json.scanId, "scan_123");
      assert.match(mock.calls[0] ?? "", /format=markdown/);
      assert.match(mock.calls[1] ?? "", /detail=full/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_evidence retrieves the bounded Evidence JSON artifact", async () => {
  const mock = installFetch([{ status: 200, body: { ...pulse, type: "certscore_pulse_evidence" } }]);
  try {
    await withMcpClient(async (client) => {
      const evidence = parseToolJson(await client.callTool({ name: "certscore_get_evidence", arguments: { scanId: "scan_123" } }));
      assert.equal(evidence.type, "certscore_pulse_evidence");
      assert.match(mock.calls[0] ?? "", /scanId=scan_123/);
      assert.match(mock.calls[0] ?? "", /detail=evidence/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_bundle returns a compact canonical summary by default", async () => {
  const scan = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    url: "https://example.com",
    status: "completed",
    score: 72,
    coverage: { status: "partial" },
    links: { self: "https://certscore.ai/api/v2/scans/scan_123" },
    disclaimer: "Automated public-web observations for review."
  };
  const mock = installFetch([
    { status: 200, body: scan },
    { status: 200, body: { ...pulse, summary: { ...pulse.summary, score: 88 }, type: "certscore_pulse_summary", executiveSummary: { issuesToReview: 1 }, counts: { totalAutomatedFindingCount: 1 } } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "scan_123", findings: [apiFinding("finding_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId: "scan_123" } });
      const bundle = parseToolJson(raw);
      assert.equal(bundle.type, "certscore_scan_bundle");
      assert.equal(bundle.scanId, "scan_123");
      assert.equal(bundle.status, "completed");
      assert.equal(bundle.score, 72);
      assert.equal((bundle.findings as unknown[]).length, 0);
      assert.equal(bundle.detail, "summary");
      assert.ok(((bundle.mcpMetadata as Record<string, unknown>).omittedSections as string[]).includes("findings"));
      assert.equal(bundle.evidenceSummary, undefined);
      assert.equal(bundle.preConsentCookiesTrackers, undefined);
      assert.equal(bundle.recommendedNextTool, null);
      assert.doesNotMatch(JSON.stringify(bundle), /certscore_explain_finding/);
      assert.equal(mock.calls.length, 3);
      assert.ok(raw.content[0]?.type === "text" && raw.content[0].text.length < 180);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_bundle returns the canonical no-go result when the Pulse report is unavailable", async () => {
  const recommendedNextAction = "Publish the intended public website, then run the scan again.";
  const mock = installFetch([{
    status: 200,
    body: {
      type: "certscore_scan",
      scanId: "scan_no_go",
      domain: "example.net",
      url: "https://example.net",
      status: "completed_limited",
      score: null,
      scoreStatus: "final",
      scoreVersion: "overall-score.v2",
      scoreUpdatedAt: "2026-08-06T03:45:52.303Z",
      riskLevel: null,
      resultDisposition: "no_go",
      noGo: {
        reasonCode: "parked_or_placeholder",
        title: "The domain shows a placeholder page",
        explanation: "The retained page was a placeholder rather than the intended public website.",
        summary: "CertScore observed a placeholder page.",
        limitationKind: "target_site_state",
        recommendedNextAction,
        retryLikelyToHelp: false
      },
      coverage: {
        status: "target_site_state",
        summary: "CertScore observed a placeholder page.",
        limitations: ["The retained page was a placeholder."]
      }
    }
  }]);
  try {
    await withMcpClient(async (client) => {
      const bundle = parseToolJson(await client.callTool({
        name: "certscore_get_scan_bundle",
        arguments: { scanId: "scan_no_go", detail: "evidence", maxBytes: 5000 }
      }));
      assert.equal(bundle.type, "certscore_scan_bundle");
      assert.equal(bundle.status, "completed_limited");
      assert.equal(bundle.score, null);
      assert.equal(bundle.scoreStatus, "final");
      assert.equal(bundle.resultDisposition, "no_go");
      assert.equal(bundle.recommendedNextAction, recommendedNextAction);
      assert.deepEqual(bundle.findings, []);
      assert.deepEqual((bundle.evidenceSummary as Record<string, unknown>).digests, []);
      assert.equal(bundle.error && (bundle.error as Record<string, unknown>).code, "parked_or_placeholder");
      assert.match(String(bundle.observationOnlyDisclaimer), /not proof of compliance/i);
      assert.equal(mock.calls.length, 1);
    });
  } finally {
    mock.restore();
  }
});

test("completed Light tools preserve one final canonical score and metadata", async () => {
  const canonicalScan = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    url: "https://example.com",
    status: "completed",
    score: 71,
    scoreStatus: "final",
    scoreVersion: "overall-score.v2",
    scoreUpdatedAt: "2026-08-05T20:00:30.000Z",
    riskLevel: "review_recommended",
    coverage: { status: "complete" },
    createdAt: "2026-08-05T19:59:58.000Z",
    startedAt: "2026-08-05T20:00:00.000Z",
    completedAt: "2026-08-05T20:00:30.000Z",
    scanTimeSeconds: 30,
    links: { report: "https://certscore.ai/scan/scan_123" }
  };
  const mock = installFetch([
    { status: 200, body: canonicalScan },
    { status: 200, body: { type: "certscore_scan_job", jobId: "scan_123", scanId: "scan_123", status: "completed" } },
    { status: 200, body: canonicalScan },
    { status: 200, body: canonicalScan },
    { status: 200, body: { ...pulse, summary: { ...pulse.summary, score: 73 }, type: "certscore_pulse_summary" } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "scan_123", findings: [apiFinding("finding_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const created = parseToolJson(await client.callTool({ name: "certscore_scan_site", arguments: { url: "https://example.com" } }));
      const status = parseToolJson(await client.callTool({ name: "certscore_get_scan_status", arguments: { scanId: "scan_123" } }));
      const bundle = parseToolJson(await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId: "scan_123" } }));

      for (const key of [
        "status", "score", "scoreStatus", "scoreVersion", "scoreUpdatedAt", "riskLevel", "coverage",
        "createdAt", "startedAt", "completedAt", "scanTimeSeconds"
      ] as const) {
        assert.deepEqual(created[key], canonicalScan[key], `certscore_scan_site ${key}`);
        assert.deepEqual(status[key], canonicalScan[key], `certscore_get_scan_status ${key}`);
        assert.deepEqual(bundle[key], canonicalScan[key], `certscore_get_scan_bundle ${key}`);
      }
      assert.equal((bundle.timing as Record<string, unknown>).createdAt, "2026-08-05T19:59:58.000Z");
      assert.equal(created.url, "https://example.com");
      assert.equal(status.url, "https://example.com");
      assert.equal(bundle.url, "https://example.com");
      assert.equal(status.reportUrl, "https://certscore.ai/scan/scan_123");
      assert.equal(bundle.reportUrl, "https://certscore.ai/scan/scan_123");
      assert.equal(mock.calls.length, 6);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_bundle opts into bounded evidence and pre-consent inventory", async () => {
  const scan = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    status: "completed",
    score: 72,
    coverage: { status: "partial" }
  };
  const mock = installFetch([
    { status: 200, body: scan },
    { status: 200, body: { ...pulse, type: "certscore_pulse_evidence", evidenceSafetyNotes: ["Public-safe evidence only."], projectedFindings: pulse.findings } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "scan_123", findings: [apiFinding("finding_1")] } },
    { status: 200, body: { type: "certscore_pre_consent_cookies_trackers", scanId: "scan_123", domain: "example.com", summary: { rowCount: 1, trackerCount: 1, cookieCount: 0, requestCount: 1 }, rows: [preConsentRow("row_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const bundle = parseToolJson(await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId: "scan_123", detail: "evidence" } }));
      assert.ok(bundle.evidenceSummary);
      assert.equal(((bundle.preConsentCookiesTrackers as Record<string, unknown>).rows as unknown[]).length, 1);
      assert.equal(mock.calls.length, 4);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_evidence bounds oversized Evidence JSON artifacts", async () => {
  const mock = installFetch([{
    status: 200,
    body: {
      ...pulse,
      type: "certscore_pulse_evidence",
      findings: Array.from({ length: 90 }, (_, index) => ({
        id: `finding_${index}`,
        evidence: {
          summary: "x".repeat(2_000),
          exampleEvents: Array.from({ length: 8 }, () => ({ payload: "y".repeat(1_000) }))
        }
      }))
    }
  }]);
  try {
    await withMcpClient(async (client) => {
      const result = await client.callTool({ name: "certscore_get_evidence", arguments: { scanId: "scan_123" } });
      const evidence = parseToolJson(result);
      const metadata = evidence.mcpMetadata as Record<string, unknown>;
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";

      assert.equal(evidence.type, "certscore_pulse_evidence");
      assert.equal(evidence.scanId, "scan_123");
      assert.equal(metadata.truncated, true);
      assert.ok(text.length <= 250_000);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_export_findings uses full Pulse detail and certscore_explain_finding uses API v2 finding detail", async () => {
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
      const exported = parseToolJson(await client.callTool({ name: "certscore_export_findings", arguments: { scanId: "scan_123" } }));
      assert.equal(exported.type, "certscore_mcp_findings_export");
      assert.equal((exported.findings as unknown[]).length, 1);

      const explanation = parseToolJson(
        await client.callTool({
          name: "certscore_explain_finding",
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

test("API v2 MCP tools return scan timing, findings, and latest domain resources", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan",
        scanId: "scan_123",
        domain: "example.com",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:00:05.100Z",
        scanTimeSeconds: 5.1
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_finding_list",
        scanId: "scan_123",
        findings: Array.from({ length: 3 }, (_, index) => apiFinding(`finding_${index + 1}`))
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_pre_consent_cookies_trackers",
        scanId: "scan_123",
        domain: "example.com",
        summary: { rowCount: 3, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: Array.from({ length: 3 }, (_, index) => preConsentRow(`row_${index + 1}`))
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
        summary: { rowCount: 3, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: Array.from({ length: 3 }, (_, index) => preConsentRow(`latest_row_${index + 1}`))
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const scan = parseToolJson(await client.callTool({ name: "certscore_get_scan", arguments: { scanId: "scan_123" } }));
      const findings = parseToolJson(await client.callTool({ name: "certscore_list_findings", arguments: { scanId: "scan_123", limit: 1, offset: 1 } }));
      const inventory = parseToolJson(await client.callTool({ name: "certscore_get_pre_consent_cookies_trackers", arguments: { scanId: "scan_123", maxRows: 2 } }));
      const latest = parseToolJson(
        await client.callTool({ name: "certscore_get_latest_domain_scan", arguments: { domain: "example.com", scanFrom: "eu_ie" } })
      );
      const latestInventory = parseToolJson(
        await client.callTool({ name: "certscore_get_latest_domain_pre_consent_cookies_trackers", arguments: { domain: "example.com", scanFrom: "eu_ie", maxRows: 1 } })
      );

      assert.equal(scan.type, "certscore_scan");
      assert.equal(scan.startedAt, "2026-07-08T12:00:00.000Z");
      assert.equal(scan.completedAt, "2026-07-08T12:00:05.100Z");
      assert.equal(scan.scanTimeSeconds, 5.1);
      assert.equal(findings.type, "certscore_finding_list");
      assert.deepEqual((findings.findings as Array<{ id: string }>).map((finding) => finding.id), ["finding_2"]);
      assert.deepEqual(findings.pagination, {
        limit: 1,
        offset: 1,
        returned: 1,
        total: 3,
        truncated: true
      });
      assert.equal(inventory.type, "certscore_pre_consent_cookies_trackers");
      assert.equal((inventory.rows as unknown[]).length, 2);
      assert.equal(
        (((inventory.rows as Array<Record<string, unknown>>)[0]?.requestDetails as Array<Record<string, unknown>>)[0]?.method),
        "POST"
      );
      assert.equal((inventory.summary as Record<string, unknown>).truncated, true);
      assert.equal((inventory.summary as Record<string, unknown>).totalRowCount, 3);
      assert.equal(latest.type, "certscore_domain_latest_scan");
      assert.equal(latestInventory.type, "certscore_pre_consent_cookies_trackers");
      assert.equal((latestInventory.rows as unknown[]).length, 1);
      assert.equal((latestInventory.summary as Record<string, unknown>).truncated, true);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/scan_123$/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123\/findings$/);
      assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/scan_123\/pre-consent-cookies-trackers$/);
      assert.match(mock.calls[3] ?? "", /\/api\/v2\/domains\/example.com\/latest\?scanFrom=eu_ie$/);
      assert.match(mock.calls[4] ?? "", /\/api\/v2\/domains\/example.com\/latest\/pre-consent-cookies-trackers\?scanFrom=eu_ie$/);
    });
  } finally {
    mock.restore();
  }
});

test("tool errors are returned as machine-readable JSON without invalid success-shaped structured content", async () => {
  const mock = installFetch([
    {
      status: 400,
      body: { type: "certscore_pulse_error", error: { code: "invalid_url", message: "Enter a valid public URL or domain." } }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({ name: "certscore_scan_site", arguments: { url: "::::", waitForCompletion: false } });
      const result = parseToolJson(raw);
      const error = result.error as Record<string, unknown>;
      assert.equal(error.name, "InvalidUrlError");
      assert.equal(error.code, "invalid_url");
      assert.equal(error.retryable, false);
      assert.equal(error.retryAfterSeconds, null);
      assert.equal(typeof error.recommendedNextAction, "string");
      assert.equal(raw.isError, true);
      assert.equal(raw.structuredContent, undefined);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan returns an MCP error while a scan resource is not ready", async () => {
  const mock = installFetch([
    {
      status: 409,
      body: { type: "certscore_api_error", error: { code: "scan_not_ready", message: "The scan is still running." } }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({ name: "certscore_get_scan", arguments: { scanId: "scan_running" } });
      const result = parseToolJson(raw);
      assert.equal(raw.isError, true);
      assert.equal(raw.structuredContent, undefined);
      assert.equal((result.error as Record<string, unknown>).code, "scan_not_ready");
      assert.equal((result.error as Record<string, unknown>).retryable, false);
      assert.equal(typeof (result.error as Record<string, unknown>).recommendedNextAction, "string");
    });
  } finally {
    mock.restore();
  }
});
