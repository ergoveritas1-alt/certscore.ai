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
  const requestHeaders: Headers[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
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
        "create_scan",
        "explain_finding",
        "export_findings",
        "get_evidence",
        "get_latest_domain_pre_consent_cookies_trackers",
        "get_latest_domain_scan",
        "get_pre_consent_cookies_trackers",
        "get_report",
        "get_scan",
        "get_scan_bundle",
        "get_scan_status",
        "list_findings",
        "scan_site"
      ]
    );
  });
});

test("CertScore Light exposes only the focused no-account workflow", async () => {
  await withMcpClient(async (client) => {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["get_scan_bundle", "get_scan_status", "scan_site"]
    );
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
    "scan_site",
    "create_scan",
    "get_scan",
    "get_scan_status",
    "get_report",
    "get_evidence",
    "get_scan_bundle",
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
    },
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
  const previousConsoleError = console.error;
  const warnings: string[] = [];
  console.error = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
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
      await client.callTool({
        name: "create_scan",
        arguments: { url: "https://example.com", detail: "standard" }
      });
    });
    assert.deepEqual(warnings, ["[certscore-mcp] create_scan is deprecated in the 0.2.x line. Use scan_site for new integrations."]);
    assert.equal(mock.requestHeaders[0]?.get("x-certscore-client"), "mcp");
  } finally {
    console.error = previousConsoleError;
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

test("scan_site can return immediately for an explicitly asynchronous workflow", async () => {
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

test("scan_site waits by default and returns the completed scan resource", async () => {
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
        name: "scan_site",
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

test("get_scan_status supports API v2 scanId status with timing fields", async () => {
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
          name: "get_scan_status",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
        })
      );
      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.scanId, "00000000-0000-4000-8000-000000000123");
      assert.equal(result.startedAt, "2026-07-08T12:00:00.000Z");
      assert.equal(result.completedAt, "2026-07-08T12:00:34.000Z");
      assert.equal(result.scanTimeSeconds, 34);
      assert.equal(mock.calls.length, 2);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/status/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123$/);
    });
  } finally {
    mock.restore();
  }
});

test("get_scan_status hydrates terminal API v2 status with completed-limited no-go details", async () => {
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
      const result = parseToolJson(await client.callTool({ name: "get_scan_status", arguments: { scanId: "scan_123" } }));
      assert.equal(result.status, "completed_limited");
      assert.equal(result.resultDisposition, "no_go");
      assert.equal((result.noGo as Record<string, unknown>).reasonCode, "parked_or_placeholder");
      assert.equal(result.scanTimeSeconds, 3);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/scan_123\/status$/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/scan_123$/);
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

test("get_evidence retrieves the bounded Evidence JSON artifact", async () => {
  const mock = installFetch([{ status: 200, body: { ...pulse, type: "certscore_pulse_evidence" } }]);
  try {
    await withMcpClient(async (client) => {
      const evidence = parseToolJson(await client.callTool({ name: "get_evidence", arguments: { scanId: "scan_123" } }));
      assert.equal(evidence.type, "certscore_pulse_evidence");
      assert.match(mock.calls[0] ?? "", /scanId=scan_123/);
      assert.match(mock.calls[0] ?? "", /detail=evidence/);
    });
  } finally {
    mock.restore();
  }
});

test("get_scan_bundle returns the compact full review in one MCP call", async () => {
  const scan = {
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    status: "completed",
    score: 72,
    coverage: { status: "partial" },
    links: { self: "https://certscore.ai/api/v2/scans/scan_123" },
    disclaimer: "Automated public-web observations for review."
  };
  const mock = installFetch([
    { status: 200, body: scan },
    { status: 200, body: { ...pulse, type: "certscore_pulse_summary", executiveSummary: { issuesToReview: 1 }, counts: { totalAutomatedFindingCount: 1 } } },
    { status: 200, body: { ...pulse, type: "certscore_pulse_evidence", evidenceSafetyNotes: ["Public-safe evidence only."], projectedFindings: pulse.findings } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "scan_123", findings: [apiFinding("finding_1")] } },
    { status: 200, body: { type: "certscore_pre_consent_cookies_trackers", scanId: "scan_123", domain: "example.com", summary: { rowCount: 1, trackerCount: 1, cookieCount: 0, requestCount: 1 }, rows: [preConsentRow("row_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const bundle = parseToolJson(await client.callTool({ name: "get_scan_bundle", arguments: { scanId: "scan_123" } }));
      assert.equal(bundle.type, "certscore_scan_bundle");
      assert.equal(bundle.scanId, "scan_123");
      assert.equal(bundle.status, "completed");
      assert.equal((bundle.findings as unknown[]).length, 1);
      assert.equal(((bundle.preConsentCookiesTrackers as Record<string, unknown>).rows as unknown[]).length, 1);
      assert.equal(mock.calls.length, 5);
    });
  } finally {
    mock.restore();
  }
});

test("get_evidence bounds oversized Evidence JSON artifacts", async () => {
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
      const result = await client.callTool({ name: "get_evidence", arguments: { scanId: "scan_123" } });
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
      const scan = parseToolJson(await client.callTool({ name: "get_scan", arguments: { scanId: "scan_123" } }));
      const findings = parseToolJson(await client.callTool({ name: "list_findings", arguments: { scanId: "scan_123", limit: 1, offset: 1 } }));
      const inventory = parseToolJson(await client.callTool({ name: "get_pre_consent_cookies_trackers", arguments: { scanId: "scan_123", maxRows: 2 } }));
      const latest = parseToolJson(
        await client.callTool({ name: "get_latest_domain_scan", arguments: { domain: "example.com", scanFrom: "eu_ie" } })
      );
      const latestInventory = parseToolJson(
        await client.callTool({ name: "get_latest_domain_pre_consent_cookies_trackers", arguments: { domain: "example.com", scanFrom: "eu_ie", maxRows: 1 } })
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

test("tool errors are returned as structured JSON", async () => {
  const mock = installFetch([
    {
      status: 400,
      body: { type: "certscore_pulse_error", error: { code: "invalid_url", message: "Enter a valid public URL or domain." } }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({ name: "create_scan", arguments: { url: "::::" } });
      const result = parseToolJson(raw);
      const error = result.error as Record<string, unknown>;
      assert.equal(error.name, "InvalidUrlError");
      assert.equal(error.code, "invalid_url");
      assert.equal(raw.isError, true);
      assert.equal(raw.structuredContent, undefined);
    });
  } finally {
    mock.restore();
  }
});

test("get_scan returns an MCP error while a scan resource is not ready", async () => {
  const mock = installFetch([
    {
      status: 409,
      body: { type: "certscore_api_error", error: { code: "scan_not_ready", message: "The scan is still running." } }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({ name: "get_scan", arguments: { scanId: "scan_running" } });
      const result = parseToolJson(raw);
      assert.equal(raw.isError, true);
      assert.equal(raw.structuredContent, undefined);
      assert.equal((result.error as Record<string, unknown>).code, "scan_not_ready");
    });
  } finally {
    mock.restore();
  }
});
