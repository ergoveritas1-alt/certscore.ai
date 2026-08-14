import assert from "node:assert/strict";
import test from "node:test";
import {
  apiV2CreateScanRequestSchema,
  apiV2EvidenceSummarySchema,
  apiV2FindingDetailSchema,
  apiV2FindingListSchema,
  apiV2PreConsentCookiesTrackersSchema,
  apiV2ScanResourceSchema,
  buildCertScoreApiV2OpenApiDocument,
  buildPulseChatGptOpenApiDocument,
  buildPulseV1OpenApiDocument,
  certScoreMcpToolContracts,
  mcpFindingListOutputSchema,
  mcpPreConsentCookiesTrackersOutputSchema,
  mcpScanSiteOutputSchema,
  PULSE_SCHEMA_VERSION,
  pulseErrorSchema,
  pulseResponseSchema,
  pulseStatusSchema
} from "./index.js";

const retrievedMcpGuidance = {
  scoreLabel: "CertScore score" as const,
  provenance: {
    mode: "existing_scan_retrieved" as const,
    executionMode: null,
    reused: null,
    freshnessDecision: null
  },
  interpretationGuidance: {
    scoreLabel: "CertScore score" as const,
    observableSignalsOnly: true as const,
    doNotInferUnobservedTechnologies: true as const,
    doNotInferLegalComplianceStatus: true as const,
    statement: "Observable scan signals only; do not infer unobserved technologies or legal compliance status."
  },
  reportUrl: "https://certscore.ai/scan/scan_123",
  recommendedNextTool: null,
  recommendedNextAction: "Review the result and retained limitations.",
  error: null,
  observationOnlyDisclaimer: "Automated public-web observations for human review, not legal advice, certification, or a compliance determination."
};

test("Pulse v1 schemas accept public-safe response shapes", () => {
  const parsed = pulseResponseSchema.parse({
    type: "certscore_pulse",
    scanId: "scan_123",
    summary: { score: 88, riskLevel: "monitor" },
    topFindings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Tracking started before consent",
        evidenceDigest: { basis: "runtime_observation", hasTimingAnchor: true }
      }
    ],
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" }
  });

  assert.equal(parsed.type, "certscore_pulse");
  assert.equal(parsed.topFindings?.[0]?.id, "pre_consent_tracking_detected");
});

test("Pulse ChatGPT OpenAPI stays compact and action-compatible", () => {
  const document = buildPulseChatGptOpenApiDocument();
  const serialized = JSON.stringify(document);
  const operations: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if ("operationId" in value && typeof value.operationId === "string") {
      operations.push(value.operationId);
    }
    for (const child of Object.values(value)) {
      walk(child);
    }
  };
  walk(document.paths);

  assert.equal(document.openapi, "3.1.1");
  assert.equal(document.info.version, PULSE_SCHEMA_VERSION);
  assert.ok(document.info.title.includes("GPT Action"));
  assert.ok(document.paths["/api/v1/pulse/gpt"].get.responses["200"].content["application/json"].schema);
  assert.deepEqual(operations.sort(), ["checkPulseConnectivity", "getPulseByScanId", "getPulseForUrl", "getPulseJobStatus"]);
  assert.equal(serialized.includes("\"refresh\""), false);
  assert.equal(serialized.includes("\"full\""), true);
  assert.equal(serialized.includes("\"summary\""), true);
  assert.equal(serialized.includes("\"evidence\""), true);
  assert.equal(serialized.includes("\"text/markdown\""), false);
  assert.equal(serialized.includes("\"const\""), false);
});

