import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreError, type PulseResult } from "@certscore/sdk";
import { mcpScanBundleOutputSchema } from "@certscore/api-contracts";
import { boundEvidencePacket, buildScanBundle, explainFinding, exportFindings, limitPreConsentRows, paginateFindingList, scanBundleText, toToolError, toToolResult, withMcpAgentGuidance } from "./tools.js";

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

test("guided scan and status TextContent exposes the canonical report URL from scanId", () => {
  const result = toToolResult(withMcpAgentGuidance({
    type: "certscore_scan_job",
    scanId: "scan_123",
    status: "running"
  }));

  assert.equal((result.structuredContent as Record<string, unknown>).reportUrl, "https://certscore.ai/scan/scan_123");
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /full report=https:\/\/certscore\.ai\/scan\/scan_123/);
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
  assert.equal(bundle.preConsentCookiesTrackers.total, 20);
  assert.equal(bundle.preConsentCookiesTrackers.returned, bundle.preConsentCookiesTrackers.rows.length);
  assert.equal(bundle.preConsentCookiesTrackers.truncated, true);
});

test("documented 8 KB findings budget preserves compact row-level pre-consent evidence", () => {
  const bundle = buildScanBundle({
    detail: "findings",
    evidence: null,
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_123",
      findings: Array.from({ length: 5 }, (_, index) => publicFinding(`finding_${index}`))
    },
    maxBytes: 8_000,
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      rows: Array.from({ length: 24 }, (_, index) => ({
        id: `tracker_${index}`,
        kind: "tracker",
        name: `Tracker ${index}`,
        cookieNames: [],
        vendor: `Vendor ${index}`,
        purpose: "Audience measurement",
        category: "Analytics",
        confidence: "high",
        firstObservedAtMs: 4_000 + index,
        domains: [`tracker-${index}.example`],
        requestCount: null,
        evidenceClassification: {
          basis: "public_report_projection",
          phase: "pre_consent",
          observedBeforeConsent: true,
          party: "third_party",
          priority: "high"
        }
      })),
      summary: { rowCount: 24 }
    },
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
        report: "https://certscore.ai/scan/scan_123",
        findings: "https://certscore.ai/api/v2/scans/scan_123/findings",
        pulse: "https://certscore.ai/api/v2/scans/scan_123/pulse",
        preConsentCookiesTrackers: "https://certscore.ai/api/v2/scans/scan_123/pre-consent-cookies-trackers"
      }
    }
  } as any);

  const text = scanBundleText(bundle);
  assert.ok(bundle.mcpMetadata.actualBytes <= 8_000);
  assert.ok(bundle.preConsentCookiesTrackers.returned >= 1);
  assert.ok(bundle.preConsentCookiesTrackers.rows.length >= 1);
  assert.match(text, /- tracker: Tracker 0;/);
  assert.match(text, /vendor=Vendor 0; purpose=Audience measurement; category=Analytics;/);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
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
  assert.equal(summary.findings.length, 5);
  assert.equal(summary.findingsMetadata.returned, 5);
  assert.equal(summary.findingsMetadata.total, 8);
  assert.equal(summary.findingsMetadata.truncated, true);
  assert.ok(summary.mcpMetadata.omittedSections.includes("additionalFindings"));
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
  assert.equal(summary.preConsentCookiesTrackers.returned, 1);
  assert.equal(summary.preConsentCookiesTrackers.rows[0]?.evidenceClassification.basis, "public_report_projection");
});

