import assert from "node:assert/strict";
import test from "node:test";
import { CertScoreError, type PulseResult } from "@certscore/sdk";
import { mcpScanBundleOutputSchema, mcpScanStatusOutputSchema } from "@certscore/api-contracts";
import { boundEvidencePacket, buildScanBundle, explainFinding, exportFindings, limitPreConsentRows, paginateFindingList, scanBundleText, scanSiteText, scanStatusText, toToolError, toToolResult, withMcpAgentGuidance, withMcpScanProvenanceGuidance } from "./tools.js";

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
  disclaimer: "Automated public-web observations for human and agentic review."
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

test("guided active scan status withholds the report URL until the canonical report is ready", () => {
  const result = toToolResult(withMcpAgentGuidance({
    type: "certscore_scan_job",
    scanId: "scan_123",
    status: "running"
  }));

  assert.equal((result.structuredContent as Record<string, unknown>).reportUrl, null);
  assert.doesNotMatch(result.content[0]?.type === "text" ? result.content[0].text : "", /full report=/);
});

test("MCP Light polling guidance waits 15 seconds after creation and adapts active status polling", () => {
  const created = withMcpAgentGuidance({
    type: "certscore_scan_job",
    scanId: "scan_created",
    status: "running",
    retryAfterSeconds: 1,
  }, "unknown", "scan_creation");
  const queued = withMcpScanProvenanceGuidance({
    type: "certscore_scan_job",
    scanId: "scan_queued",
    status: "queued",
    retryAfterSeconds: 1,
  }, "existing_scan_retrieved");
  const running = withMcpScanProvenanceGuidance({
    type: "certscore_scan_job",
    scanId: "scan_running",
    status: "running",
    retryAfterSeconds: 1,
  }, "existing_scan_retrieved");
  const finalizing = withMcpScanProvenanceGuidance({
    type: "certscore_scan_job",
    scanId: "scan_finalizing",
    status: "finalizing",
    retryAfterSeconds: 2,
  }, "existing_scan_retrieved");

  assert.equal(created.retryAfterSeconds, 15);
  assert.match(created.recommendedNextAction, /Wait at least 15 seconds/);
  assert.equal(queued.retryAfterSeconds, 10);
  assert.match(queued.recommendedNextAction, /Wait at least 10 seconds/);
  assert.equal(running.retryAfterSeconds, 5);
  assert.match(running.recommendedNextAction, /Wait at least 5 seconds/);
  assert.equal(finalizing.retryAfterSeconds, 5);
  assert.match(scanStatusText(finalizing), /Next: Wait at least 5 seconds/);
});

test("scanSiteText lists bounded partial-preview cookie, tracker, category, and timing observations", () => {
  const guided = withMcpAgentGuidance({
    type: "certscore_scan_job",
    scanId: "scan_preview_123",
    status: "running",
    retryAfterSeconds: 2,
    recommendedNextAction: "Poll status after the returned delay.",
    preConsentPreview: {
      type: "certscore_pre_consent_preview",
      resultStage: "preliminary",
      final: false,
      sourceLane: "runtime_evidence",
      generatedAt: "2026-08-29T04:00:03.000Z",
      runtimeCoverage: { status: "limited_partial", limitationKeys: ["six_second_checkpoint"] },
      summary: {
        cookieCount: 1,
        returnedCookieCount: 1,
        trackerCount: 1,
        trackingVendorCount: 1,
        returnedTrackingVendorCount: 1,
        operationalVendorCount: 1,
        returnedOperationalVendorCount: 1,
        thirdPartyRequestCount: 3,
        vendorCount: 2,
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
      operationalVendors: [{
        vendor: "Cloudflare",
        product: "Cloudflare Bot Management",
        purpose: "security",
        confidence: 0.98,
        domains: ["example.com"],
      }],
      truncated: { cookies: false, trackers: false, operationalVendors: false },
      mustContinuePolling: true,
      observationOnlyDisclaimer: "Preliminary passive runtime observations only.",
    },
  });
  const text = scanSiteText(guided);

  assert.match(guided.recommendedNextAction, /partial preview of passive evidence/i);
  assert.match(guided.recommendedNextAction, /not the full scan tally/i);
  assert.match(guided.recommendedNextAction, /Wait at least 2 seconds/);
  assert.match(guided.recommendedNextAction, /certscore_get_scan_bundle for the completed scan's final returned tally/i);
  assert.match(text, /scanId=scan_preview_123; status=running/);
  assert.match(text, /cookies captured=1; cookie identities returned=1; tracking vendors captured=1; tracking vendor identities returned=1/);
  assert.match(text, /operational\/security\/consent vendors captured=1; operational identities returned=1/);
  assert.match(text, /PARTIAL PREVIEW: These are checkpoint-only partial counts, not the full scan tally/i);
  assert.match(text, /do not present them as final totals or stop the workflow/i);
  assert.match(text, /Cookie _ga; domain=example\.com; party=first_party; category\/purpose=analytics; essentiality=non_essential; observedAtMs=1200ms \(t\+1\.200s\)/);
  assert.match(text, /Tracking vendor Example Analytics; product=Example Analytics Pixel; category\/purpose=analytics; confidence=0\.95; domains=analytics\.example\.test/);
  assert.match(text, /Operational vendor Cloudflare; product=Cloudflare Bot Management; category\/purpose=security; confidence=0\.98; domains=example\.com/);
  assert.match(text, /broader trackerCount may include those categories/i);
  assert.match(text, /per-tracker first-seen milliseconds are not part of the preliminary preview contract/i);
  assert.match(text, /Continue with certscore_get_scan_status using the unchanged scanId scan_preview_123/i);
  assert.match(text, /certscore_get_scan_bundle for the completed scan's final returned tally/i);
  assert.ok(text.length <= 8_000);
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
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).effectiveMaxBytes, 8_000);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).responseCeilingBytes, 200_000);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).responseBudgetClamped, false);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).truncated, true);
  assert.equal((bundle.mcpMetadata as Record<string, unknown>).actualBytes, new TextEncoder().encode(JSON.stringify(bundle)).byteLength);
  assert.equal(typeof (bundle.mcpMetadata as Record<string, unknown>).truncationReason, "string");
  assert.equal(bundle.preConsentCookiesTrackers.total, 20);
  assert.equal(bundle.preConsentCookiesTrackers.returned, bundle.preConsentCookiesTrackers.rows.length);
  assert.equal(bundle.preConsentCookiesTrackers.truncated, true);
});

