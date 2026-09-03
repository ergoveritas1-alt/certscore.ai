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

function assertToolOutputSchema(name: (typeof certScoreMcpToolContracts)[number]["name"], payload: Record<string, unknown>) {
  const contract = certScoreMcpToolContracts.find((candidate) => candidate.name === name);
  assert.ok(contract);
  assert.doesNotThrow(() => (contract.outputSchema as any).parse(payload));
}

const pulse = {
  type: "certscore_pulse",
  scanId: "00000000-0000-4000-8000-000000000123",
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
        fullEvidenceUrl: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123#finding-pre_consent_tracking_detected"
      },
      evidenceDigest: { basis: "runtime_observation", hasTimingAnchor: true },
      reviewLenses: ["GDPR / ePrivacy"],
      nextStep: "Review whether the vendor should be consent-gated."
    }
  ],
  topFindings: [],
  coverage: { limitations: ["Automated public-web scan only."] },
  disclaimer: "Automated public-web observations for human and agentic review."
} as const;

function apiFinding(id: string) {
  return {
    type: "certscore_finding",
    id,
    scanId: "00000000-0000-4000-8000-000000000123",
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
    disclaimer: "Automated public-web observations for human and agentic review."
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
    category: "Analytics",
    purpose: "Audience measurement",
    priority: "high",
    confidence: "high",
    party: "third_party",
    domains: ["analytics.example.test", "collect.example.test"],
    cookieDetails: [{
      name: "analytics_id",
      domain: "example.test",
      category: "analytics",
      essentiality: "non_essential",
      essentialityConfidence: 0.98,
      essentialityReasonCodes: ["canonical_registry"],
      essentialitySource: "canonical_registry",
      description: "Analytics identifier.",
      dataTypes: ["identifier"],
      expiresAt: null,
      lifespanSeconds: null,
      lifespanSource: null,
      longLived: false,
      setByThirdPartyScript: true,
      set_by_third_party_script: true,
      setterScriptUrl: "https://analytics.example.test/app.js",
      initiatorChain: ["https://example.com/app.js"]
    }],
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
    assert.deepEqual(scanSiteTool?.annotations, {
      title: "Scan site",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    });
    assert.ok(scanSiteTool?.outputSchema?.required?.includes("error"));
    assert.ok(scanSiteTool?.outputSchema?.required?.includes("recommendedNextAction"));
    assert.match(scanSiteTool?.description ?? "", /Creates a public-website privacy scan or reuses an eligible recent completed scan/);
    assert.match(scanSiteTool?.description ?? "", /preConsentPreview/);
    assert.match(scanSiteTool?.description ?? "", /preliminary data contains no final findings or score/i);
    assert.match(scanSiteTool?.description ?? "", /https:\/\/certscore\.ai\/developers\/mcp/);
    assert.match((scanSiteTool?.inputSchema.properties?.waitForCompletion as { description?: string })?.description ?? "", /Deprecated compatibility field; accepted but ignored/);
    assert.match((scanSiteTool?.inputSchema.properties?.maxWaitSeconds as { description?: string })?.description ?? "", /Deprecated compatibility field; accepted but ignored/);
    const freshnessSchema = scanSiteTool?.inputSchema.properties?.freshness as { description?: string; enum?: string[] } | undefined;
    assert.deepEqual(freshnessSchema?.enum, ["latest", "refresh"]);
    assert.equal(
      freshnessSchema?.description,
      "Scan freshness policy. latest allows eligible recent completed-result reuse when available; refresh requests a new scan. Defaults to latest."
    );
    const scanFromSchema = scanSiteTool?.inputSchema.properties?.scanFrom as { description?: string; enum?: string[] } | undefined;
    assert.deepEqual(scanFromSchema?.enum, ["eu_de", "eu_ie", "california"]);
    assert.equal(
      scanFromSchema?.description,
      "Optional execution region for a newly queued scan: eu_de, eu_ie, california, or the service default when omitted."
    );
    const statusTool = tools.tools.find((tool) => tool.name === "certscore_get_scan_status");
    assert.deepEqual(statusTool?.annotations, {
      title: "Get scan status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    assert.deepEqual(statusTool?.inputSchema.required, ["scanId"]);
    assert.equal(statusTool?.inputSchema.additionalProperties, false);
    assert.ok(statusTool?.outputSchema?.required?.includes("error"));
    assert.ok(statusTool?.outputSchema?.required?.includes("recommendedNextAction"));
    assert.match(statusTool?.description ?? "", /Returns lifecycle status for a stable CertScore scanId/);
    assert.match(statusTool?.description ?? "", /persisted execution region and timestamps/);
    assert.match(statusTool?.description ?? "", /Preliminary observations are distinct from completed findings/);
    const bundleTool = tools.tools.find((tool) => tool.name === "certscore_get_scan_bundle");
    assert.deepEqual(bundleTool?.annotations, {
      title: "Get scan bundle",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    });
    assert.equal(bundleTool?.inputSchema.additionalProperties, false);
    assert.deepEqual((bundleTool?.inputSchema.properties?.detail as { enum?: string[] })?.enum, ["summary", "findings", "evidence", "full"]);
    assert.equal((bundleTool?.inputSchema.properties?.maxBytes as { minimum?: number })?.minimum, 5_000);
    assert.match((bundleTool?.inputSchema.properties?.maxBytes as { description?: string })?.description ?? "", /Light.*25000-byte ceiling/i);
    assert.ok(bundleTool?.outputSchema?.required?.includes("detail"));
    assert.ok(bundleTool?.outputSchema?.required?.includes("error"));
    assert.ok(bundleTool?.outputSchema?.required?.includes("provenance"));
    assert.ok(bundleTool?.outputSchema?.required?.includes("scoreLabel"));
    assert.ok(bundleTool?.outputSchema?.required?.includes("interpretationGuidance"));
    assert.ok(bundleTool?.outputSchema?.required?.includes("scanFrom"));
    assert.match(bundleTool?.description ?? "", /Returns the completed or completed-limited CertScore evidence bundle/);
    assert.match(bundleTool?.description ?? "", /persisted execution provenance/);
    assert.match(bundleTool?.description ?? "", /Accept and Reject Path content is present only for confirmed, evidence-qualified post-action observations/i);
    assert.match(bundleTool?.description ?? "", /not legal advice, certification, or a compliance determination/i);
    for (const tool of [scanSiteTool, statusTool, bundleTool]) {
      assert.doesNotMatch(tool?.description ?? "", /\b(?:never|must|should|do not|call|wait|continue polling|stop polling)\b/i);
      assert.doesNotMatch(tool?.description ?? "", /certscore_(?:scan_site|get_scan_status|get_scan_bundle)/);
    }
    const inventorySchema = bundleTool?.outputSchema?.properties?.preConsentCookiesTrackers as {
      properties?: { rows?: { items?: { properties?: Record<string, unknown> } }; returned?: unknown; total?: unknown; truncated?: unknown };
    } | undefined;
    assert.ok(inventorySchema?.properties?.rows?.items?.properties?.cookieNames);
    assert.ok(inventorySchema?.properties?.rows?.items?.properties?.evidenceClassification);
    assert.ok(inventorySchema?.properties?.total);
    assert.ok(inventorySchema?.properties?.returned);
    assert.ok(inventorySchema?.properties?.truncated);
    const metadataSchema = bundleTool?.outputSchema?.properties?.mcpMetadata as { required?: string[] } | undefined;
    for (const field of ["requestedMaxBytes", "effectiveMaxBytes", "responseCeilingBytes", "responseBudgetClamped", "actualBytes", "truncated", "canonicalFindingsComplete", "truncationReason", "omittedSections", "nextRecommendedMaxBytes", "omittedContentAvailableViaUrl", "contentUrls"]) {
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
  assert.match(readme, /automated public-web observations for human and agentic review/i);
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

test("Light registry metadata and distribution copy stay aligned", () => {
  const manifest = JSON.parse(readFileSync(new URL("../server-light.json", import.meta.url), "utf8")) as {
    description?: string;
    icons?: Array<{ mimeType?: string; sizes?: string[]; src?: string }>;
    name?: string;
    remotes?: Array<{ type?: string; url?: string }>;
    repository?: { subfolder?: string; url?: string };
    title?: string;
    version?: string;
    websiteUrl?: string;
  };
  const install = readFileSync(new URL("../../../docs/mcp-light-install.md", import.meta.url), "utf8");
  const marketplace = readFileSync(new URL("../../../docs/mcp-light-marketplace-assets.md", import.meta.url), "utf8");
  const submissions = readFileSync(new URL("../../../docs/mcp-light-directory-submissions.md", import.meta.url), "utf8");
  const packets = readFileSync(new URL("../../../docs/mcp-light-submission-packets.md", import.meta.url), "utf8");
  const agentInstall = readFileSync(new URL("../../../llms-install.md", import.meta.url), "utf8");
  const publicCopy = [install, marketplace, submissions, packets, agentInstall];

  assert.equal(manifest.name, "ai.certscore/mcp-light");
  assert.equal(manifest.title, "CertScore.ai MCP Light");
  assert.equal(manifest.version, CERTSCORE_MCP_VERSION);
  assert.equal(manifest.websiteUrl, "https://certscore.ai/mcp/light");
  assert.deepEqual(manifest.remotes, [{ type: "streamable-http", url: "https://mcp.certscore.ai/mcp/light" }]);
  assert.equal(manifest.repository?.url, "https://github.com/ergoveritas1-alt/certscore.ai");
  assert.equal(manifest.repository?.subfolder, "packages/certscore-mcp");
  assert.deepEqual(manifest.icons, [
    {
      src: "https://certscore.ai/certscore-mark-dark.png",
      mimeType: "image/png",
      sizes: ["512x512"],
      theme: "light"
    },
    {
      src: "https://certscore.ai/certscore-mark-light.png",
      mimeType: "image/png",
      sizes: ["512x512"],
      theme: "dark"
    }
  ]);
  assert.match(manifest.description ?? "", /^Free website privacy scanner/);

  for (const source of publicCopy) {
    assert.match(source, /CertScore\.ai MCP Light/);
    assert.match(source, /ai\.certscore\/mcp-light/);
    assert.match(source, /https:\/\/mcp\.certscore\.ai\/mcp\/light/);
    assert.match(source, /Streamable HTTP/);
    assert.match(source, /Authentication: none|Authentication \| None/i);
    assert.match(source, /50 genuinely new scans per UTC day/);
    assert.match(source, /5-new-scan rolling 10-minute/);
    assert.match(source, /does not consume (?:the )?new-scan allowance|reuse does not consume (?:the )?(?:new-scan allowance|quota)/i);
    assert.match(source, /certscore_scan_site/);
    assert.match(source, /certscore_get_scan_status/);
    assert.match(source, /certscore_get_scan_bundle/);
    assert.match(source, /not legal advice, certification, or a compliance determination/i);
  }

  for (const source of [submissions, packets]) {
    assert.match(source, /Official MCP Registry/);
    assert.match(source, /version `0\.2\.18` is the prepared active release/i);
    assert.match(source, /ai\.certscore\/mcp-light/i);
    assert.match(source, /https:\/\/registry\.modelcontextprotocol\.io\/\?q=ai\.certscore%2Fmcp-light/);
  }
});

test("marketplace and public icon PNGs use the canonical faceted CertScore mark", () => {
  const icon = readFileSync(new URL("../../../apps/web/public/images/mcp-directory/certscore-mcp-light-cline-400.png", import.meta.url));
  const canonical256 = readFileSync(new URL("../../../certscore_logo_assets/certscore_logo_256.png", import.meta.url));
  const canonical512 = readFileSync(new URL("../../../certscore_logo_assets/certscore_logo_512.png", import.meta.url));
  const favicon = readFileSync(new URL("../../../apps/web/public/favicon.png", import.meta.url));
  const markDark = readFileSync(new URL("../../../apps/web/public/certscore-mark-dark.png", import.meta.url));
  const markLight = readFileSync(new URL("../../../apps/web/public/certscore-mark-light.png", import.meta.url));
  const header = readFileSync(new URL("../../../apps/web/public/certscore-header-logo.png", import.meta.url));

  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(icon.readUInt32BE(16), 400);
  assert.equal(icon.readUInt32BE(20), 400);
  assert.deepEqual(favicon, canonical256);
  assert.deepEqual(markDark, canonical512);
  assert.deepEqual(markLight, canonical512);
  assert.deepEqual(header, canonical512);
});

test("Cline and Kilo submission assets use their explicit Streamable HTTP schemas", () => {
  const agentInstall = readFileSync(new URL("../../../llms-install.md", import.meta.url), "utf8");
  const kilo = readFileSync(new URL("../../../integrations/kilo-code/certscore-mcp-light/MCP.yaml", import.meta.url), "utf8");

  assert.match(agentInstall, /"type": "streamableHttp"/);
  assert.match(agentInstall, /"autoApprove": \[\]/);
  assert.match(agentInstall, /"type": "remote"/);
  assert.match(kilo, /^id: certscore-mcp-light$/m);
  assert.match(kilo, /^name: CertScore\.ai MCP Light$/m);
  assert.match(kilo, /^category: web-automation$/m);
  assert.match(kilo, /"type": "streamable-http"/);
  assert.match(kilo, /"url": "https:\/\/mcp\.certscore\.ai\/mcp\/light"/);
  assert.doesNotMatch(kilo, /Authorization|API_KEY|token|secret/i);
});

test("Claude Code Light plugin preserves the remote three-tool workflow", () => {
  const plugin = JSON.parse(readFileSync(new URL("../../../integrations/claude-code/certscore-mcp-light/.claude-plugin/plugin.json", import.meta.url), "utf8")) as {
    name?: string;
    version?: string;
  };
  const mcp = JSON.parse(readFileSync(new URL("../../../integrations/claude-code/certscore-mcp-light/.mcp.json", import.meta.url), "utf8")) as {
    mcpServers?: Record<string, { type?: string; url?: string }>;
  };
  const skill = readFileSync(new URL("../../../integrations/claude-code/certscore-mcp-light/skills/privacy-scan/SKILL.md", import.meta.url), "utf8");
  const marketplace = JSON.parse(readFileSync(new URL("../../../.claude-plugin/marketplace.json", import.meta.url), "utf8")) as {
    plugins?: Array<{ name?: string; source?: string }>;
  };

  assert.equal(plugin.name, "certscore-mcp-light");
  assert.equal(plugin.version, CERTSCORE_MCP_VERSION);
  assert.deepEqual(mcp.mcpServers, {
    certscore: { type: "http", url: "https://mcp.certscore.ai/mcp/light" }
  });
  assert.deepEqual(marketplace.plugins?.map(({ name, source }) => ({ name, source })), [{
    name: "certscore-mcp-light",
    source: "./integrations/claude-code/certscore-mcp-light"
  }]);
  for (const tool of ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]) {
    assert.match(skill, new RegExp(tool));
  }
  assert.match(skill, /queued.*running.*finalizing/s);
  assert.match(skill, /completed.*completed_limited.*failed.*expired.*rate_limited/s);
  assert.match(skill, /not legal advice, certification, or a compliance determination/i);
  assert.doesNotMatch(skill, /hook|autonomous/i);
});

test("Cursor and OpenAI plugin packages preserve independent release versions and the Light workflow", () => {
  const cursorPlugin = JSON.parse(readFileSync(new URL("../../../integrations/cursor/certscore-website-privacy-preflight/plugin.json", import.meta.url), "utf8")) as {
    author?: { name?: string };
    license?: string;
    name?: string;
    version?: string;
  };
  const cursorMcp = JSON.parse(readFileSync(new URL("../../../integrations/cursor/certscore-website-privacy-preflight/mcp.json", import.meta.url), "utf8")) as {
    mcpServers?: Record<string, { type?: string; url?: string }>;
  };
  const cursorMarketplace = JSON.parse(readFileSync(new URL("../../../.cursor-plugin/marketplace.json", import.meta.url), "utf8")) as {
    owner?: { name?: string };
    plugins?: Array<{ author?: { name?: string }; license?: string; name?: string; source?: string; version?: string }>;
  };
  const cursorLicense = readFileSync(new URL("../../../integrations/cursor/certscore-website-privacy-preflight/LICENSE", import.meta.url), "utf8");
  const cursorReadme = readFileSync(new URL("../../../integrations/cursor/certscore-website-privacy-preflight/README.md", import.meta.url), "utf8");
  const cursorSkill = readFileSync(new URL("../../../integrations/cursor/certscore-website-privacy-preflight/skills/website-privacy-preflight/SKILL.md", import.meta.url), "utf8");
  const openAiPlugin = JSON.parse(readFileSync(new URL("../../../integrations/openai/certscore-website-privacy-preflight/.codex-plugin/plugin.json", import.meta.url), "utf8")) as {
    description?: string;
    interface?: {
      defaultPrompt?: string[];
      longDescription?: string;
      shortDescription?: string;
    };
    mcpServers?: string;
    name?: string;
    skills?: string;
    version?: string;
  };
  const openAiMcp = JSON.parse(readFileSync(new URL("../../../integrations/openai/certscore-website-privacy-preflight/.mcp.json", import.meta.url), "utf8")) as {
    mcpServers?: Record<string, { type?: string; url?: string }>;
  };
  const openAiSkill = readFileSync(new URL("../../../integrations/openai/certscore-website-privacy-preflight/skills/website-privacy-preflight/SKILL.md", import.meta.url), "utf8");
  const openAiMetadata = readFileSync(new URL("../../../integrations/openai/certscore-website-privacy-preflight/skills/website-privacy-preflight/agents/openai.yaml", import.meta.url), "utf8");
  const openAiSubmissionPacket = readFileSync(new URL("../../../docs/mcp-light-submission-packets.md", import.meta.url), "utf8");

  assert.equal(cursorPlugin.name, "certscore-website-privacy-preflight");
  assert.equal(cursorPlugin.version, "1.0.3");
  assert.match(JSON.stringify(cursorPlugin), /GPC/i);
  assert.match(JSON.stringify(cursorPlugin), /Accept Path/i);
  assert.match(JSON.stringify(cursorPlugin), /Reject Path/i);
  assert.equal(cursorPlugin.license, "Apache-2.0");
  assert.equal(cursorMarketplace.plugins?.[0]?.license, "Apache-2.0");
  assert.match(cursorLicense, /Apache License\s+Version 2\.0, January 2004/);
  assert.equal(cursorPlugin.author?.name, "CertScore.ai, LLC");
  assert.equal(cursorMarketplace.owner?.name, "CertScore.ai, LLC");
  assert.equal(cursorMarketplace.plugins?.[0]?.author?.name, "CertScore.ai, LLC");
  assert.match(cursorLicense, /Copyright 2026 CertScore\.ai, LLC/);
  assert.match(cursorReadme, /license applies only to the files in `integrations\/cursor\/certscore-website-privacy-preflight`/);
  assert.match(cursorReadme, /trademarks.*other repository components remain governed by their respective licenses and terms/is);
  assert.match(cursorSkill, /gpcResponse/);
  assert.match(cursorSkill, /postAcceptObservation/);
  assert.match(cursorSkill, /postRefusalObservation/);
  assert.match(cursorSkill, /score-neutral behavior baseline/);
  assert.match(cursorSkill, /limited coverage rather than a pass/);
  assert.deepEqual(cursorMcp.mcpServers, {
    "CertScore.ai": { type: "streamable-http", url: "https://mcp.certscore.ai/mcp/light" }
  });
  assert.deepEqual(cursorMarketplace.plugins?.map(({ name, source, version }) => ({ name, source, version })), [{
    name: "certscore-website-privacy-preflight",
    source: "integrations/cursor/certscore-website-privacy-preflight",
    version: "1.0.3"
  }]);

  assert.equal(openAiPlugin.name, "certscore-website-privacy-preflight");
  assert.equal(openAiPlugin.version, "2.0.0");
  assert.equal(openAiPlugin.skills, "./skills/");
  assert.equal(openAiPlugin.mcpServers, "./.mcp.json");
  assert.deepEqual(openAiMcp.mcpServers, {
    certscore: { type: "http", url: "https://mcp.certscore.ai/mcp/light" }
  });
  assert.match(openAiMetadata, /transport: "streamable_http"/);
  assert.match(openAiMetadata, /url: "https:\/\/mcp\.certscore\.ai\/mcp\/light"/);
  assert.match(JSON.stringify(openAiPlugin), /GPC/i);
  assert.match(JSON.stringify(openAiPlugin), /Accept/i);
  assert.match(JSON.stringify(openAiPlugin), /Reject/i);
  assert.match(openAiMetadata, /GPC/i);
  assert.match(openAiMetadata, /Accept/i);
  assert.match(openAiMetadata, /Reject/i);
  assert.match(openAiSkill, /gpcResponse/);
  assert.match(openAiSkill, /postAcceptObservation/);
  assert.match(openAiSkill, /postRefusalObservation/);
  assert.match(openAiSkill, /score-neutral behavior baseline/i);
  assert.match(openAiSkill, /non-confirmed observation status as limited coverage rather than a pass/i);
  assert.match(openAiSkill, /Do not independently browse the target or click its consent controls/i);
  assert.match(JSON.stringify(openAiPlugin), /preliminary cookie\/tracker/i);
  assert.match(openAiMetadata, /preliminary cookie and tracker evidence/i);
  assert.match(openAiSkill, /preConsentPreview/);
  assert.match(openAiSkill, /trackingVendorCount/);
  assert.match(openAiSkill, /operationalVendors/);
  assert.match(openAiSkill, /Never present preview counts as final totals/i);
  assert.deepEqual(openAiPlugin.interface?.defaultPrompt?.map((prompt) => new URL((prompt.match(/https:\/\/[^\s]+/)?.[0] ?? "").replace(/[.,]$/, "")).pathname), [
    "/test1.html",
    "/test2.html",
    "/test3.html"
  ]);
  for (const path of ["test1.html", "test2.html", "test3.html", "test4.html"]) {
    assert.match(openAiSubmissionPacket, new RegExp(`https://ergoveritas\\.com/${path.replaceAll(".", "\\.")}`));
  }
  assert.match(openAiSubmissionPacket, /Tool annotation justifications/);
  assert.match(openAiSubmissionPacket, /at most one bounded deterministic Accept action and one bounded deterministic Reject/i);
  assert.match(openAiSubmissionPacket, /passive `Sec-GPC: 1` comparison/i);
  assert.match(openAiSubmissionPacket, /OpenAI review correction completed September 3, 2026/i);
  assert.doesNotMatch(openAiSubmissionPacket, /cannot accept consent/i);
  assert.doesNotMatch(openAiSkill, /Claude|Cursor/);
  for (const tool of ["certscore_scan_site", "certscore_get_scan_status", "certscore_get_scan_bundle"]) {
    assert.match(openAiSkill, new RegExp(tool));
  }
  assert.match(openAiSkill, /not legal advice, certification, or a compliance determination/i);
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

test("certscore_scan_site returns a newly accepted scan immediately by default", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_scan_job",
        status: "queued",
        jobId: "pulse_job_123",
        scanId: "00000000-0000-4000-8000-000000000123",
        executionMode: "new_scan",
        reused: false,
        freshnessDecision: "refresh_requested_new_scan"
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({
          name: "certscore_scan_site",
          arguments: { url: "https://example.com", freshness: "refresh", scanFrom: "eu_ie" }
        });
      const result = parseToolJson(raw);
      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.status, "queued");
      assert.equal(result.reportUrl, null);
      assert.equal((result.provenance as Record<string, unknown>).mode, "new_scan_started");
      assert.equal((result.provenance as Record<string, unknown>).retrievalMode, "creation_response");
      assert.equal((result.provenance as Record<string, unknown>).creationDecision, "new_scan");
      assert.match(raw.content[0]?.type === "text" ? raw.content[0].text : "", /retrieval=creation_response; creation=new_scan/);
      assert.doesNotMatch(raw.content[0]?.type === "text" ? raw.content[0].text : "", /full report=/);
      assert.equal(result.recommendedNextTool, "certscore_get_scan_status");
      assert.match(String(result.recommendedNextAction), /Do not poll in parallel or resubmit certscore_scan_site/);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans$/);
      assert.equal(mock.calls.length, 1);
    });
  } finally {
    mock.restore();
  }
});