test("scan bundle exposes bounded canonical transport security across detail modes", () => {
  const transportSecurity = {
    status: "available",
    evidenceRetained: true,
    observationCounts: {
      total: 5,
      observedPositive: 5,
      concernOrReview: 0,
      notObserved: 0,
      unavailable: 0
    },
    observations: [
      ["transport_security_https_delivery", "HTTPS delivery for scanned pages", "The scanned page was served over HTTPS in the retained transport observation."],
      ["transport_security_tls_certificate", "Valid SSL/TLS certificate", "The strict TLS probe verified the HTTPS origin certificate."],
      ["transport_security_http_redirect", "HTTP redirects to HTTPS", "The explicit HTTP-origin probe redirected to HTTPS."],
      ["transport_security_mixed_content", "Mixed content", "No mixed-content HTTP subresources were retained for the scanned HTTPS page."],
      ["transport_security_form_transport", "Observed form transport", "No insecure observed form transport was retained for the scanned page."]
    ].map(([id, label, summary]) => ({
      id,
      label,
      status: "Observed",
      assessmentStatus: "checked",
      evidenceState: "observed",
      summary,
      evidenceRefs: ["ref_transport_security"]
    })),
    limitations: [
      "Only the listed canonical observations are represented. Do not infer HSTS, supported TLS versions, cipher suites, or certificate properties that are not explicitly returned."
    ],
    retainedSummary: {
      evidenceRetained: true,
      pageHttpsObserved: true,
      httpRedirectsToHttps: true,
      validTlsCertificate: true,
      mixedContentObserved: false,
      insecureFormTransportObserved: false
    }
  };
  const reportWithTransport = {
    ...report,
    transportSecurity,
    executiveSummary: {
      consentPlatform: "OneTrust",
      trackerFootprint: { vendors: 2, domains: 3, cookies: 1 },
      policySurfaces: [{
        type: "privacy_policy",
        title: "Privacy Policy",
        url: "https://example.com/privacy"
      }]
    }
  };
  const common = {
    evidence: { ...reportWithTransport, evidenceSafetyNotes: ["Bounded public evidence."] },
    findings: { type: "certscore_finding_list", findings: [publicFinding("tls")] },
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      rows: [{ id: "row_1", kind: "cookie", name: "cmp" }],
      summary: { rowCount: 1 }
    },
    report: reportWithTransport,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      score: 72,
      freshness: { status: "fresh" },
      scanFrom: "us_east"
    }
  } as any;

  const summary = buildScanBundle({ ...common, detail: "summary" });
  const evidence = buildScanBundle({ ...common, detail: "evidence" });
  const full = buildScanBundle({ ...common, detail: "full" });

  mcpScanBundleOutputSchema.parse(summary);
  mcpScanBundleOutputSchema.parse(evidence);
  mcpScanBundleOutputSchema.parse(full);
  assert.equal(summary.transportSecurity.status, "available");
  assert.deepEqual(summary.transportSecurity.observations, []);
  assert.equal(evidence.transportSecurity.observations.length, 5);
  assert.equal(evidence.transportSecurity.retainedSummary, undefined);
  assert.equal(full.transportSecurity.observations.length, 5);
  assert.equal(full.transportSecurity.retainedSummary.validTlsCertificate, true);
  assert.equal(full.preConsentCookiesTrackers.rows[0]?.name, "cmp");
  assert.equal(full.findings[0]?.id, "tls");
  assert.equal(full.summary.executiveSummary.consentPlatform, "OneTrust");
  assert.deepEqual(full.summary.executiveSummary.trackerFootprint, { vendors: 2, domains: 3, cookies: 1 });
  assert.equal(full.summary.executiveSummary.policySurfaces[0]?.url, "https://example.com/privacy");
  assert.match(scanBundleText(evidence), /Transport security: status=available/);
  assert.match(scanBundleText(evidence), /Valid SSL\/TLS certificate; status=Observed/);
  assert.doesNotMatch(JSON.stringify(full.transportSecurity), /hstsEnabled|tlsVersionMinSupported|cipherSuites/);
});

test("scan bundle explicitly reports unavailable transport evidence without a positive conclusion", () => {
  const bundle = buildScanBundle({
    detail: "full",
    evidence: report,
    findings: { type: "certscore_finding_list", findings: [] },
    preConsentCookiesTrackers: null,
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      score: 72
    }
  } as any);

  assert.equal(bundle.transportSecurity.status, "unavailable");
  assert.equal(bundle.transportSecurity.evidenceRetained, false);
  assert.deepEqual(bundle.transportSecurity.observations, []);
  assert.match(bundle.transportSecurity.limitations[0], /Do not infer a positive transport result/);
  assert.match(scanBundleText(bundle), /Transport security: status=unavailable/);
});

test("summary groups exact duplicate finding labels while findings mode preserves canonical rows", () => {
  const common = {
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_123",
      findings: [
        { ...publicFinding("decline_control", "First projected row."), label: "Decline consent control" },
        { ...publicFinding("regulatory_decline_control", "Second projected row."), label: "Decline consent control" },
        { ...publicFinding("tls", "TLS projected row."), label: "Valid SSL/TLS certificate" }
      ]
    },
    preConsentCookiesTrackers: null,
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      score: 60
    }
  } as any;

  const summary = buildScanBundle({ ...common, detail: "summary" });
  const findings = buildScanBundle({ ...common, detail: "findings" });

  assert.deepEqual(summary.findings.map((finding: Record<string, unknown>) => finding.label), [
    "Decline consent control",
    "Valid SSL/TLS certificate"
  ]);
  assert.deepEqual(summary.findingsMetadata, { shown: 2, returned: 2, total: 3, truncated: true });
  assert.equal(findings.findings.length, 3);
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

