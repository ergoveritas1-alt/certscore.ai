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
    domain: "kbdlab.io",
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
      jsonUrl: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io",
      immutableJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123",
      immutableMarkdownUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&format=markdown",
      immutableFullJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&detail=full",
      fullJsonUrl: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=full",
      docsUrl: "https://certscore.ai/api-pulse",
      findingsReferenceUrl: "https://certscore.ai/findings"
    },
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /^# CertScore Pulse/m);
  assert.match(markdown, /\| Domain \| kbdlab\.io \|/);
  assert.match(markdown, /\| High-priority findings \| 0 \|/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /## Highest-priority findings/);
  assert.match(markdown, /## Privacy and consent signals/);
  assert.match(markdown, /## Cookie and third-party request activity/);
  assert.match(markdown, /## Accessibility signals/);
  assert.match(markdown, /## Disclosure and trust signals/);
  assert.match(markdown, /## Coverage and limitations/);
  assert.match(markdown, /automated runtime analysis of public websites/);
  assert.match(markdown, /No top automated findings were surfaced in this scan\./);
  assert.match(markdown, /Absence of findings does not mean absence of risk\./);
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
    domain: "kbdlab.io",
    scanStatus: "completed",
    completedAt: "2026-05-18T23:15:31Z",
    summary: { score: 88, riskLevel: "monitor", humanSummary: "No major automated review signals were surfaced in this scan." },
    topFindings: [],
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {}
  });

  assert.match(markdown, /Scan completed: 2026-05-18T23:15:31Z/);
  assert.doesNotMatch(markdown, /Scan completed: Not available/);
});

test("Pulse markdown formats Date completedAt values before JSON serialization", () => {
  const markdown = renderPulseMarkdown({
    meta: { detail: "standard", generatedAt: "2026-05-18T23:15:32Z" },
    domain: "kbdlab.io",
    scanStatus: "completed",
    timestamps: {
      completedAt: new Date("2026-05-18T23:15:31.000Z")
    },
    summary: { score: 88, riskLevel: "monitor", humanSummary: "No major automated review signals were surfaced in this scan." },
    topFindings: [],
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {}
  });

  assert.match(markdown, /Scan completed: 2026-05-18T23:15:31.000Z/);
  assert.doesNotMatch(markdown, /Scan completed: Not available/);
});

test("GPT Action markdown uses GPT-safe no-finding copy and CertScore footer links", () => {
  const markdown = renderPulseMarkdown(
    {
      meta: { detail: "standard", generatedAt: "2026-05-18T23:15:32Z" },
      domain: "kbdlab.io",
      scanStatus: "completed",
      summary: { score: 88, riskLevel: "monitor", humanSummary: "Automated scan completed for the observed public surfaces." },
      topFindings: [],
      coverage: {
        status: "partial",
        summary: "Coverage was limited; absence of findings should not be interpreted as absence of risk.",
        limitations: ["Automated public-web scan only."]
      },
      links: {
        fullReportUrl: "https://certscore.ai/scan/scan_123",
        findingsReferenceUrl: "https://certscore.ai/guides/findings"
      },
      feedback: {},
      disclaimer: PULSE_STANDARD_DISCLAIMER
    },
    { gptAction: true }
  );

  assert.match(markdown, /No top automated findings were surfaced in this scan/);
  assert.match(markdown, /\*\*Coverage limitation:\*\*/);
  assert.match(markdown, /View this scan on CertScore: https:\/\/certscore\.ai\/scan\/scan_123/);
  assert.match(markdown, /Explore finding definitions: https:\/\/certscore\.ai\/findings/);
  assert.doesNotMatch(markdown, /guides\/findings/);
  assert.equal((markdown.match(/Findings reference:|Explore finding definitions:/g) ?? []).length, 1);
  assert.match(markdown, /Run another scan: https:\/\/certscore\.ai/);
  assert.equal((markdown.match(/## Disclaimer/g) ?? []).length, 1);
  assert.equal((markdown.match(/CertScore provides automated public-web observations for review/g) ?? []).length, 1);
});

test("Pulse markdown uses review-signal lens status labels", () => {
  const markdown = renderPulseMarkdown({
    meta: { detail: "standard", generatedAt: "2026-05-18T23:15:32Z" },
    domain: "kbdlab.io",
    scanStatus: "completed",
    summary: { score: 82, riskLevel: "monitor", humanSummary: "No major automated review signals were surfaced in this scan." },
    topFindings: [],
    reviewContext: {
      lenses: [
        { name: "CCPA / CPRA / CIPA", status: "needs_work", summary: "Third-party collection, privacy-choice, and disclosure posture may warrant review." },
        { name: "GDPR / ePrivacy", status: "clear", summary: "Consent timing, consent surface, and tracker behavior were reviewed within scan coverage." },
        { name: "FTC", status: "clear", summary: "Consumer-facing claims, tracking posture, and disclosure signals were reviewed within scan coverage." },
        { name: "DOJ / ADA accessibility", status: "action_needed", summary: "Automated accessibility checks surfaced items for review." }
      ]
    },
    coverage: { status: "partial", summary: "Automated public-web scan completed with partial coverage." },
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {},
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /CCPA \/ CPRA \/ CIPA review context: Third-party collection, privacy-choice, and disclosure posture may warrant review\.[^\n]+Review context retained/);
  assert.match(markdown, /GDPR \/ ePrivacy review context: Consent timing, consent surface, and tracker behavior were reviewed within scan coverage\.[^\n]+No top automated findings surfaced/);
  assert.match(markdown, /FTC review context: Consumer-facing claims, tracking posture, and disclosure signals were reviewed within scan coverage\.[^\n]+No top automated findings surfaced/);
  assert.match(markdown, /DOJ \/ ADA accessibility review context: Automated accessibility checks surfaced items for review\.[^\n]+Review recommended/);
  assert.doesNotMatch(markdown, /Needs Work|: Clear/);
});

test("Pulse markdown keeps lens labels cautious when surfaced findings reference the lens", () => {
  const markdown = renderPulseMarkdown({
    meta: { detail: "standard", generatedAt: "2026-05-18T23:15:32Z" },
    domain: "kbdlab.io",
    scanStatus: "completed",
    summary: { score: 72, riskLevel: "review_recommended", humanSummary: "Automated scan surfaced review signals." },
    topFindings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Third-party tracking observed before recorded consent",
        criticality: "high",
        confidence: "strong",
        reviewLenses: ["GDPR / ePrivacy", "CCPA / CPRA / CIPA", "FTC"],
        evidence: { summary: "Runtime evidence was retained for review.", fullEvidenceUrl: "https://certscore.ai/scan/scan_123#finding" }
      }
    ],
    reviewContext: {
      lenses: [
        { name: "CCPA / CPRA / CIPA", status: "clear", summary: "Third-party collection, privacy-choice, and disclosure posture drive this review context." },
        { name: "GDPR / ePrivacy", status: "clear", summary: "Consent timing, consent surface, and tracker behavior drive this review context." },
        { name: "FTC", status: "watch", summary: "Consumer-facing claims, tracking posture, and disclosure signals should be reviewed together." },
        { name: "DOJ / ADA accessibility", status: "clear", summary: "Automated accessibility signals are the main review area for this lens." }
      ]
    },
    coverage: { status: "partial", summary: "Automated public-web scan completed with partial coverage." },
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {},
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /CCPA \/ CPRA \/ CIPA review context: Third-party collection, privacy-choice, and disclosure posture drive this review context\.[^\n]+Review context retained/);
  assert.match(markdown, /\[GDPR \/ ePrivacy review context: Consent timing, consent surface, and tracker behavior drive this review context\.\]\(https:\/\/certscore\.ai\/scan\/scan_123#review-lens-gdpr-eprivacy\)/);
  assert.match(markdown, /\[FTC review context: Consumer-facing claims, tracking posture, and disclosure signals should be reviewed together\.\]\(https:\/\/certscore\.ai\/scan\/scan_123#review-lens-ftc\)/);
  assert.match(markdown, /GDPR \/ ePrivacy review context: Consent timing, consent surface, and tracker behavior drive this review context\.[^\n]+Review context retained/);
  assert.match(markdown, /FTC review context: Consumer-facing claims, tracking posture, and disclosure signals should be reviewed together\.[^\n]+Review context retained/);
  assert.match(markdown, /DOJ \/ ADA accessibility review context: Automated accessibility signals are the main review area for this lens\.[^\n]+No top automated findings surfaced/);
  assert.doesNotMatch(markdown, /Needs Work|: Clear/);
});