test("Light response ceiling is explicit and does not recommend refetching complete canonical findings", () => {
  const bundle = buildScanBundle({
    detail: "full",
    evidence: { ...report, evidenceSafetyNotes: ["x".repeat(20_000)] },
    findings: {
      type: "certscore_finding_list",
      findings: Array.from({ length: 20 }, (_, index) => ({
        ...publicFinding(`finding_${index}`),
        plainEnglish: `Observed canonical projection ${index}: ${"x".repeat(2_000)}`
      }))
    },
    maxBytes: 200_000,
    maxFindings: 20,
    preConsentCookiesTrackers: null,
    report,
    requestedMaxBytes: 200_000,
    responseCeilingBytes: 25_000,
    scan: {
      type: "certscore_scan",
      scanId: "scan_123",
      domain: "example.com",
      status: "completed",
      links: { report: "https://certscore.ai/scan/scan_123" }
    }
  } as any);

  assert.equal(bundle.mcpMetadata.requestedMaxBytes, 200_000);
  assert.equal(bundle.mcpMetadata.effectiveMaxBytes, 25_000);
  assert.equal(bundle.mcpMetadata.responseCeilingBytes, 25_000);
  assert.equal(bundle.mcpMetadata.responseBudgetClamped, true);
  assert.ok(bundle.mcpMetadata.fullPayloadBytes > 25_000);
  assert.equal(bundle.mcpMetadata.nextRecommendedMaxBytes, null);
  assert.equal(bundle.mcpMetadata.canonicalFindingsComplete, true);
  assert.match(bundle.recommendedNextAction, /Canonical findings complete/i);
  assert.match(bundle.recommendedNextAction, /retry only for omitted envelope detail/i);
  assert.ok(bundle.mcpMetadata.actualBytes <= 25_000);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
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

test("5 KB floor keeps canonical post-refusal findings ahead of pre-consent findings", () => {
  const orderedIds = [
    "pre_consent_tracking_detected",
    "pre_consent_cookie_storage",
    "post_refusal_non_essential_activity",
    "pre_consent_storage_not_cleared",
    "refusal_signal_contradicts_action",
  ];
  const bundle = buildScanBundle({
    detail: "findings",
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_post_refusal_budget",
      findings: orderedIds.map((id) => publicFinding(id)),
    },
    maxBytes: 5_000,
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      rows: Array.from({ length: 20 }, (_, index) => ({
        id: `inventory_${index}`,
        kind: "tracker",
        name: `Inventory ${index}`,
        cookieNames: [],
        vendor: `Vendor ${index}`,
        purpose: "Analytics",
        category: "Analytics",
        confidence: "high",
      })),
      summary: { rowCount: 20 },
    },
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_post_refusal_budget",
      domain: "example.com",
      status: "completed",
      links: {
        findings: "https://certscore.ai/api/v2/scans/scan_post_refusal_budget/findings",
        report: "https://certscore.ai/scan/scan_post_refusal_budget",
      },
    },
  } as any);

  assert.deepEqual(
    bundle.findings.slice(0, 3).map((finding: Record<string, unknown>) => finding.id),
    [
      "post_refusal_non_essential_activity",
      "pre_consent_storage_not_cleared",
      "refusal_signal_contradicts_action",
    ],
  );
  assert.equal(bundle.findingsMetadata.returned, 5);
  assert.equal(bundle.mcpMetadata.canonicalFindingsComplete, true);
  assert.ok(bundle.mcpMetadata.actualBytes <= 5_000);
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
  assert.equal(full.fullReport.findings, undefined);
  assert.equal(full.fullReport.topFindings !== undefined, true);
  assert.equal(full.fullReport.transportSecurity, undefined);
  assert.deepEqual(full.mcpMetadata.deduplicatedSections, []);
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
    findings: [publicFinding("tls")],
    topFindings: [publicFinding("tls")],
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
      scanFrom: "eu_ie"
    }
  } as any;

  const summary = buildScanBundle({ ...common, detail: "summary" });
  const evidence = buildScanBundle({ ...common, detail: "evidence" });
  const full = buildScanBundle({ ...common, detail: "full" });
  const tightFindings = buildScanBundle({
    ...common,
    detail: "findings",
    findings: {
      type: "certscore_finding_list",
      findings: Array.from({ length: 5 }, (_, index) => publicFinding(
        `finding_${index}`,
        "Observed runtime evidence surfaced a bounded review signal that should be reviewed against the retained evidence."
      ))
    },
    maxBytes: 5_000
  });

  mcpScanBundleOutputSchema.parse(summary);
  mcpScanBundleOutputSchema.parse(evidence);
  mcpScanBundleOutputSchema.parse(full);
  assert.equal(summary.transportSecurity.status, "available");
  assert.equal(summary.transportSecurity.observations.length, 5);
  assert.equal(summary.transportSecurity.observations[0]?.label, "HTTPS delivery for scanned pages");
  assert.deepEqual(summary.transportSecurity.observations[0]?.evidenceRefs, []);
  assert.equal(evidence.transportSecurity.observations.length, 5);
  assert.equal(evidence.transportSecurity.retainedSummary, undefined);
  assert.equal(full.transportSecurity.observations.length, 5);
  assert.equal(full.transportSecurity.retainedSummary.validTlsCertificate, true);
  assert.equal(full.fullReport.findings, undefined);
  assert.equal(full.fullReport.topFindings, undefined);
  assert.equal(full.fullReport.transportSecurity, undefined);
  assert.deepEqual(full.mcpMetadata.deduplicatedSections, [
    "fullReport.findings",
    "fullReport.topFindings",
    "fullReport.transportSecurity"
  ]);
  assert.equal(full.preConsentCookiesTrackers.rows[0]?.name, "cmp");
  assert.equal(full.findings[0]?.id, "tls");
  assert.equal(full.summary.executiveSummary.consentPlatform, "OneTrust");
  assert.deepEqual(full.summary.executiveSummary.trackerFootprint, { vendors: 2, domains: 3, cookies: 1 });
  assert.equal(full.summary.executiveSummary.policySurfaces[0]?.url, "https://example.com/privacy");
  assert.match(scanBundleText(summary), /Transport security: status=available/);
  assert.match(scanBundleText(summary), /Valid SSL\/TLS certificate; status=Observed/);
  assert.match(scanBundleText(evidence), /Transport security: status=available/);
  assert.match(scanBundleText(evidence), /Valid SSL\/TLS certificate; status=Observed/);
  assert.doesNotMatch(JSON.stringify(full.transportSecurity), /hstsEnabled|tlsVersionMinSupported|cipherSuites/);
  assert.equal(tightFindings.findingsMetadata.returned, 5);
  assert.equal(tightFindings.transportSecurity.observations.length, 0);
  assert.ok(tightFindings.mcpMetadata.omittedSections.includes("transportSecurityDetail"));
  assert.ok(tightFindings.mcpMetadata.actualBytes <= 5_000);
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
  assert.equal(
    findings.findings[0]?.links?.self ?? findings.findings[0]?.evidenceUrl,
    "https://certscore.ai/api/v2/scans/scan_123/findings/finding_1"
  );
  assert.ok(findings.mcpMetadata.actualBytes <= 5_000);
  assert.equal(evidence.findings.length, 1);
  assert.equal(evidence.evidenceSummary.digests[0]?.findingId, "finding_1");
  assert.equal(typeof evidence.evidenceSummary.digests[0]?.evidenceUrl, "string");
  assert.ok(evidence.mcpMetadata.actualBytes <= 5_000);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(findings));
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(evidence));
});