test("MCP contracts expose the current scoped tool surface", () => {
  assert.deepEqual(
    certScoreMcpToolContracts.map((tool) => tool.name).sort(),
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
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_evidence")?.inputSchema.scanId);
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_scan_bundle")?.inputSchema.scanId);
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_explain_finding")?.inputSchema.findingId);
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_latest_domain_scan")?.inputSchema.domain);
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site")?.inputSchema.waitForCompletion);
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site")?.inputSchema.maxWaitSeconds);
  assert.equal("detail" in (certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site")?.inputSchema ?? {}), false);
  assert.equal("format" in (certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site")?.inputSchema ?? {}), false);
  assert.deepEqual(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site")?.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  });
  assert.deepEqual(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_scan")?.annotations, {
    readOnlyHint: true,
    openWorldHint: true
  });
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_list_findings")?.inputSchema.limit);
  assert.ok(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_pre_consent_cookies_trackers")?.inputSchema.maxRows);
});

test("MCP scan inputs accept every API v2 scanner location", () => {
  const scanSite = certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site");
  assert.ok(scanSite);
  for (const scanFrom of ["eu_de", "eu_ie", "california"] as const) {
    assert.equal(scanSite.inputSchema.scanFrom.parse(scanFrom), scanFrom);
  }
});

test("MCP output contracts reuse stable API shapes with bounded MCP metadata", () => {
  assert.equal(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_scan_site")?.outputSchema, mcpScanSiteOutputSchema);
  assert.equal(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_scan")?.outputSchema, apiV2ScanResourceSchema);
  assert.equal(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_list_findings")?.outputSchema, mcpFindingListOutputSchema);
  assert.equal(certScoreMcpToolContracts.find((tool) => tool.name === "certscore_explain_finding")?.outputSchema, apiV2FindingDetailSchema);
  assert.equal(
    certScoreMcpToolContracts.find((tool) => tool.name === "certscore_get_pre_consent_cookies_trackers")?.outputSchema,
    mcpPreConsentCookiesTrackersOutputSchema
  );

  assert.doesNotThrow(() =>
    mcpFindingListOutputSchema.parse({
      type: "certscore_finding_list",
      scanId: "scan_123",
      findings: [],
      ...retrievedMcpGuidance,
      pagination: {
        limit: 50,
        offset: 0,
        returned: 0,
        total: 0,
        truncated: false
      }
    })
  );
  assert.doesNotThrow(() =>
    mcpPreConsentCookiesTrackersOutputSchema.parse({
      type: "certscore_pre_consent_cookies_trackers",
      scanId: "scan_123",
      domain: "example.com",
      summary: {
        rowCount: 0,
        trackerCount: 0,
        cookieCount: 0,
        requestCount: 0,
        totalRowCount: 12,
        truncated: true
      },
      evidenceMetadata: { total: 12, returned: 0, truncated: true },
      ...retrievedMcpGuidance,
      rows: []
    })
  );
  assert.throws(() =>
    apiV2PreConsentCookiesTrackersSchema.parse({
      type: "certscore_pre_consent_cookies_trackers",
      scanId: "scan_123",
      domain: "example.com",
      summary: {
        rowCount: 0,
        trackerCount: 0,
        cookieCount: 0,
        requestCount: 0,
        totalRowCount: 12
      },
      rows: []
    })
  );
});

test("Pulse v1 schemas accept status and auth error envelopes", () => {
  const status = pulseStatusSchema.parse({
    type: "certscore_pulse_status",
    jobId: "pulse_job_123",
    status: "running"
  });
  const error = pulseErrorSchema.parse({
    type: "certscore_pulse_error",
    error: { code: "forbidden", message: "Missing scope." }
  });

  assert.equal(status.status, "running");
  assert.equal(error.error.code, "forbidden");
});

test("Pulse v1 OpenAPI has stable agent-facing operations", () => {
  const document = buildPulseV1OpenApiDocument();

  assert.equal(document.openapi, "3.1.0");
  assert.equal(document.info.version, PULSE_SCHEMA_VERSION);
  assert.equal(document.paths["/api/v1/pulse"].get.operationId, "getPulse");
  assert.equal(document.paths["/api/v1/pulse/status/{jobId}"].get.operationId, "getPulseJobStatus");
  assert.ok(document.components.securitySchemes.bearerAuth);
  assert.ok(document.components.schemas.PulseResponse);
  assert.ok(document.components.schemas.PulseStatus);
  assert.ok(document.components.schemas.PulseError);
});

test("API v2 accepts EU-Germany, EU-Ireland, and California scan creation with the same resource schema", () => {
  const createRequest = apiV2CreateScanRequestSchema.parse({
    url: "https://example.com",
    scanFrom: "eu_ie",
    metadata: { source: "ci" }
  });
  const californiaCreateRequest = apiV2CreateScanRequestSchema.parse({
    url: "https://example.com",
    scanFrom: "california",
    metadata: { source: "daemon" }
  });
  const euGermanyCreateRequest = apiV2CreateScanRequestSchema.parse({
    url: "https://example.com",
    scanFrom: "eu_de",
    metadata: { source: "regional-api-test" }
  });
  const scan = apiV2ScanResourceSchema.parse({
    type: "certscore_scan",
    scanId: "scan_123",
    domain: "example.com",
    status: "completed",
    score: 88,
    riskLevel: "monitor",
    executionMode: "reused_scan",
    reused: true,
    reusedScanAgeSeconds: 90,
    freshnessDecision: "reused_existing_scan",
    quotaConsumed: false,
    anonymousQuotaLimit: 20,
    anonymousQuotaRemaining: 8,
    anonymousQuotaResetAt: "2026-07-16T00:00:00.000Z",
    recommendedNextTool: "certscore_get_scan_bundle"
  });
  const evidence = apiV2EvidenceSummarySchema.parse({
    basis: "runtime_observation",
    summary: "A public-safe request summary was retained.",
    exampleCount: 1,
    examplesShown: 1,
    projectionWarnings: ["canonical_endpoint_vendor_replaced_raw_vendor"],
    examples: [
      {
        type: "request",
        vendor: "Canonical Analytics",
        urlHost: "analytics.example.test",
        phase: "before_consent",
        requestUrl: "https://analytics.example.test/collect?redacted=1",
        rawObservedVendor: "Borrowed Label",
        rawObservedVendorCategory: "advertising",
        resolvedEndpointVendor: "Canonical Analytics",
        resolvedEndpointVendorCategory: "analytics",
        vendorAttributionBasis: "canonical_endpoint",
        initiatorHost: "www.example.com",
        redirectChain: ["https://analytics.example.test/start?redacted=1"],
        projectionWarnings: ["canonical_endpoint_vendor_replaced_raw_vendor"]
      }
    ]
  });
  const findingList = apiV2FindingListSchema.parse({
    type: "certscore_finding_list",
    scanId: "scan_123",
    findings: [
      {
        type: "certscore_finding",
        id: "pre_consent_tracking_detected",
        scanId: "scan_123",
        label: "Tracking started before consent",
        criticality: "critical",
        confidence: "strong",
        plainEnglish: "Runtime evidence showed non-essential tracking before a consent choice.",
        evidence
      }
    ]
  });

  assert.equal(createRequest.url, "https://example.com");
  assert.equal(createRequest.scanFrom, "eu_ie");
  assert.equal(euGermanyCreateRequest.scanFrom, "eu_de");
  assert.equal(californiaCreateRequest.scanFrom, "california");
  assert.equal(scan.score, 88);
  assert.equal(scan.reused, true);
  assert.equal(scan.anonymousQuotaRemaining, 8);
  assert.equal(scan.recommendedNextTool, "certscore_get_scan_bundle");
  assert.equal(findingList.findings[0]?.evidence.examples?.[0]?.urlHost, "analytics.example.test");
  assert.equal(findingList.findings[0]?.evidence.examples?.[0]?.resolvedEndpointVendor, "Canonical Analytics");
  assert.deepEqual(findingList.findings[0]?.evidence.projectionWarnings, ["canonical_endpoint_vendor_replaced_raw_vendor"]);
});

test("API v2 draft evidence summaries reject raw unbounded fields", () => {
  assert.throws(() =>
    apiV2EvidenceSummarySchema.parse({
      basis: "runtime_observation",
      summary: "Bad raw evidence payload.",
      exampleCount: 1,
      examplesShown: 1,
      rawRequestBody: "not public safe"
    })
  );
  assert.throws(() =>
    apiV2EvidenceSummarySchema.parse({
      basis: "runtime_observation",
      summary: "Too many examples.",
      exampleCount: 6,
      examplesShown: 6,
      examples: [
        { type: "request" },
        { type: "request" },
        { type: "request" },
        { type: "request" },
        { type: "request" },
        { type: "request" }
      ]
    })
  );
  assert.throws(() =>
    apiV2EvidenceSummarySchema.parse({
      basis: "runtime_observation",
      summary: "Raw body on example should fail strict parsing.",
      exampleCount: 1,
      examplesShown: 1,
      examples: [{ type: "request", rawRequestBody: "not public safe" }]
    })
  );
});

test("API v2 draft OpenAPI locks resource path and operation names", () => {
  const document = buildCertScoreApiV2OpenApiDocument();
  const serialized = JSON.stringify(document);
  const operations: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if ("operationId" in value && typeof value.operationId === "string") {
      operations.push(value.operationId);
    }
    for (const child of Object.values(value)) {
      walk(child);
    }
  };
  walk(document.paths);

  assert.equal(document.info.version, "0.1.6");
  assert.ok(document.paths["/api/v2/keys/request"]);
  assert.ok(document.paths["/api/v2/auth/check"]);
  assert.ok(document.paths["/api/v2/scans"]);
  assert.deepEqual(
    document.components.schemas.CreateScanRequest.properties.scanFrom.enum,
    ["eu_de", "eu_ie", "california"]
  );
  assert.ok(document.paths["/api/v2/scans/{scanId}/findings/{findingId}"]);
  assert.ok(document.paths["/api/v2/domains/{domain}/latest"]);
  assert.ok(document.paths["/api/v2/scans/{scanId}/pulse"]);
  assert.deepEqual(operations.sort(), [
    "checkIntegrationCredential",
    "createScan",
    "getApiV2Health",
    "getLatestDomainPreConsentCookiesTrackers",
    "getLatestDomainScan",
    "getScan",
    "getScanDiagnostics",
    "getScanFinding",
    "getScanPreConsentCookiesTrackers",
    "getScanPulse",
    "getScanStatus",
    "listScanFindings",
    "requestReadOnlyApiKey"
  ]);
  assert.match(document.info.description, /automated public-web observations for review/i);
  assert.match(document.info.description, /not legal advice, certification, or a compliance determination/i);
  assert.equal(document.paths["/api/v2/scans"].post.responses["202"].headers["Retry-After"].description, "Recommended retry or polling delay in seconds.");
  assert.ok(document.paths["/api/v2/scans"].post.responses["200"].content["application/json"].examples.completed);
  assert.ok(document.paths["/api/v2/scans"].post.responses["202"].content["application/json"].examples.pending);
  assert.ok(document.paths["/api/v2/scans/{scanId}"].get.responses["200"].content["application/json"].examples.completed);
  assert.ok(document.paths["/api/v2/scans/{scanId}/status"].get.responses["200"].content["application/json"].examples.running);
  assert.ok(document.paths["/api/v2/scans/{scanId}/findings"].get.responses["200"].content["application/json"].examples.findings);
  assert.ok(document.paths["/api/v2/scans/{scanId}/findings/{findingId}"].get.responses["200"].content["application/json"].examples.finding);
  assert.ok(document.paths["/api/v2/domains/{domain}/latest"].get.responses["200"].content["application/json"].examples.latest);
  assert.ok(document.paths["/api/v2/scans/{scanId}/pulse"].get.responses["200"].content["application/json"].examples.pulse);
  assert.ok(document.paths["/api/v2/health"].get.responses["200"].content["application/json"].examples.ok);
  assert.match(serialized, /rawObservedVendor/);
  assert.match(serialized, /projectionWarnings/);
  assert.equal(document.paths["/api/v2/scans"].post.responses["429"].headers["Retry-After"].description, "Recommended retry or polling delay in seconds.");
  assert.ok(document.paths["/api/v2/scans"].post.responses["500"].content["application/json"].examples.internalError);
  assert.doesNotMatch(serialized, /raw DOM|raw request body|stack trace|DATABASE_URL|AUTH_SECRET|internal-only/i);
});
