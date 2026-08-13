import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreError, type PulseResult } from "@certscore/sdk";
import { mcpScanBundleOutputSchema } from "@certscore/api-contracts";
import { boundEvidencePacket, buildScanBundle, explainFinding, exportFindings, limitPreConsentRows, paginateFindingList, toToolError, toToolResult, withMcpAgentGuidance } from "./tools.js";

const report = {
  type: "certscore_pulse",
  scanId: "scan_123",
  domain: "example.com",
  summary: {
    headline: "Automated scan surfaced review signals.",
    score: 72
  },
  topFindings: [
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
      evidenceDigest: {
        basis: "runtime_observation",
        hasTimingAnchor: true
      },
      reviewLenses: ["GDPR / ePrivacy"],
      nextStep: "Review whether the vendor should be consent-gated."
    }
  ],
  coverage: {
    limitations: ["Automated public-web scan only."]
  },
  disclaimer: "Automated public-web observations for review."
} satisfies PulseResult;

function publicFinding(id: string, text = "Observed evidence.") {
  return {
    type: "certscore_finding",
    id,
    scanId: "scan_123",
    label: `Finding ${id}`,
    criticality: "high",
    confidence: "good",
    plainEnglish: text,
    reviewLenses: ["GDPR / ePrivacy"],
    evidence: {
      basis: "runtime_observation",
      summary: text,
      phase: "pre_consent",
      exampleCount: 1,
      examplesShown: 1,
      examplesAvailable: 1,
      hasTimingAnchor: true
    },
    nextStep: "Review the retained evidence.",
    links: {
      self: `https://certscore.ai/api/v2/scans/scan_123/findings/${id}`,
      report: "https://certscore.ai/scan/scan_123"
    }
  };
}

test("exportFindings returns structured finding payloads", () => {
  const exported = exportFindings(report);
  assert.equal(exported.type, "certscore_mcp_findings_export");
  assert.equal(exported.scanId, "scan_123");
  assert.equal(exported.findings.length, 1);
  assert.equal(exported.findings[0]?.id, "pre_consent_tracking_detected");
  assert.equal(exported.findings[0]?.evidenceSummary, "A third-party tracking request was observed before consent.");
});

test("MCP export and explanation preserve structured no-go messaging", () => {
  const noGoReport = {
    ...report,
    scanStatus: "completed_limited",
    resultDisposition: "no_go",
    noGo: {
      reasonCode: "site_not_ready",
      title: "The site is not ready for scanning",
      explanation: "The retained page was a prelaunch experience.",
      summary: "A prelaunch page was observed.",
      limitationKind: "target_site_state",
      recommendedNextAction: "Retry after launch.",
      retryLikelyToHelp: false
    },
    topFindings: [{
      id: "scan_quality_visual_no_go",
      label: "The site is not ready for scanning",
      plainEnglish: "The retained page was a prelaunch experience.",
      nextStep: "Retry after launch."
    }]
  } satisfies PulseResult;
  const exported = exportFindings(noGoReport);
  const explained = explainFinding(noGoReport, "scan_quality_visual_no_go");
  assert.equal(exported.resultDisposition, "no_go");
  assert.equal(exported.noGo?.reasonCode, "site_not_ready");
  assert.equal(exported.noGo?.recommendedNextAction, "Retry after launch.");
  assert.equal(explained.noGo?.title, "The site is not ready for scanning");
});

test("MCP export preserves every supported no-go reason", () => {
  const reasons = [
    "blank_or_unusable_page", "loading_or_stalled", "not_found_404", "parked_or_placeholder",
    "site_not_ready", "captcha_or_challenge", "access_denied_or_forbidden_page", "rate_limited_429",
    "server_error_5xx", "configuration_error", "maintenance_or_unavailable", "tls_or_certificate_error",
    "unsupported_region", "target_unreachable_or_unsuitable", "navigation_transport_failure", "visual_capture_failed_or_placeholder",
    "retained_visual_error_shell", "unknown"
  ] as const;
  for (const reasonCode of reasons) {
    const exported = exportFindings({
      ...report,
      scanStatus: "completed_limited",
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
    });
    assert.equal(exported.noGo?.reasonCode, reasonCode, reasonCode);
  }
});

