import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreError, type PulseResult } from "@certscore/sdk";
import { boundEvidencePacket, explainFinding, exportFindings, limitPreConsentRows, paginateFindingList, toToolError, toToolResult } from "./tools.js";

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
    "unsupported_region", "navigation_transport_failure", "visual_capture_failed_or_placeholder",
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

test("toToolResult returns compact JSON text and structured content", () => {
  const result = toToolResult({ type: "fixture", ok: true });
  assert.deepEqual(result.structuredContent, { type: "fixture", ok: true });
  assert.equal(result.content[0]?.type, "text");
  assert.equal(result.content[0]?.text, "{\"type\":\"fixture\",\"ok\":true}");
});

test("toToolError marks CertScoreError results as MCP errors and truncates response bodies", () => {
  const responseBody = "x".repeat(2_100);
  const result = toToolError(new CertScoreError("Nope", {
    code: "fixture",
    responseBody,
    status: 401
  }));
  const payload = result.structuredContent as {
    error?: { responseBody?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(payload.error?.responseBody?.length, 2_012);
  assert.match(payload.error?.responseBody ?? "", /…\[truncated\]$/);
});

test("toToolError marks generic errors as MCP errors", () => {
  const result = toToolError(new Error("Boom"));
  const payload = result.structuredContent as {
    error?: { message?: string; name?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(payload.error?.name, "Error");
  assert.equal(payload.error?.message, "Boom");
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