test("MCP Light certscore_scan_site returns a verified preliminary preview within its bounded initial wait", async () => {
  const scanId = "00000000-0000-4000-8000-000000000223";
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_scan_job",
        status: "queued",
        jobId: scanId,
        scanId,
        executionMode: "new_scan",
        reused: false,
        freshnessDecision: "no_eligible_recent_scan_queued",
      },
    },
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        status: "running",
        jobId: scanId,
        scanId,
        retryAfterSeconds: 1,
        preConsentPreview: {
          type: "certscore_pre_consent_preview",
          resultStage: "preliminary",
          final: false,
          sourceLane: "runtime_evidence",
          generatedAt: "2026-08-29T04:00:03.000Z",
          runtimeCoverage: { status: "usable", limitationKeys: [] },
          summary: {
            cookieCount: 1,
            returnedCookieCount: 1,
            trackerCount: 1,
            trackingVendorCount: 1,
            returnedTrackingVendorCount: 1,
            operationalVendorCount: 0,
            returnedOperationalVendorCount: 0,
            thirdPartyRequestCount: 3,
            vendorCount: 1,
          },
          cookies: [{
            name: "_ga",
            domain: "example.com",
            party: "first_party",
            purpose: "analytics",
            essentiality: "non_essential",
            observedAtMs: 1200,
          }],
          trackers: [{
            vendor: "Example Analytics",
            product: "Example Analytics Pixel",
            purpose: "analytics",
            confidence: 0.95,
            domains: ["analytics.example.test"],
          }],
          operationalVendors: [],
          truncated: { cookies: false, trackers: false, operationalVendors: false },
          mustContinuePolling: true,
          observationOnlyDisclaimer: "Preliminary passive runtime observations only. Continue polling.",
        },
      },
    },
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://example.com" },
      });
      const result = parseToolJson(raw);
      const preview = result.preConsentPreview as Record<string, any>;
      assert.equal(result.scanId, scanId);
      assert.equal(result.status, "running");
      assert.equal(result.retryAfterSeconds, 15);
      assert.equal(preview.final, false);
      assert.equal(preview.summary.cookieCount, 1);
      assert.equal(preview.summary.trackerCount, 1);
      assert.equal(preview.summary.trackingVendorCount, 1);
      assert.equal(preview.summary.returnedTrackingVendorCount, 1);
      assert.equal(preview.mustContinuePolling, true);
      assert.equal(result.recommendedNextTool, "certscore_get_scan_status");
      assert.match(String(result.recommendedNextAction), /preConsentPreview is a partial preview of passive evidence/i);
      const text = raw.content[0]?.type === "text" ? raw.content[0].text : "";
      assert.match(text, /partial pre-consent runtime preview/i);
      assert.match(text, /PARTIAL PREVIEW: These are checkpoint-only partial counts, not the full scan tally/i);
      assert.match(text, /do not present them as final totals or stop the workflow/i);
      assert.match(text, /Cookie _ga; domain=example\.com; party=first_party; category\/purpose=analytics; essentiality=non_essential; observedAtMs=1200ms \(t\+1\.200s\)/);
      assert.match(text, /Tracking vendor Example Analytics; product=Example Analytics Pixel; category\/purpose=analytics; confidence=0\.95; domains=analytics\.example\.test/);
      assert.match(text, /call certscore_get_scan_status once/i);
      assert.match(text, /Wait at least 15 seconds/i);
      assert.match(text, /certscore_get_scan_bundle for the completed scan's final returned tally/i);
      assert.equal(mock.calls.length, 2);
      assert.equal(mock.requestHeaders[1]?.get("x-certscore-mcp-internal-operation"), "scan_site_wait");
      assertToolOutputSchema("certscore_scan_site", result);
    }, {
      anonymousRequesterSecret: "test-secret-at-least-16-characters",
      initialPreConsentPreviewWaitMs: 1_000,
      toolProfile: "light",
    });
  } finally {
    mock.restore();
  }
});