test("explainFinding includes evidence and caveats", () => {
  const explanation = explainFinding(report, "pre_consent_tracking_detected");
  assert.equal(explanation.found, true);
  assert.equal(explanation.label, "Tracking started before consent");
  assert.deepEqual(explanation.caveats, ["Automated public-web scan only."]);
});

test("explainFinding returns available IDs when finding is absent", () => {
  const explanation = explainFinding(report, "missing");
  assert.equal(explanation.found, false);
  assert.deepEqual(explanation.availableFindingIds, ["pre_consent_tracking_detected"]);
});

test("toToolResult returns concise text and structured content without duplicating JSON", () => {
  const result = toToolResult({ type: "fixture", ok: true });
  assert.deepEqual(result.structuredContent, { type: "fixture", ok: true });
  assert.equal(result.content[0]?.type, "text");
  assert.equal(result.content[0]?.text, "CertScore fixture. Full result is in structuredContent.");
});

test("buildScanBundle honors the caller's byte budget", () => {
  const bundle = buildScanBundle({
    detail: "full",
    evidence: { ...report, evidenceSafetyNotes: ["x".repeat(20_000)] },
    findings: {
      type: "certscore_finding_list",
      findings: Array.from({ length: 20 }, (_, index) => ({ id: `finding_${index}`, label: "x".repeat(2_000) }))
    },
    maxBytes: 8_000,
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      rows: Array.from({ length: 20 }, (_, index) => ({ id: `row_${index}`, label: "y".repeat(2_000) })),
      summary: { rowCount: 20 }
    },
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      score: 72
    }
  } as any);

  assert.ok(new TextEncoder().encode(JSON.stringify(bundle)).byteLength <= 8_000);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).requestedMaxBytes, 8_000);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).truncated, true);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).actualBytes, new TextEncoder().encode(JSON.stringify(bundle)).byteLength);
  assert.equal(typeof (bundle.mcpMetadata as Record<string, unknown>).truncationReason, "string");
});

test("buildScanBundle implements materially distinct detail modes", () => {
  const common = {
    evidence: { ...report, evidenceSafetyNotes: ["Retained evidence is bounded."] },
    findings: {
      type: "certscore_finding_list",
      findings: Array.from({ length: 8 }, (_, index) => ({
        id: `finding_${index}`,
        label: `Finding ${index}`,
        detail: { caveats: ["Review evidence."] },
        evidence: { summary: "Observed evidence.", examples: [{ type: "page" }] }
      }))
    },
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      rows: [{ id: "row_1" }],
      summary: { rowCount: 1 }
    },
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      score: 72
    }
  } as any;

  const summary = buildScanBundle({ ...common, detail: "summary" });
  const findings = buildScanBundle({ ...common, detail: "findings" });
  const evidence = buildScanBundle({ ...common, detail: "evidence" });
  const full = buildScanBundle({ ...common, detail: "full" });

  assert.equal(summary.detail, "summary");
  assert.equal(summary.findings.length, 0);
  assert.ok(summary.mcpMetadata.omittedSections.includes("findings"));
  assert.equal(findings.detail, "findings");
  assert.equal(findings.findings.length, 8);
  assert.equal(findings.findings[0]?.detail, undefined);
  assert.equal(evidence.detail, "evidence");
  assert.equal(evidence.evidenceSummary !== undefined, true);
  assert.ok(Array.isArray(evidence.evidenceSummary.digests));
  assert.equal(evidence.fullReport, undefined);
  assert.equal(full.detail, "full");
  assert.equal(full.evidenceSummary !== undefined, true);
  assert.equal(full.fullReport !== undefined, true);
});