test("scan bundle text exposes compact row evidence, neutral score terminology, provenance, and legal framing", () => {
  const bundle = buildScanBundle({
    detail: "summary",
    findings: { type: "certscore_finding_list", scanId: "scan_123", findings: [] },
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      scanId: "scan_123",
      domain: "cnn.com",
      summary: { rowCount: 1, trackerCount: 1, cookieCount: 1, requestCount: 1 },
      rows: [{
        id: "tracker:bombora",
        kind: "tracker",
        name: "Bombora",
        vendor: "Bombora",
        purpose: "Advertising",
        category: "Advertising",
        confidence: "high",
        party: "third_party",
        priority: "high",
        domains: ["cdn.ml314.com"],
        cookieDetails: [{ name: "visitor_id", domain: "ml314.com" }],
        firstObservedAtMs: 1698,
        phase: "pre_consent",
        observedBeforeConsent: true,
        evidenceBasis: "public_report_projection"
      }]
    },
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "cnn.com",
      status: "completed",
      score: 56
    }
  } as any);
  const text = scanBundleText(bundle);
  const responseContract = text.split("\n")[0] ?? "";

  assert.match(responseContract, /^Response contract: Report only observed CertScore evidence and CertScore classifications\./);
  assert.ok(text.indexOf(responseContract) < text.indexOf("CertScore score=56"));
  assert.ok(text.indexOf(responseContract) < text.indexOf("Canonical projected findings:"));
  assert.match(responseContract, /criticality, priority, and confidence are CertScore metadata/i);
  assert.match(responseContract, /regulatory review lenses are non-determinative CertScore review context—not legal severity, legal exposure, or a compliance determination/i);
  assert.match(responseContract, /Absence of captured consent-action evidence does not establish what happens after Accept, Reject, or Decline/i);
  assert.match(responseContract, /Do not extrapolate an observed embed, vendor, or request into unobserved cookies, fingerprinting, tracking, or processing/i);
  assert.match(text, /CertScore score=56/);
  assert.doesNotMatch(text, /compliance score/i);
  assert.match(text, /provenance: existing_scan_retrieved/i);
  assert.match(text, /Full report: https:\/\/certscore\.ai\/scan\/scan_123/);
  assert.match(text, /tracker: Bombora/);
  assert.match(text, /cookies=visitor_id/);
  assert.match(text, /first observed=1\.698s/);
  assert.match(text, /public_report_projection\/pre_consent\/third_party/);
  assert.match(text, /automated public-web observations for human review/i);
  assert.match(text, /not legal advice, certification, or a compliance determination/i);
  assert.match(text, /Report only observed CertScore evidence and persisted CertScore classifications/i);
  assert.match(text, /Without corresponding captured post-action evidence, do not infer what Accept, Reject, Decline, or another consent action would do/i);
  assert.match(text, /the scan does not establish what happens after that action/i);
  assert.match(text, /Do not speculate that an observed embed, vendor, or request may cause additional cookies, fingerprinting, tracking, or processing unless CertScore observed that behavior/i);
  assert.match(text, /Treat returned priority or severity as a CertScore classification, not regulatory criticality or legal exposure/i);
  assert.match(text, /prefer ‘observed privacy risk signal’ or ‘CertScore finding’/i);
  assert.match(text, /Do not infer unobserved technologies, legal compliance, or a legal violation from scores or findings/i);
  assert.match(text, /CertScore priority=high/i);
  assert.doesNotMatch(text, /compliance score|compliant baseline|criticality=/i);
  assert.equal(
    bundle.interpretationGuidance.statement,
    "Report only observed CertScore evidence and persisted CertScore classifications. Without corresponding captured post-action evidence, do not infer what Accept, Reject, Decline, or another consent action would do; say the scan does not establish what happens after that action. Do not speculate that an observed embed, vendor, or request may cause additional cookies, fingerprinting, tracking, or processing unless CertScore observed that behavior. Treat returned priority or severity as a CertScore classification, not regulatory criticality or legal exposure; prefer ‘observed privacy risk signal’ or ‘CertScore finding’. Do not infer unobserved technologies, legal compliance, or a legal violation from scores or findings."
  );
  assert.ok(text.length <= 8_000);
});