test("5000-byte findings bundles preserve realistic core finding rows before optional inventory", () => {
  const scanId = "00000000-0000-4000-8000-000000000500";
  const fixtureFindings = [
    {
      id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",
      label: "Non-essential pre-consent cookies/storage",
      plainEnglish: "2 non-essential cookie or browser-storage items were observed before consent. First observed at 4.48s after scan start."
    },
    {
      id: "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking",
      label: "Pre-consent non-essential tracking",
      plainEnglish: "Pre-consent non-essential tracking evidence was retained before consent: Example Analytics; first seen 2.74s after scan start; no consent action was recorded first."
    },
    {
      id: "regulatory_gap__gdpr_eprivacy__reject_all_path_availability",
      label: "Decline consent control",
      plainEnglish: "Partial support from scan evidence; no observable refusal path was retained before non-essential activity."
    },
    {
      id: "regulatory_gap__gdpr_eprivacy__session_replay_fingerprinting_review",
      label: "Session replay signal",
      plainEnglish: "Session replay or behavioral analytics signals were observed before any recorded consent action."
    },
    {
      id: "session_recording_services_detected",
      label: "Session replay service signal observed",
      plainEnglish: "A session-replay collection endpoint was observed during runtime collection."
    }
  ];
  const bundle = buildScanBundle({
    detail: "findings",
    findings: {
      type: "certscore_finding_list",
      scanId,
      findings: fixtureFindings.map((fixtureFinding, index) => ({
        ...publicFinding(fixtureFinding.id, fixtureFinding.plainEnglish),
        label: fixtureFinding.label,
        scanId,
        links: {
          self: `https://certscore.ai/api/v2/scans/${scanId}/findings/${fixtureFinding.id}`,
          report: `https://certscore.ai/scan/${scanId}`
        },
        nextStep: index === 0
          ? "Delay non-essential requests until consent state is established."
          : "Review the retained checklist evidence, confirm whether the row is applicable to the site, and address the underlying implementation or disclosure gap if confirmed."
      }))
    },
    maxBytes: 5_000,
    preConsentCookiesTrackers: {
      type: "certscore_pre_consent_cookies_trackers",
      scanId,
      domain: "example.com",
      summary: { rowCount: 3, trackerCount: 3, cookieCount: 2, requestCount: 8 },
      rows: Array.from({ length: 3 }, (_, index) => ({
        id: `tracker_${index}`,
        kind: "tracker",
        name: `Vendor ${index}`,
        vendor: `Vendor ${index}`,
        purpose: "Analytics",
        category: "Analytics",
        confidence: "high",
        party: "third_party",
        priority: "high",
        domains: [`tracker${index}.example`],
        cookieDetails: [{ name: `cookie_${index}` }],
        firstObservedAtMs: 1_000 + index * 250,
        phase: "pre_consent",
        observedBeforeConsent: true,
        evidenceBasis: "public_report_projection"
      }))
    },
    report: {
      ...report,
      summary: {
        headline: "Automated scan surfaced public-web review signals with retained evidence.",
        score: 61
      },
      transportSecurity: {
        status: "available",
        evidenceRetained: true,
        observationCounts: {
          total: 5,
          observedPositive: 5,
          concernOrReview: 0,
          notObserved: 0,
          unavailable: 0
        },
        observations: [],
        limitations: [
          "Only the listed canonical observations are represented. Do not infer HSTS, supported TLS versions, cipher suites, or certificate properties that are not explicitly returned."
        ]
      }
    },
    scan: {
      type: "certscore_scan",
      scanId,
      domain: "example.com",
      url: "https://example.com",
      status: "completed",
      scanFrom: "eu_ie",
      createdAt: "2026-08-26T05:39:14.256Z",
      startedAt: "2026-08-26T05:39:14.256Z",
      completedAt: "2026-08-26T05:39:33.077Z",
      scanTimeSeconds: 18.8,
      score: 61,
      scoreStatus: "final",
      scoreVersion: "gdpr-eprivacy-canonical-shadow-v7",
      scoreUpdatedAt: "2026-08-26T05:39:33.077Z",
      riskLevel: "review_recommended",
      coverage: {
        status: "partial",
        summary: "Automated public-web scan completed with coverage limitations.",
        limitations: ["Automated public-web scan only."]
      },
      links: {
        self: `https://certscore.ai/api/v2/scans/${scanId}`,
        report: `https://certscore.ai/scan/${scanId}`,
        findings: `https://certscore.ai/api/v2/scans/${scanId}/findings`,
        pulse: `https://certscore.ai/api/v2/scans/${scanId}/pulse`,
        preConsentCookiesTrackers: `https://certscore.ai/api/v2/scans/${scanId}/pre-consent-cookies-trackers`
      }
    }
  } as any);

  assert.equal(bundle.findingsMetadata.returned, 5);
  assert.equal(bundle.findingsMetadata.total, 5);
  assert.equal(bundle.findingsMetadata.truncated, false);
  assert.equal(bundle.mcpMetadata.canonicalFindingsComplete, true);
  assert.match(bundle.recommendedNextAction, /Canonical findings complete/);
  assert.match(bundle.recommendedNextAction, /only for omitted envelope detail/);
  assert.equal(bundle.evidenceUrlTemplate, "{contentUrls.findings}/{findingId}");
  assert.ok(bundle.findings.every((finding: Record<string, any>) => !("evidenceUrl" in finding)));
  assert.equal(bundle.mcpMetadata.contentUrls.findings, `https://certscore.ai/api/v2/scans/${scanId}/findings`);
  assert.equal(bundle.findings[0]?.nextStep, "Delay non-essential requests until consent state is established.");
  assert.ok(bundle.findings.slice(1).every((finding: Record<string, any>) => finding.nextStep === undefined));
  assert.equal(bundle.preConsentCookiesTrackers, undefined);
  assert.equal(bundle.links, undefined);
  assert.equal(bundle.timing, undefined);
  assert.equal(bundle.summary, undefined);
  assert.ok(bundle.mcpMetadata.omittedSections.includes("additionalPreConsentRows"));
  assert.ok(bundle.mcpMetadata.omittedSections.includes("findingEvidenceUrls"));
  assert.ok(bundle.mcpMetadata.omittedSections.includes("preConsentCookiesTrackers"));
  assert.ok(bundle.mcpMetadata.omittedSections.includes("links"));
  assert.ok(bundle.mcpMetadata.omittedSections.includes("timing"));
  assert.ok(bundle.mcpMetadata.omittedSections.includes("summary"));
  assert.ok(bundle.mcpMetadata.actualBytes <= 5_000);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
});