test("findings and evidence modes preserve useful content at the 5000-byte minimum", () => {
  const common = {
    evidence: { ...report, evidenceSafetyNotes: ["Public-safe retained evidence only."] },
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_123",
      findings: [publicFinding("finding_1", "x".repeat(1_200))]
    },
    maxBytes: 5_000,
    preConsentCookiesTrackers: null,
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      url: "https://example.com",
      status: "completed",
      score: 72,
      scoreStatus: "final",
      links: {
        self: "https://certscore.ai/api/v2/scans/scan_123",
        status: "https://certscore.ai/api/v2/scans/scan_123/status",
        report: "https://certscore.ai/scan/scan_123",
        findings: "https://certscore.ai/api/v2/scans/scan_123/findings",
        pulse: "https://certscore.ai/api/v2/scans/scan_123/pulse",
        latestDomainScan: "https://certscore.ai/api/v2/domains/example.com/latest",
        docs: "https://certscore.ai/api/v2/openapi.json",
        diagnostics: "https://certscore.ai/api/v2/scans/scan_123/diagnostics",
        preConsentCookiesTrackers: "https://certscore.ai/api/v2/scans/scan_123/pre-consent-cookies-trackers",
        summaryJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&detail=summary",
        evidenceJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&detail=evidence",
        fullReportUrl: "https://certscore.ai/scan/scan_123",
        markdownUrl: "https://certscore.ai/api/v1/pulse?url=https%3A%2F%2Fexample.com&format=markdown",
        docsUrl: "https://certscore.ai/api-pulse",
        findingsReferenceUrl: "https://certscore.ai/findings",
        jsonUrl: "https://certscore.ai/api/v1/pulse?url=https%3A%2F%2Fexample.com",
        scanJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123",
        fullJsonUrl: "https://certscore.ai/api/v1/pulse?url=https%3A%2F%2Fexample.com&detail=full"
      }
    }
  } as any;

  const findings = buildScanBundle({ ...common, detail: "findings" });
  const evidence = buildScanBundle({ ...common, detail: "evidence" });

  assert.equal(findings.findings.length, 1);
  assert.equal(findings.findings[0]?.id, "finding_1");
  assert.equal(findings.findings[0]?.links, undefined);
  assert.ok(findings.mcpMetadata.actualBytes <= 5_000);
  assert.equal(evidence.findings.length, 1);
  assert.equal(evidence.evidenceSummary.digests[0]?.findingId, "finding_1");
  assert.equal(typeof evidence.evidenceSummary.digests[0]?.evidenceUrl, "string");
  assert.ok(evidence.mcpMetadata.actualBytes <= 5_000);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(findings));
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(evidence));
});

test("byte-budget truncation explains omissions and the next useful limit", () => {
  const bundle = buildScanBundle({
    detail: "full",
    evidence: { ...report, evidenceSafetyNotes: ["x".repeat(15_000)] },
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_123",
      findings: Array.from({ length: 10 }, (_, index) => publicFinding(`finding_${index}`, "y".repeat(2_000)))
    },
    maxBytes: 5_000,
    preConsentCookiesTrackers: null,
    report: { ...report, executiveSummary: { narrative: "z".repeat(10_000) } },
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      links: {
        report: "https://certscore.ai/scan/scan_123",
        findings: "https://certscore.ai/api/v2/scans/scan_123/findings",
        pulse: "https://certscore.ai/api/v2/scans/scan_123/pulse"
      }
    }
  } as any);

  assert.equal(bundle.mcpMetadata.truncated, true);
  assert.ok(bundle.mcpMetadata.omittedSections.length > 0);
  assert.ok(bundle.mcpMetadata.nextRecommendedMaxBytes > 5_000);
  assert.equal(bundle.mcpMetadata.omittedContentAvailableViaUrl, true);
  assert.equal(typeof bundle.mcpMetadata.contentUrls.report, "string");
  assert.match(bundle.recommendedNextAction, /Retry with maxBytes=/);
  assert.ok(bundle.mcpMetadata.actualBytes <= 5_000);
});