test("default scan bundle exposes cross-domain projected findings and canonical overview facts in TextContent", () => {
  const finding = (id: string, label: string, plainEnglish: string) => ({
    ...publicFinding(id, plainEnglish),
    label
  });
  const bundle = buildScanBundle({
    detail: "summary",
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_123",
      findings: [
        finding("consent_reject_not_observed", "First-layer reject control not observed", "The retained canonical consent assessment did not establish a same-layer reject control."),
        finding("transport_security_tls_certificate", "Valid SSL/TLS certificate", "The strict TLS probe did not verify a valid certificate chain."),
        finding("gdpr_transparency_legal_basis", "Processing legal-basis language", "The retained policy projection surfaced a legal-basis disclosure review signal."),
        finding("social_media_embed_pre_consent", "Social/media embeds loaded before consent", "An Instagram asset was observed before any recorded consent action.")
      ]
    },
    preConsentCookiesTrackers: null,
    report: {
      ...report,
      executiveSummary: {
        consentPlatform: "TrustArc",
        cookiesPreConsent: 2,
        nonEssentialPreConsentStorage: 2,
        thirdPartyRequests: 19,
        trackerFootprint: { domains: 8, vendors: 8 },
        policySurfaces: [{ type: "privacy_policy", title: "Privacy Notice", url: "https://example.com/privacy" }],
        score: 46
      }
    },
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "caltech.edu",
      status: "completed",
      score: 46,
      coverage: { status: "partial", summary: "Automated public-web scan completed with coverage limitations." }
    }
  } as any);
  const text = scanBundleText(bundle);

  assert.equal(bundle.findingsMetadata.returned, 4);
  assert.equal(bundle.findingsMetadata.total, 4);
  assert.equal(bundle.findingsMetadata.truncated, false);
  assert.equal(bundle.summary.executiveSummary.consentPlatform, "TrustArc");
  assert.equal(bundle.summary.executiveSummary.preConsentStorageAssessment, undefined);
  assert.equal(bundle.reportUrl, "https://certscore.ai/scan/scan_123");
  assert.match(text, /Full report: https:\/\/certscore\.ai\/scan\/scan_123/);
  assert.match(text, /CMP\/consent platform=TrustArc/);
  assert.match(text, /First-layer reject control not observed/);
  assert.match(text, /Valid SSL\/TLS certificate/);
  assert.match(text, /Processing legal-basis language/);
  assert.match(text, /Social\/media embeds loaded before consent/);
  assert.match(text, /already-projected review signals, not inferred technologies or legal conclusions/i);
  assert.match(text, /CertScore priority\/classification=/i);
  assert.doesNotMatch(text, /compliance score|compliant baseline|criticality=/i);
  assert.ok(text.length <= 8_000);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
});

test("scan bundle text remains bounded while preserving interpretation guidance", () => {
  const bundle = buildScanBundle({
    detail: "summary",
    findings: { type: "certscore_finding_list", scanId: "scan_123", findings: [] },
    maxBytes: 50_000,
    maxPreConsentRows: 50,
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      scanId: "scan_123",
      domain: "example.com",
      summary: { rowCount: 50, trackerCount: 50, cookieCount: 50, requestCount: 50 },
      rows: Array.from({ length: 50 }, (_, index) => ({
        id: `tracker_${index}`,
        kind: "tracker",
        name: `Observed Tracker ${index}`,
        vendor: `Observed Vendor ${index}`,
        purpose: "Audience measurement",
        category: "Analytics",
        confidence: "high",
        party: "third_party",
        priority: "high",
        domains: [`tracker-${index}.example.test`, `collect-${index}.example.test`],
        cookieDetails: [{ name: `cookie_${index}`, domain: "example.test" }],
        firstObservedAtMs: 1_000 + index,
        phase: "pre_consent",
        observedBeforeConsent: true,
        evidenceBasis: "public_report_projection"
      }))
    },
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      score: 60
    }
  } as any);
  const text = scanBundleText(bundle);

  assert.ok(text.length <= 8_000);
  assert.match(text.split("\n")[0] ?? "", /^Response contract:/);
  assert.match(text, /additional returned pre-consent rows? .*omitted from TextContent/i);
  assert.match(text, /automated public-web observations for human review/i);
  assert.match(text, /the scan does not establish what happens after that action/i);
  assert.match(text, /not regulatory criticality or legal exposure/i);
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