test("full bundles deduplicate per-finding disclaimers into the top-level guidance", () => {
  const finding = {
    ...publicFinding("finding_with_disclaimer"),
    disclaimer: "Repeated finding disclaimer."
  };
  const bundle = buildScanBundle({
    detail: "full",
    findings: { type: "certscore_finding_list", scanId: "scan_123", findings: [finding] },
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

  assert.equal(bundle.findings[0]?.disclaimer, undefined);
  assert.ok(bundle.mcpMetadata.deduplicatedSections.includes("findings[].disclaimer"));
  assert.equal(typeof bundle.observationOnlyDisclaimer, "string");
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
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
  assert.equal(bundle.mcpMetadata.canonicalFindingsComplete, false);
  assert.ok(bundle.mcpMetadata.omittedSections.length > 0);
  assert.ok(bundle.mcpMetadata.fullPayloadBytes > bundle.mcpMetadata.actualBytes);
  assert.equal(bundle.mcpMetadata.nextRecommendedMaxBytes, Math.ceil(bundle.mcpMetadata.fullPayloadBytes / 1_000) * 1_000);
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
  assert.match(text, /retrieval mode=scan_id_lookup/i);
  assert.match(text, /original creation decision=unknown/i);
  assert.match(text, /Full report: https:\/\/certscore\.ai\/scan\/scan_123/);
  assert.match(text, /tracker: Bombora/);
  assert.match(text, /cookies=visitor_id/);
  assert.match(text, /first observed=1\.698s/);
  assert.match(text, /public_report_projection\/pre_consent\/third_party/);
  assert.match(text, /automated public-web observations for human and agentic review/i);
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
  assert.match(bundle.interpretationGuidance.statement, /When postAcceptObservation or postRefusalObservation is confirmed and termination\.kind is evidence_satisfied/i);
  assert.match(bundle.interpretationGuidance.statement, /observation stopped intentionally after qualifying evidence was retained/i);
  assert.match(bundle.interpretationGuidance.statement, /mention unmeasured longer-term persistence only when relevant/i);
  assert.equal(bundle.gpcResponse, undefined);
  assert.equal(bundle.postAcceptObservation, null);
  assert.equal(bundle.postRefusalObservation, null);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
  assert.ok(text.length <= 8_000);
});

test("scan bundle makes intentional post-refusal evidence termination explicit", () => {
  const bundle = buildScanBundle({
    detail: "summary",
    findings: { type: "certscore_finding_list", scanId: "scan_reject", findings: [] },
    preConsentCookiesTrackers: null,
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_reject",
      domain: "example.com",
      status: "completed",
      score: 42,
      postRefusalObservation: {
        status: "confirmed_observation",
        refusalExercised: true,
        observationCount: 2,
        productionProjectable: true,
        evidenceDisposition: "confirmed",
        indeterminateReason: null,
        verdict: "eligible_nonessential_activity_observed_after_confirmed_refusal",
        interpretation: "Reject was confirmed, and eligible non-essential storage activity was observed afterward.",
        observationStrategy: "stop_on_first_eligible_activity",
        termination: {
          kind: "evidence_satisfied",
          intentional: true,
          trigger: "non_essential_storage_write_observed",
        },
        completedAt: "2026-08-26T12:00:09.000Z",
        coverageLimitations: ["The remainder of the persistence window was not measured."],
        limitations: ["The remainder of the persistence window was not measured."],
      },
    },
  } as any);

  const text = scanBundleText(bundle);
  assert.match(text, /Reject Path: Reject was confirmed, and eligible non-essential storage activity was observed afterward\./);
  assert.match(text, /observation then stopped intentionally because qualifying evidence had been captured/i);
  assert.match(text, /Reject Path coverage limitation: The remainder of the persistence window was not measured\./);
  assert.doesNotMatch(text, /observation_early_exit|persistence_observation_not_settled_due_to_early_exit/);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
});

test("scan bundle surfaces the typed GPC response and keeps California scoring separate", () => {
  const delta = {
    baselineCount: 1,
    gpcCount: 1,
    countDelta: 0,
    baselineOnly: [],
    gpcOnly: [],
    shared: ["Example Ads|pixel|advertising"],
  };
  const bundle = buildScanBundle({
    detail: "summary",
    findings: { type: "certscore_finding_list", scanId: "scan_gpc", findings: [] },
    preConsentCookiesTrackers: null,
    report,
    scan: {
      type: "certscore_scan",
      scanId: "scan_gpc",
      domain: "example.com",
      status: "completed",
      score: 42,
      gpcResponse: {
        status: "no_observable_response",
        findingTitle: "No observable GPC response",
        summary: "No observable baseline delta was retained under the equivalent passive GPC condition.",
        scoreEffect: "none",
        legalInterpretation: "not_assessed",
        comparison: {
          comparable: true,
          protocol: "passive_baseline_with_sec_gpc",
          baselineArtifact: { lane: "runtime_evidence", sha256: "a".repeat(64), sizeBytes: 100 },
          gpcArtifact: { lane: "gpc_observation", sha256: "b".repeat(64), sizeBytes: 110 },
          enabledProof: {
            secGpcHeaderValue: "1",
            requestsWithSecGpc: 2,
            requestEventIds: ["gpc-request-1", "gpc-request-2"],
            navigatorGlobalPrivacyControl: true,
          },
          deltas: {
            cookies: delta,
            trackers: delta,
            advertisingOrMeasurementActivity: delta,
            consentOrCmpBehavior: delta,
          },
          limitationKeys: [],
        },
        californiaPolicy: { applied: true, deductionPoints: 15 },
        evidenceUrl: "https://certscore.ai/api/v2/scans/scan_gpc/findings/gpc_response",
      },
    },
  } as any);

  const text = scanBundleText(bundle);
  assert.equal(bundle.gpcResponse?.status, "no_observable_response");
  assert.match(text, /GPC response: No observable GPC response; status=no_observable_response/);
  assert.match(text, /Sec-GPC: 1 proof retained on 2 request\(s\)/);
  assert.match(text, /California scoring policy: −15 points/);
  assert.match(bundle.interpretationGuidance.statement, /do not call the result a GPC violation or say GPC was not honored/i);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
});

test("terminal MCP status text surfaces GPC, Accept, and Reject lane results", () => {
  const text = scanStatusText({
    status: "completed",
    scanId: "scan_lane_results",
    gpcResponse: {
      status: "responsive",
      findingTitle: "GPC response",
      comparison: { enabledProof: { requestsWithSecGpc: 3 } },
    },
    postAcceptObservation: { interpretation: "Accept was confirmed and eligible activity was observed afterward." },
    postRefusalObservation: { interpretation: "Reject was confirmed and no eligible activity was observed during the completed window." },
  });

  assert.match(text, /GPC response: GPC response; status=responsive; Sec-GPC: 1 proof retained on 3 request\(s\)/);
  assert.match(text, /Accept Path: Accept was confirmed/);
  assert.match(text, /Reject Path: Reject was confirmed/);
});

test("scan bundle surfaces canonical post-Accept findings and observation metadata", () => {
  const finding = publicFinding(
    "post_accept_consent_dependent_activity",
    "Confirmed acceptance was followed by eligible non-essential analytics activity.",
  );
  const bundle = buildScanBundle({
    detail: "summary",
    findings: {
      type: "certscore_finding_list",
      scanId: "scan_accept",
      findings: [finding],
    },
    preConsentCookiesTrackers: null,
    report: {
      ...report,
      scanId: "scan_accept",
      topFindings: [{
        ...report.topFindings[0],
        id: "post_accept_consent_dependent_activity",
        label: "Activity observed after confirmed acceptance",
        plainEnglish: "Confirmed acceptance was followed by eligible non-essential analytics activity.",
      }],
    },
    scan: {
      type: "certscore_scan",
      scanId: "scan_accept",
      domain: "example.com",
      status: "completed",
      score: 42,
      postAcceptObservation: {
        status: "confirmed_observation",
        acceptanceExercised: true,
        observationCount: 3,
        productionProjectable: true,
        evidenceDisposition: "confirmed",
        indeterminateReason: null,
        verdict: "eligible_nonessential_activity_observed_after_confirmed_acceptance",
        interpretation: "Accept was confirmed, and eligible non-essential network and storage activity was observed afterward.",
        observationStrategy: "stop_on_first_eligible_activity",
        termination: {
          kind: "evidence_satisfied",
          intentional: true,
          trigger: "acceptance_signal_contradiction_observed",
        },
        completedAt: "2026-09-01T12:00:09.000Z",
        coverageLimitations: [],
        limitations: [],
      },
    },
  } as any);

  const text = scanBundleText(bundle);
  assert.equal(bundle.findings[0]?.id, "post_accept_consent_dependent_activity");
  assert.equal(bundle.postAcceptObservation?.productionProjectable, true);
  assert.match(text, /Accept Path: Accept was confirmed, and eligible non-essential network and storage activity was observed afterward\./);
  assert.match(text, /observation then stopped intentionally because qualifying evidence had been captured/i);
  assert.match(text, /post_accept_consent_dependent_activity/);
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
});

test("Light read projections expose canonical provenance for reused and newly created scans", () => {
  for (const fixture of [
    { executionMode: "reused_scan", reused: true, expectedMode: "existing_completed_scan_reused" },
    { executionMode: "new_scan", reused: false, expectedMode: "new_scan_started" }
  ] as const) {
    const status = withMcpScanProvenanceGuidance({
      type: "certscore_scan_job",
      jobId: "scan_provenance",
      scanId: "scan_provenance",
      status: "completed",
      scanFrom: "eu_ie",
      createdAt: "2026-08-15T03:39:14.064Z",
      startedAt: "2026-08-15T03:39:14.064Z",
      completedAt: "2026-08-15T03:39:36.015Z",
      ...fixture
    }, "unknown");
    const text = scanStatusText(status);

    assert.equal(status.scanFrom, "eu_ie");
    assert.equal(status.completedAt, "2026-08-15T03:39:36.015Z");
    assert.equal(status.provenance.mode, fixture.expectedMode);
    assert.equal(status.provenance.retrievalMode, "creation_response");
    assert.equal(status.provenance.creationDecision, fixture.executionMode);
    assert.equal(typeof status.provenance.scanAgeSeconds, "number");
    assert.match(text, /scanId=scan_provenance/);
    assert.match(text, /scanFrom\/execution region=eu_ie/);
    assert.match(text, /completedAt=2026-08-15T03:39:36\.015Z/);
    assert.match(text, /startedAt=2026-08-15T03:39:14\.064Z/);
    assert.match(text, /retrieval mode=creation_response/);
    assert.match(text, new RegExp(`original creation decision=${fixture.executionMode}`));
    assert.match(text, new RegExp(`compatibility provenance mode=${fixture.expectedMode}`));
    assert.match(text, /Never infer its original scan region from the current request, the user's location, or a default execution region/);
    assert.match(status.interpretationGuidance.statement, /use only persisted scanFrom and timestamps/);
    assert.doesNotThrow(() => mcpScanStatusOutputSchema.parse(status));

    const bundle = buildScanBundle({
      detail: "summary",
      evidence: null,
      findings: { type: "certscore_finding_list", scanId: "scan_provenance", findings: [] },
      preConsentCookiesTrackers: null,
      report: null,
      scan: {
        type: "certscore_scan",
        scanId: "scan_provenance",
        domain: "example.com",
        status: "completed",
        scanFrom: "eu_ie",
        createdAt: "2026-08-15T03:39:14.064Z",
        startedAt: "2026-08-15T03:39:14.064Z",
        completedAt: "2026-08-15T03:39:36.015Z",
        executionMode: fixture.executionMode,
        reused: fixture.reused
      }
    } as any);
    const bundleText = scanBundleText(bundle);
    assert.equal(bundle.scanFrom, "eu_ie");
    assert.equal(bundle.completedAt, "2026-08-15T03:39:36.015Z");
    assert.equal(bundle.provenance.mode, fixture.expectedMode);
    assert.equal(bundle.provenance.retrievalMode, "scan_id_lookup");
    assert.equal(bundle.provenance.creationDecision, fixture.executionMode);
    assert.equal(typeof bundle.provenance.scanAgeSeconds, "number");
    assert.match(bundleText, /scanFrom\/execution region=eu_ie/);
    assert.match(bundleText, /retrieval mode=scan_id_lookup/);
    assert.match(bundleText, new RegExp(`original creation decision=${fixture.executionMode}`));
    assert.match(bundleText, new RegExp(`compatibility provenance mode=${fixture.expectedMode}`));
    assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
  }
});

test("Light read projections report legacy missing provenance as unavailable without assigning a default region", () => {
  const status = withMcpScanProvenanceGuidance({
    type: "certscore_scan_job",
    jobId: "scan_legacy",
    scanId: "scan_legacy",
    status: "completed",
    scanFrom: null,
    createdAt: null,
    startedAt: null,
    completedAt: null
  }, "existing_scan_retrieved");
  const statusText = scanStatusText(status);
  const bundle = buildScanBundle({
    detail: "summary",
    evidence: null,
    findings: { type: "certscore_finding_list", scanId: "scan_legacy", findings: [] },
    preConsentCookiesTrackers: null,
    report: null,
    scan: {
      type: "certscore_scan",
      scanId: "scan_legacy",
      domain: "legacy.example",
      status: "completed"
    }
  } as any);
  const bundleText = scanBundleText(bundle);

  assert.equal(status.scanFrom, null);
  assert.equal(bundle.scanFrom, null);
  assert.deepEqual(
    {
      retrievalMode: status.provenance.retrievalMode,
      creationDecision: status.provenance.creationDecision,
      scanAgeSeconds: status.provenance.scanAgeSeconds
    },
    { retrievalMode: "scan_id_lookup", creationDecision: "unknown", scanAgeSeconds: null }
  );
  assert.deepEqual(
    {
      retrievalMode: bundle.provenance.retrievalMode,
      creationDecision: bundle.provenance.creationDecision,
      scanAgeSeconds: bundle.provenance.scanAgeSeconds
    },
    { retrievalMode: "scan_id_lookup", creationDecision: "unknown", scanAgeSeconds: null }
  );
  for (const text of [statusText, bundleText]) {
    assert.match(text, /scanFrom\/execution region=unavailable/);
    assert.match(text, /completedAt=unavailable; startedAt=unavailable; createdAt=unavailable/);
    assert.match(text, /retrieval mode=scan_id_lookup; original creation decision=unknown; scan age seconds=unavailable/);
    assert.match(text, /Never infer its original scan region from the current request, the user's location, or a default execution region/);
    assert.doesNotMatch(text, /scanFrom\/execution region=(eu_de|eu_ie|california)/);
  }
  assert.doesNotThrow(() => mcpScanStatusOutputSchema.parse(status));
  assert.doesNotThrow(() => mcpScanBundleOutputSchema.parse(bundle));
  assert.ok(bundleText.length <= 8_000);
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
  assert.match(text, /automated public-web observations for human and agentic review/i);
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

test("toToolError promotes typed creation quota details", () => {
  const creationRateLimit = {
    kind: "concurrency",
    limit: 4,
    remaining: 0,
    scope: "session",
    used: 4,
    windowId: "concurrent",
    windowSeconds: null
  };
  const result = toToolError(new CertScoreError("Wait", {
    code: "rate_limited",
    responseBody: { error: { creationRateLimit } },
    status: 429
  }));
  const payload = JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}") as {
    error?: { creationRateLimit?: unknown; recommendedNextAction?: string; retryAfterSeconds?: number | null };
  };
  assert.deepEqual(payload.error?.creationRateLimit, creationRateLimit);
  assert.equal(payload.error?.retryAfterSeconds, 30);
  assert.match(payload.error?.recommendedNextAction ?? "", /No scan was created/i);
  assert.match(payload.error?.recommendedNextAction ?? "", /contact support@certscore\.ai/i);
});

test("toToolError preserves the non-public target reason without exposing an address", () => {
  const result = toToolError(new CertScoreError("This target is not eligible for public website scanning.", {
    code: "invalid_url",
    responseBody: { error: { reasonCode: "non_public_target", retryable: false } },
    status: 400
  }));
  const payload = JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "{}") as {
    error?: { code?: string; reasonCode?: string | null; retryable?: boolean };
  };
  assert.deepEqual(payload.error, {
    code: "invalid_url",
    message: "This target is not eligible for public website scanning.",
    retryable: false,
    retryAfterSeconds: null,
    recommendedNextAction: "Correct the request using the error details, then retry only if the requested operation is still appropriate.",
    reasonCode: "non_public_target",
    name: "CertScoreError",
    status: 400,
    responseBody: { error: { reasonCode: "non_public_target", retryable: false } }
  });
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
    disclaimer: "Automated public-web observations for human and agentic review."
  };

  const result = boundEvidencePacket(payload, 20_000) as Record<string, unknown>;
  const metadata = result.mcpMetadata as Record<string, unknown>;

  assert.equal(result.scanId, "scan_123");
  assert.equal(metadata.truncated, true);
  assert.equal(metadata.maxSerializedChars, 20_000);
  assert.equal(typeof metadata.originalSerializedChars, "number");
  assert.ok(JSON.stringify(result).length <= 20_000);
});