test("terminal status guidance always includes a complete actionable error", () => {
  for (const status of ["failed", "expired", "rate_limited"] as const) {
    const result = withMcpAgentGuidance({
      type: "certscore_scan_job",
      scanId: `scan_${status}`,
      status,
      ...(status === "rate_limited" ? { retryAfterSeconds: 45 } : {})
    });
    assert.equal(result.recommendedNextTool, null);
    assert.equal(typeof result.error?.code, "string");
    assert.equal(typeof result.error?.message, "string");
    assert.equal(result.error?.retryable, true);
    assert.equal(typeof result.error?.retryAfterSeconds, "number");
    assert.equal(typeof result.error?.recommendedNextAction, "string");
  }

  const noGo = withMcpAgentGuidance({
    type: "certscore_scan",
    scanId: "scan_no_go",
    status: "completed_limited",
    resultDisposition: "no_go",
    noGo: {
      reasonCode: "parked_or_placeholder",
      explanation: "A placeholder page was retained.",
      retryLikelyToHelp: false,
      recommendedNextAction: "Publish the intended site, then retry."
    }
  });
  assert.equal(noGo.recommendedNextTool, "certscore_get_scan_bundle");
  assert.equal(noGo.error?.code, "parked_or_placeholder");
  assert.equal(noGo.error?.retryable, false);
  assert.equal(noGo.error?.retryAfterSeconds, null);
  assert.match(noGo.observationOnlyDisclaimer, /not proof of compliance/i);
});

test("toToolError marks CertScoreError results as MCP errors and truncates response bodies", () => {
  const responseBody = "x".repeat(2_100);
  const result = toToolError(new CertScoreError("Nope", {
    code: "fixture",
    responseBody,
    status: 401
  }));
  const payload = JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}") as {
    error?: { responseBody?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(payload.error?.responseBody?.length, 2_012);
  assert.match(payload.error?.responseBody ?? "", /…\[truncated\]$/);
});

test("toToolError marks generic errors as MCP errors", () => {
  const result = toToolError(new Error("Boom"));
  const payload = JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}") as {
    error?: { code?: string; message?: string; recommendedNextAction?: string; retryable?: boolean };
  };

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(payload.error?.code, "internal_error");
  assert.equal(payload.error?.message, "Boom");
  assert.equal(payload.error?.retryable, false);
  assert.equal(typeof payload.error?.recommendedNextAction, "string");
});

test("paginateFindingList applies MCP-side limit and offset", () => {
  const result = paginateFindingList({
    type: "certscore_finding_list",
    findings: [{ id: "a" }, { id: "b" }, { id: "c" }]
  }, { limit: 1, offset: 1 });

  assert.deepEqual(result.findings, [{ id: "b" }]);
  assert.deepEqual(result.pagination, {
    limit: 1,
    offset: 1,
    returned: 1,
    total: 3,
    truncated: true
  });
});

test("limitPreConsentRows caps inventory rows and records truncation metadata", () => {
  const result = limitPreConsentRows({
    type: "certscore_pre_consent_cookies_trackers",
    summary: { rowCount: 3 },
    rows: [{ id: "a" }, { id: "b" }, { id: "c" }]
  }, { maxRows: 2 });

  assert.deepEqual(result.rows, [{ id: "a" }, { id: "b" }]);
  assert.deepEqual(result.summary, {
    rowCount: 3,
    totalRowCount: 3,
    truncated: true
  });
});

test("boundEvidencePacket leaves small evidence packets unchanged", () => {
  const payload = {
    type: "certscore_pulse_evidence",
    scanId: "scan_123",
    summary: { score: 72 }
  };

  assert.equal(boundEvidencePacket(payload), payload);
});

test("boundEvidencePacket truncates oversized evidence packets with MCP metadata", () => {
  const payload = {
    type: "certscore_pulse_evidence",
    scanId: "scan_123",
    domain: "example.com",
    summary: { headline: "Automated scan surfaced review signals." },
    findings: Array.from({ length: 120 }, (_, index) => ({
      id: `finding_${index}`,
      evidence: {
        summary: "x".repeat(3_000),
        exampleEvents: Array.from({ length: 20 }, () => ({ value: "y".repeat(1_000) }))
      }
    })),
    disclaimer: "Automated public-web observations for review."
  };

  const result = boundEvidencePacket(payload, 20_000) as Record<string, unknown>;
  const metadata = result.mcpMetadata as Record<string, unknown>;

  assert.equal(result.scanId, "scan_123");
  assert.equal(metadata.truncated, true);
  assert.equal(metadata.maxSerializedChars, 20_000);
  assert.equal(typeof metadata.originalSerializedChars, "number");
  assert.ok(JSON.stringify(result).length <= 20_000);
});