test("MCP Light certscore_scan_site falls back to the unchanged scanId when the preview window expires", async () => {
  const scanId = "00000000-0000-4000-8000-000000000224";
  const mock = installFetch([{
    status: 202,
    body: {
      type: "certscore_scan_job",
      status: "queued",
      jobId: scanId,
      scanId,
      executionMode: "new_scan",
      reused: false,
      freshnessDecision: "no_eligible_recent_scan_queued",
    },
  }]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://example.com" },
      }));

      assert.equal(result.scanId, scanId);
      assert.equal(result.status, "queued");
      assert.equal(result.preConsentPreview, undefined);
      assert.equal(result.recommendedNextTool, "certscore_get_scan_status");
      assert.equal(mock.calls.length, 1);
    }, {
      initialPreConsentPreviewWaitMs: 20,
      toolProfile: "light",
    });
  } finally {
    mock.restore();
  }
});

test("certscore_scan_site accepts legacy wait fields as no-ops without a status read", async () => {
  const mock = installFetch([
    {
      status: 202,
      body: {
        type: "certscore_scan_job",
        status: "queued",
        jobId: "pulse_job_budget",
        scanId: "00000000-0000-4000-8000-000000000124",
        retryAfterSeconds: 0,
      },
    },
  ]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://example.com", maxWaitSeconds: 45, waitForCompletion: true },
      }));

      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.status, "queued");
      assert.equal(result.scanId, "00000000-0000-4000-8000-000000000124");
      assert.equal(result.recommendedNextTool, "certscore_get_scan_status");
      assert.equal(mock.calls.length, 1);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_scan_site identifies an existing completed scan reuse", async () => {
  const mock = installFetch([{
    status: 200,
    body: {
      type: "certscore_scan",
      scanId: "scan_reused",
      domain: "example.com",
      status: "completed",
      score: 74,
      executionMode: "reused_scan",
      reused: true,
      reusedScanAgeSeconds: 90,
      freshnessDecision: "reused_existing_scan"
    }
  }]);
  try {
    await withMcpClient(async (client) => {
      const result = parseToolJson(await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://example.com" }
      }));
      assert.equal((result.provenance as Record<string, unknown>).mode, "existing_completed_scan_reused");
      assert.equal((result.provenance as Record<string, unknown>).retrievalMode, "creation_response");
      assert.equal((result.provenance as Record<string, unknown>).creationDecision, "reused_scan");
      assert.equal((result.provenance as Record<string, unknown>).scanAgeSeconds, 90);
      assert.equal((result.provenance as Record<string, unknown>).reused, true);
      assert.equal((result.provenance as Record<string, unknown>).freshnessDecision, "reused_existing_scan");
      assert.equal(mock.calls.length, 1);
    }, { toolProfile: "light" });
  } finally {
    mock.restore();
  }
});

