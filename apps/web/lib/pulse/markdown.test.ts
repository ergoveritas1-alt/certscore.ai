import assert from "node:assert/strict";
import test from "node:test";
import { PULSE_STANDARD_DISCLAIMER } from "./constants";
import { renderPulseMarkdown } from "./markdown";

test("Pulse markdown includes cautious no-finding copy, feedback, links, and disclaimer", () => {
  const markdown = renderPulseMarkdown({
    meta: {
      detail: "standard",
      generatedAt: "2026-05-18T23:15:32Z"
    },
    domain: "example.com",
    scanId: "scan_123",
    scanStatus: "completed",
    summary: {
      score: 92,
      riskLevel: "monitor",
      benchmark: "Reference / Long-tail",
      humanSummary: "No major automated review signals were surfaced in this scan."
    },
    topFindings: [],
    reviewContext: {
      lenses: []
    },
    evidenceHighlights: {
      trackerFootprint: { summary: "0 third-party domains observed; 0 classified tracker vendors identified." },
      policySurfaces: { summary: "0 policy URLs covered." },
      fingerprinting: { summary: "No probable fingerprinting detected. Related indicators, if present, are retained for review." },
      vendorMix: { summary: "No classified tracker vendor categories were available." }
    },
    coverage: {
      summary: "Automated public-web scan completed for the observed public surfaces.",
      limitations: [
        "Automated public-web scan only.",
        "Coverage may be affected by runtime conditions. Absence of findings should not be interpreted as absence of risk."
      ]
    },
    feedback: {
      feedbackUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123"
    },
    links: {
      fullReportUrl: "https://certscore.ai/scan/scan_123",
      jsonUrl: "https://certscore.ai/api/v1/pulse?url=https://example.com",
      immutableJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123",
      immutableMarkdownUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&format=markdown",
      immutableFullJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&detail=full",
      fullJsonUrl: "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=full",
      docsUrl: "https://certscore.ai/api-pulse",
      findingsReferenceUrl: "https://certscore.ai/findings"
    },
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /^# CertScore Pulse/m);
  assert.match(markdown, /\| Domain \| example\.com \|/);
  assert.match(markdown, /\| High-priority findings \| 0 \|/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Highest-priority findings/);
  assert.match(markdown, /## Privacy and consent signals/);
  assert.match(markdown, /## Cookie and third-party request activity/);
  assert.match(markdown, /## Accessibility signals/);
  assert.match(markdown, /## Disclosure and trust signals/);
  assert.match(markdown, /## Coverage and limitations/);
  assert.match(markdown, /automated runtime analysis of public websites/);
  assert.match(markdown, /No major automated review signals were surfaced in this scan\./);
  assert.match(markdown, /support@certscore\.ai/);
  assert.match(markdown, /Scan ID: scan_123/);
  assert.match(markdown, /Immutable JSON: https:\/\/certscore\.ai\/api\/v1\/pulse\?scanId=scan_123/);
  assert.match(markdown, /API docs: https:\/\/certscore\.ai\/api-pulse/);
  assert.match(markdown, /Findings reference: https:\/\/certscore\.ai\/findings/);
  assert.match(markdown, /## Disclaimer/);
  assert.match(markdown, /does not provide legal advice/);
  assert.doesNotMatch(markdown, /\bclean\b/i);
});

test("Pulse markdown uses available top-level completedAt before showing unavailable", () => {
  const markdown = renderPulseMarkdown({
    meta: { detail: "standard", generatedAt: "2026-05-18T23:15:32Z" },
    domain: "example.com",
    scanStatus: "completed",
    completedAt: "2026-05-18T23:15:31Z",
    summary: { score: 88, riskLevel: "monitor", humanSummary: "No major automated review signals were surfaced in this scan." },
    topFindings: [],
    links: {},
    feedback: {}
  });

  assert.match(markdown, /Scan completed: 2026-05-18T23:15:31Z/);
  assert.doesNotMatch(markdown, /Scan completed: Not available/);
});

test("Pulse markdown formats Date completedAt values before JSON serialization", () => {
  const markdown = renderPulseMarkdown({
    meta: { detail: "standard", generatedAt: "2026-05-18T23:15:32Z" },
    domain: "example.com",
    scanStatus: "completed",
    timestamps: {
      completedAt: new Date("2026-05-18T23:15:31.000Z")
    },
    summary: { score: 88, riskLevel: "monitor", humanSummary: "No major automated review signals were surfaced in this scan." },
    topFindings: [],
    links: {},
    feedback: {}
  });

  assert.match(markdown, /Scan completed: 2026-05-18T23:15:31.000Z/);
  assert.doesNotMatch(markdown, /Scan completed: Not available/);
});