test("certscore_scan_site transparently substitutes a controlled demo for IANA example domains when enabled", async () => {
  const demoUrl = "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html";
  const mock = installFetch([{
    status: 200,
    body: {
      type: "certscore_scan",
      scanId: "scan_demo",
      domain: "ergoveritas.com",
      status: "completed",
      score: 81,
      executionMode: "reused_scan",
      reused: true,
      freshnessDecision: "reused_existing_scan"
    }
  }]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({
        name: "certscore_scan_site",
        arguments: { url: "https://www.example.com/test" }
      });
      const result = parseToolJson(raw);
      assert.equal(result.domain, "ergoveritas.com");
      assert.deepEqual(result.demoSubstitution, {
        requestedUrl: "https://www.example.com/test",
        effectiveUrl: demoUrl,
        reason: "iana_example_domain",
        message: "The requested IANA example domain is a documentation placeholder, so CertScore scanned its controlled demonstration site instead. Findings describe the effective URL, not the requested placeholder."
      });
      assert.equal(JSON.parse(mock.requestBodies[0] ?? "{}").url, demoUrl);
      assert.match(raw.content[0]?.type === "text" ? raw.content[0].text : "", /Findings describe the effective URL/);
      assertToolOutputSchema("certscore_scan_site", result);
    }, { exampleDomainDemoUrl: demoUrl, toolProfile: "light" });
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
        domain: "example.com",
        status: "completed",
        score: 78,
        riskLevel: "monitor",
        scanFrom: "eu_ie",
        createdAt: "2026-07-08T11:59:59.000Z",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:00:34.000Z",
        scanTimeSeconds: 34
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({
          name: "certscore_get_scan_status",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123" }
        });
      const result = parseToolJson(raw);
      assert.equal(result.type, "certscore_scan_job");
      assert.equal(result.scanId, "00000000-0000-4000-8000-000000000123");
      assert.equal(result.jobId, undefined);
      assert.equal(result.scanFrom, "eu_ie");
      assert.equal(result.createdAt, "2026-07-08T11:59:59.000Z");
      assert.equal(result.startedAt, "2026-07-08T12:00:00.000Z");
      assert.equal(result.completedAt, "2026-07-08T12:00:34.000Z");
      assert.equal(result.scanTimeSeconds, 34);
      assert.equal(result.score, 78);
      assert.equal(result.riskLevel, "monitor");
      assert.equal((result.provenance as Record<string, unknown>).mode, "existing_scan_retrieved");
      assert.equal((result.provenance as Record<string, unknown>).retrievalMode, "scan_id_lookup");
      assert.equal((result.provenance as Record<string, unknown>).creationDecision, "unknown");
      const text = raw.content[0]?.type === "text" ? raw.content[0].text : "";
      assert.match(text, /scanFrom\/execution region=eu_ie/);
      assert.match(text, /completedAt=2026-07-08T12:00:34\.000Z/);
      assert.match(text, /retrieval mode=scan_id_lookup/);
      assert.match(text, /original creation decision=unknown/);
      assert.match(text, /Never infer its original scan region from the current request, the user's location, or a default execution region/);
      assertToolOutputSchema("certscore_get_scan_status", result);
      assert.equal(mock.calls.length, 1);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/status/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_status preserves terminal API v2 completed-limited no-go details without a second read", async () => {
  const mock = installFetch([
    {
      status: 200,
      body: {
        type: "certscore_scan_job",
        jobId: "00000000-0000-4000-8000-000000000123",
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        status: "completed_limited",
        phase: "completed",
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
      const result = parseToolJson(await client.callTool({ name: "certscore_get_scan_status", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } }));
      assert.equal(result.status, "completed_limited");
      assert.equal(result.resultDisposition, "no_go");
      assert.equal((result.noGo as Record<string, unknown>).reasonCode, "parked_or_placeholder");
      assert.equal((result.error as Record<string, unknown>).code, "parked_or_placeholder");
      assert.equal((result.error as Record<string, unknown>).retryable, false);
      assert.equal((result.error as Record<string, unknown>).retryAfterSeconds, null);
      assert.equal((result.error as Record<string, unknown>).recommendedNextAction, "Publish the intended site.");
      assert.match(String(result.observationOnlyDisclaimer), /not proof of compliance/i);
      assert.equal(result.scanTimeSeconds, 3);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/status$/);
      assert.equal(mock.calls.length, 1);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_status returns complete errors for failed, expired, and rate-limited scans", async () => {
  const statuses = ["failed", "expired", "rate_limited"] as const;
  const scanIds = {
    failed: "00000000-0000-4000-8000-000000000201",
    expired: "00000000-0000-4000-8000-000000000202",
    rate_limited: "00000000-0000-4000-8000-000000000203",
  } as const;
  const mock = installFetch(statuses.map((status) => ({
    status: 200,
    body: {
      type: "certscore_scan_job",
      jobId: `scan_${status}`,
      scanId: scanIds[status],
      status,
      ...(status === "rate_limited" ? { retryAfterSeconds: 45 } : {})
    }
  })));
  try {
    await withMcpClient(async (client) => {
      for (const status of statuses) {
        const result = parseToolJson(await client.callTool({
          name: "certscore_get_scan_status",
          arguments: { scanId: scanIds[status] }
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
      const markdownRaw = await client.callTool({ name: "certscore_get_report", arguments: { scanId: "00000000-0000-4000-8000-000000000123", format: "markdown" } });
      const markdown = parseToolJson(markdownRaw);
      assertToolOutputSchema("certscore_get_report", markdown);
      assert.equal(markdown.value, "# CertScore Pulse");
      const markdownText = markdownRaw.content[0]?.type === "text" ? markdownRaw.content[0].text : "";
      assert.match(markdownText, /# CertScore Pulse/);
      assert.match(markdownText, /Provenance: retrieval=scan_id_lookup; original creation=unknown/);
      assert.match(markdownText, /not legal advice, certification, or a compliance determination/i);

      const jsonRaw = await client.callTool({ name: "certscore_get_report", arguments: { scanId: "00000000-0000-4000-8000-000000000123", detail: "full" } });
      const json = parseToolJson(jsonRaw);
      assertToolOutputSchema("certscore_get_report", json);
      assert.equal(json.scanId, "00000000-0000-4000-8000-000000000123");
      const jsonText = jsonRaw.content[0]?.type === "text" ? jsonRaw.content[0].text : "";
      assert.match(jsonText, /Tracking started before consent/);
      assert.match(jsonText, /CertScore score=72/);
      assert.doesNotMatch(jsonText, /compliance score|compliant baseline/i);
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
      const raw = await client.callTool({ name: "certscore_get_evidence", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } });
      const evidence = parseToolJson(raw);
      assertToolOutputSchema("certscore_get_evidence", evidence);
      assert.equal(evidence.type, "certscore_pulse_evidence");
      const text = raw.content[0]?.type === "text" ? raw.content[0].text : "";
      assert.match(text, /Tracking started before consent/);
      assert.match(text, /Do not infer technologies that are not listed/i);
      assert.match(mock.calls[0] ?? "", /scanId=00000000-0000-4000-8000-000000000123/);
      assert.match(mock.calls[0] ?? "", /detail=evidence/);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_bundle returns a compact canonical summary by default", async () => {
  const scan = {
    type: "certscore_scan",
    scanId: "00000000-0000-4000-8000-000000000123",
    domain: "example.com",
    url: "https://example.com",
    status: "completed",
    score: 72,
    scanFrom: "eu_ie",
    createdAt: "2026-08-15T03:39:14.064Z",
    startedAt: "2026-08-15T03:39:14.064Z",
    completedAt: "2026-08-15T03:39:36.015Z",
    coverage: { status: "partial" },
    links: { self: "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123" },
    disclaimer: "Automated public-web observations for human and agentic review."
  };
  const mock = installFetch([
    { status: 200, body: scan },
    { status: 200, body: { ...pulse, summary: { ...pulse.summary, score: 88 }, type: "certscore_pulse_summary", executiveSummary: { issuesToReview: 1 }, counts: { totalAutomatedFindingCount: 1 } } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "00000000-0000-4000-8000-000000000123", findings: [apiFinding("finding_1")] } },
    { status: 200, body: { type: "certscore_pre_consent_cookies_trackers", scanId: "00000000-0000-4000-8000-000000000123", domain: "example.com", summary: { rowCount: 1, trackerCount: 1, cookieCount: 1, requestCount: 1, vendorCount: 1, domainCount: 2 }, rows: [preConsentRow("row_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } });
      const bundle = parseToolJson(raw);
      assert.equal(bundle.type, "certscore_scan_bundle");
      assert.equal(bundle.scanId, "00000000-0000-4000-8000-000000000123");
      assert.equal(bundle.scanFrom, "eu_ie");
      assert.equal(bundle.createdAt, "2026-08-15T03:39:14.064Z");
      assert.equal(bundle.startedAt, "2026-08-15T03:39:14.064Z");
      assert.equal(bundle.completedAt, "2026-08-15T03:39:36.015Z");
      assert.equal(bundle.status, "completed");
      assert.equal(bundle.score, 72);
      assert.equal(bundle.scoreLabel, "CertScore score");
      assert.equal(((bundle.summary as Record<string, any>).executiveSummary as Record<string, unknown>).scoreLabel, "CertScore score");
      assert.equal((bundle.findings as unknown[]).length, 1);
      assert.equal((bundle.findings as Array<Record<string, unknown>>)[0]?.id, "finding_1");
      assert.equal((bundle.findingsMetadata as Record<string, unknown>).returned, 1);
      assert.equal((bundle.findingsMetadata as Record<string, unknown>).total, 1);
      assert.equal((bundle.findingsMetadata as Record<string, unknown>).truncated, false);
      assert.equal(bundle.detail, "summary");
      assert.equal((bundle.mcpMetadata as Record<string, unknown>).requestedMaxBytes, 25_000);
      assert.equal((bundle.mcpMetadata as Record<string, unknown>).effectiveMaxBytes, 25_000);
      assert.equal((bundle.mcpMetadata as Record<string, unknown>).responseCeilingBytes, 25_000);
      assert.equal((bundle.mcpMetadata as Record<string, unknown>).responseBudgetClamped, false);
      assert.ok(!((bundle.mcpMetadata as Record<string, unknown>).omittedSections as string[]).includes("findings"));
      assert.equal(bundle.evidenceSummary, undefined);
      const inventory = bundle.preConsentCookiesTrackers as Record<string, unknown>;
      const rows = inventory.rows as Array<Record<string, unknown>>;
      assert.equal(inventory.total, 1);
      assert.equal(inventory.returned, 1);
      assert.equal(inventory.truncated, false);
      assert.deepEqual(rows[0]?.cookieNames, ["analytics_id"]);
      assert.equal(rows[0]?.vendor, "Example Analytics");
      assert.equal(rows[0]?.purpose, "Audience measurement");
      assert.equal(rows[0]?.category, "Analytics");
      assert.equal(rows[0]?.firstObservedAtMs, 1200);
      assert.deepEqual(rows[0]?.domains, ["analytics.example.test", "collect.example.test", "example.test"]);
      assert.equal((rows[0]?.evidenceClassification as Record<string, unknown>).basis, "public_report_projection");
      assert.equal(rows[0]?.confidence, "high");
      assert.equal((bundle.provenance as Record<string, unknown>).mode, "existing_scan_retrieved");
      assert.equal(bundle.recommendedNextTool, null);
      assert.doesNotMatch(JSON.stringify(bundle), /certscore_explain_finding/);
      assert.equal(mock.calls.length, 4);
      for (const headers of mock.requestHeaders) {
        assert.equal(headers.get("x-certscore-mcp-internal-operation"), "scan_bundle");
        assert.equal(headers.get("x-certscore-mcp-internal-scan-id"), "00000000-0000-4000-8000-000000000123");
        assert.match(headers.get("x-certscore-mcp-internal-proof") ?? "", /^[A-Za-z0-9_-]+$/);
      }
      const text = raw.content[0]?.type === "text" ? raw.content[0].text : "";
      const responseContract = text.split("\n")[0] ?? "";
      assert.match(responseContract, /^Response contract:/);
      assert.match(text, /scanFrom\/execution region=eu_ie/);
      assert.match(text, /completedAt=2026-08-15T03:39:36\.015Z/);
      assert.match(text, /retrieval mode=scan_id_lookup/);
      assert.match(text, /original creation decision=unknown/);
      assert.ok(text.indexOf(responseContract) < text.indexOf("CertScore score=72"));
      assert.ok(text.indexOf(responseContract) < text.indexOf("Canonical projected findings:"));
      assert.match(responseContract, /criticality, priority, and confidence are CertScore metadata/i);
      assert.match(responseContract, /regulatory review lenses are non-determinative CertScore review context—not legal severity, legal exposure, or a compliance determination/i);
      assert.match(responseContract, /Absence of captured consent-action evidence does not establish what happens after Accept, Reject, or Decline/i);
      assert.match(responseContract, /Do not extrapolate an observed embed, vendor, or request into unobserved cookies, fingerprinting, tracking, or processing/i);
      assert.match(text, /Canonical projected findings: 1 of 1 returned/);
      assert.match(text, /Tracking started before consent/);
      assert.match(text, /tracker: Example Analytics/);
      assert.match(text, /cookies=analytics_id/);
      assert.match(text, /CertScore score=72/);
      assert.match(text, /automated public-web observations for human and agentic review/i);
      assert.match(text, /not legal advice, certification, or a compliance determination/i);
      assert.match(text, /Report only observed CertScore evidence and persisted CertScore classifications/i);
      assert.match(text, /the scan does not establish what happens after that action/i);
      assert.match(text, /observed embed, vendor, or request may cause additional cookies, fingerprinting, tracking, or processing unless CertScore observed that behavior/i);
      assert.match(text, /not regulatory criticality or legal exposure/i);
      assert.match(text, /observed privacy risk signal.*CertScore finding/i);
      assert.match(text, /legal violation from scores or findings/i);
      assert.doesNotMatch(text, /compliance score|compliant baseline|criticality=/i);
      assert.ok(text.length <= 8_000);
      assert.match(String((bundle.interpretationGuidance as Record<string, unknown>).statement), /Without corresponding captured post-action evidence/i);
    }, {
      anonymousRequesterSecret: "mcp-internal-read-test-secret",
      anonymousSurface: "mcp_light",
      forwardedClientIp: "203.0.113.44",
      toolProfile: "light"
    });
  } finally {
    mock.restore();
  }
});

test("CertScore Light clamps oversized bundle budgets and reports the applied ceiling", async () => {
  const scan = {
    type: "certscore_scan",
    scanId: "00000000-0000-4000-8000-000000000123",
    domain: "example.com",
    url: "https://example.com",
    status: "completed",
    score: 72,
    links: { report: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123" }
  };
  const mock = installFetch([
    { status: 200, body: scan },
    { status: 200, body: pulse },
    { status: 200, body: { type: "certscore_finding_list", scanId: scan.scanId, findings: [apiFinding("finding_1")] } },
    { status: 200, body: { type: "certscore_pre_consent_cookies_trackers", scanId: scan.scanId, domain: "example.com", summary: { rowCount: 0 }, rows: [] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const raw = await client.callTool({
        name: "certscore_get_scan_bundle",
        arguments: { scanId: scan.scanId, detail: "full", maxBytes: 200_000 }
      });
      const bundle = parseToolJson(raw);
      const metadata = bundle.mcpMetadata as Record<string, unknown>;
      assert.equal(metadata.requestedMaxBytes, 200_000);
      assert.equal(metadata.effectiveMaxBytes, 25_000);
      assert.equal(metadata.responseCeilingBytes, 25_000);
      assert.equal(metadata.responseBudgetClamped, true);
      assert.ok(Number(metadata.actualBytes) <= 25_000);
      assertToolOutputSchema("certscore_get_scan_bundle", bundle);
    }, { toolProfile: "light" });
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
      scanId: "00000000-0000-4000-8000-000000000204",
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
        arguments: { scanId: "00000000-0000-4000-8000-000000000204", detail: "evidence", maxBytes: 5000 }
      }));
      assert.equal(bundle.type, "certscore_scan_bundle");
      assert.equal(bundle.status, "completed_limited");
      assert.equal(bundle.score, null);
      assert.equal(bundle.scoreStatus, "final");
      assert.equal((bundle.provenance as Record<string, unknown>).mode, "existing_scan_retrieved");
      assert.equal(bundle.resultDisposition, "no_go");
      assert.equal(bundle.recommendedNextAction, recommendedNextAction);
      assert.deepEqual(bundle.findings, []);
      assert.deepEqual((bundle.evidenceSummary as Record<string, unknown>).digests, []);
      assert.equal(bundle.error && (bundle.error as Record<string, unknown>).code, "parked_or_placeholder");
      assert.match(String(bundle.observationOnlyDisclaimer), /not proof of compliance/i);
      assert.match(String(bundle.disclaimer), /automated public-web observations for human and agentic review/i);
      assert.match(String(bundle.disclaimer), /not legal advice, certification, or a compliance determination/i);
      assert.equal(mock.calls.length, 1);
    });
  } finally {
    mock.restore();
  }
});

test("completed Light tools preserve one final canonical score and metadata", async () => {
  const canonicalScan = {
    type: "certscore_scan",
    scanId: "00000000-0000-4000-8000-000000000123",
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
    links: { report: "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123" }
  };
  const mock = installFetch([
    { status: 200, body: canonicalScan },
    { status: 200, body: { ...canonicalScan, type: "certscore_scan_job", jobId: "00000000-0000-4000-8000-000000000123" } },
    { status: 200, body: canonicalScan },
    { status: 200, body: { ...pulse, summary: { ...pulse.summary, score: 73 }, type: "certscore_pulse_summary" } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "00000000-0000-4000-8000-000000000123", findings: [apiFinding("finding_1")] } },
    { status: 200, body: { type: "certscore_pre_consent_cookies_trackers", scanId: "00000000-0000-4000-8000-000000000123", domain: "example.com", summary: { rowCount: 1, trackerCount: 1, cookieCount: 1, requestCount: 1 }, rows: [preConsentRow("row_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const created = parseToolJson(await client.callTool({ name: "certscore_scan_site", arguments: { url: "https://example.com" } }));
      const status = parseToolJson(await client.callTool({ name: "certscore_get_scan_status", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } }));
      const bundle = parseToolJson(await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } }));

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
      assert.equal(created.reportUrl, "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123");
      assert.equal(status.reportUrl, "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123");
      assert.equal(bundle.reportUrl, "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123");
      assert.equal(mock.calls.length, 6);
    });
  } finally {
    mock.restore();
  }
});

test("certscore_get_scan_bundle opts into bounded evidence and pre-consent inventory", async () => {
  const scan = {
    type: "certscore_scan",
    scanId: "00000000-0000-4000-8000-000000000123",
    domain: "example.com",
    status: "completed",
    score: 72,
    coverage: { status: "partial" }
  };
  const mock = installFetch([
    { status: 200, body: scan },
    { status: 200, body: { ...pulse, type: "certscore_pulse_evidence", evidenceSafetyNotes: ["Public-safe evidence only."], projectedFindings: pulse.findings } },
    { status: 200, body: { type: "certscore_finding_list", scanId: "00000000-0000-4000-8000-000000000123", findings: [apiFinding("finding_1")] } },
    { status: 200, body: { type: "certscore_pre_consent_cookies_trackers", scanId: "00000000-0000-4000-8000-000000000123", domain: "example.com", summary: { rowCount: 1, trackerCount: 1, cookieCount: 0, requestCount: 1 }, rows: [preConsentRow("row_1")] } }
  ]);
  try {
    await withMcpClient(async (client) => {
      const bundle = parseToolJson(await client.callTool({ name: "certscore_get_scan_bundle", arguments: { scanId: "00000000-0000-4000-8000-000000000123", detail: "evidence" } }));
      assert.ok(bundle.evidenceSummary);
      const inventory = bundle.preConsentCookiesTrackers as Record<string, unknown>;
      assert.equal((inventory.rows as unknown[]).length, 1);
      assert.equal(inventory.total, 1);
      assert.equal(inventory.returned, 1);
      assert.equal(inventory.truncated, false);
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
      const result = await client.callTool({ name: "certscore_get_evidence", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } });
      const evidence = parseToolJson(result);
      const metadata = evidence.mcpMetadata as Record<string, unknown>;
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";

      assert.equal(evidence.type, "certscore_pulse_evidence");
      assert.equal(evidence.scanId, "00000000-0000-4000-8000-000000000123");
      assert.equal(metadata.truncated, true);
      assert.ok(JSON.stringify(evidence).length <= 250_000);
      assert.ok(text.length <= 8_000);
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
        scanId: "00000000-0000-4000-8000-000000000123",
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
        disclaimer: "Automated public-web observations for human and agentic review."
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const exported = parseToolJson(await client.callTool({ name: "certscore_export_findings", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } }));
      assert.equal(exported.type, "certscore_mcp_findings_export");
      assert.equal((exported.findings as unknown[]).length, 1);

      const explanation = parseToolJson(
        await client.callTool({
          name: "certscore_explain_finding",
          arguments: { scanId: "00000000-0000-4000-8000-000000000123", findingId: "pre_consent_tracking_detected" }
        })
      );
      assert.equal(explanation.type, "certscore_finding");
      assert.equal(explanation.id, "pre_consent_tracking_detected");
      assert.match(mock.calls[0] ?? "", /detail=full/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/findings\/pre_consent_tracking_detected/);
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
        scanId: "00000000-0000-4000-8000-000000000123",
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
        scanId: "00000000-0000-4000-8000-000000000123",
        findings: Array.from({ length: 3 }, (_, index) => apiFinding(`finding_${index + 1}`))
      }
    },
    {
      status: 200,
      body: {
        type: "certscore_pre_consent_cookies_trackers",
        scanId: "00000000-0000-4000-8000-000000000123",
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
        scanId: "00000000-0000-4000-8000-000000000123",
        domain: "example.com",
        summary: { rowCount: 3, trackerCount: 0, cookieCount: 0, requestCount: 0 },
        rows: Array.from({ length: 3 }, (_, index) => preConsentRow(`latest_row_${index + 1}`))
      }
    }
  ]);
  try {
    await withMcpClient(async (client) => {
      const scan = parseToolJson(await client.callTool({ name: "certscore_get_scan", arguments: { scanId: "00000000-0000-4000-8000-000000000123" } }));
      const findingsRaw = await client.callTool({ name: "certscore_list_findings", arguments: { scanId: "00000000-0000-4000-8000-000000000123", limit: 1, offset: 1 } });
      const findings = parseToolJson(findingsRaw);
      assertToolOutputSchema("certscore_list_findings", findings);
      const inventoryRaw = await client.callTool({ name: "certscore_get_pre_consent_cookies_trackers", arguments: { scanId: "00000000-0000-4000-8000-000000000123", maxRows: 2 } });
      const inventory = parseToolJson(inventoryRaw);
      assertToolOutputSchema("certscore_get_pre_consent_cookies_trackers", inventory);
      const latest = parseToolJson(
        await client.callTool({ name: "certscore_get_latest_domain_scan", arguments: { domain: "example.com", scanFrom: "eu_ie" } })
      );
      const latestInventoryRaw = await client.callTool({ name: "certscore_get_latest_domain_pre_consent_cookies_trackers", arguments: { domain: "example.com", scanFrom: "eu_ie", maxRows: 1 } });
      const latestInventory = parseToolJson(latestInventoryRaw);
      assertToolOutputSchema("certscore_get_latest_domain_pre_consent_cookies_trackers", latestInventory);

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
      const findingsText = findingsRaw.content[0]?.type === "text" ? findingsRaw.content[0].text : "";
      assert.ok(findingsText.length <= 8_000);
      assert.match(findingsText, /Tracking started before consent/i);
      assert.match(findingsText, /1 of 3 returned \(truncated\)/);
      assert.equal(inventory.type, "certscore_pre_consent_cookies_trackers");
      assert.equal((inventory.rows as unknown[]).length, 2);
      assert.equal(
        (((inventory.rows as Array<Record<string, unknown>>)[0]?.requestDetails as Array<Record<string, unknown>>)[0]?.method),
        "POST"
      );
      assert.equal((inventory.summary as Record<string, unknown>).truncated, true);
      assert.equal((inventory.summary as Record<string, unknown>).totalRowCount, 3);
      assert.deepEqual(inventory.evidenceMetadata, { total: 3, returned: 2, truncated: true });
      const inventoryText = inventoryRaw.content[0]?.type === "text" ? inventoryRaw.content[0].text : "";
      assert.ok(inventoryText.length <= 8_000);
      assert.match(inventoryText, /2 of 3 rows returned \(truncated\)/);
      assert.match(inventoryText, /vendor=Example Analytics/);
      assert.match(inventoryText, /first observed=1\.200s/);
      assert.match(inventoryText, /priority=high; confidence=high/);
      assert.match(inventoryText, /domains=analytics\.example\.test/);
      assert.equal(latest.type, "certscore_domain_latest_scan");
      assert.equal(latestInventory.type, "certscore_pre_consent_cookies_trackers");
      assert.equal((latestInventory.rows as unknown[]).length, 1);
      assert.equal((latestInventory.summary as Record<string, unknown>).truncated, true);
      const latestInventoryText = latestInventoryRaw.content[0]?.type === "text" ? latestInventoryRaw.content[0].text : "";
      assert.ok(latestInventoryText.length <= 8_000);
      assert.match(latestInventoryText, /Example Analytics/);
      assert.match(latestInventoryText, /1 of 3 rows returned \(truncated\)/);
      assert.match(latestInventoryText, /Do not infer technologies that are not listed/i);
      assert.match(mock.calls[0] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123$/);
      assert.match(mock.calls[1] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/findings$/);
      assert.match(mock.calls[2] ?? "", /\/api\/v2\/scans\/00000000-0000-4000-8000-000000000123\/pre-consent-cookies-trackers$/);
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
      const raw = await client.callTool({ name: "certscore_get_scan", arguments: { scanId: "00000000-0000-4000-8000-000000000205" } });
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
