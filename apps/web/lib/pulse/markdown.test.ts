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
      summaryJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&detail=summary",
      evidenceJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_123&detail=evidence",
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
  assert.doesNotMatch(markdown, /## Accessibility signals/);
  assert.match(markdown, /## Disclosure and policy signals/);
  assert.match(markdown, /## Coverage and limitations/);
  assert.match(markdown, /automated runtime analysis of public websites/);
  assert.match(markdown, /No top automated findings were surfaced in this scan\./);
  assert.match(markdown, /Absence of findings does not mean absence of risk\./);
  assert.match(markdown, /support@certscore\.ai/);
  assert.match(markdown, /Scan ID: scan_123/);
  assert.match(markdown, /Immutable JSON: https:\/\/certscore\.ai\/api\/v1\/pulse\?scanId=scan_123/);
  assert.match(markdown, /Summary JSON: https:\/\/certscore\.ai\/api\/v1\/pulse\?scanId=scan_123&detail=summary/);
  assert.match(markdown, /Evidence JSON: https:\/\/certscore\.ai\/api\/v1\/pulse\?scanId=scan_123&detail=evidence/);
  assert.match(markdown, /API docs: https:\/\/certscore\.ai\/api-pulse/);
  assert.match(markdown, /Findings reference: https:\/\/certscore\.ai\/findings/);
  assert.match(markdown, /## Disclaimer/);
  assert.match(markdown, /not legal advice/);
  assert.doesNotMatch(markdown, /\bclean\b/i);
});

test("Pulse markdown renders full findings when full detail payload includes them", () => {
  const markdown = renderPulseMarkdown({
    meta: { detail: "full", generatedAt: "2026-05-18T23:15:32Z" },
    domain: "nbcnews.com",
    scanStatus: "completed",
    summary: { score: 66, riskLevel: "review_recommended", humanSummary: "Automated scan surfaced review signals." },
    topFindings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Third-party tracking observed before recorded consent",
        criticality: "high",
        confidence: "strong",
        evidence: { summary: "Runtime evidence was retained." }
      }
    ],
    findings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Third-party tracking observed before recorded consent",
        criticality: "high",
        confidence: "strong",
        evidence: { summary: "Runtime evidence was retained." }
      },
      {
        id: "device_identification_fingerprinting_signal",
        label: "Device identification / fingerprinting signal",
        criticality: "medium",
        confidence: "good",
        evidence: { summary: "Fingerprinting indicators were retained." }
      }
    ],
    reviewContext: { lenses: [] },
    coverage: { status: "partial", summary: "Automated public-web scan completed with partial coverage." },
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {},
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /## Automated findings/);
  assert.doesNotMatch(markdown, /## Highest-priority findings/);
  assert.match(markdown, /Third-party tracking observed before recorded consent/);
  assert.match(markdown, /Device identification \/ fingerprinting signal/);
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
  assert.equal((markdown.match(/CertScore outputs are automated public-web observations for review/g) ?? []).length, 1);
});

test("Pulse markdown leads with report-backed executive and GDPR/ePrivacy surfaced results", () => {
  const markdown = renderPulseMarkdown(
    {
      meta: { detail: "standard", generatedAt: "2026-07-02T01:44:00Z" },
      domain: "cnn.com",
      scanStatus: "completed",
      scan: { completedAt: "2026-07-02T01:43:47.684Z" },
      summary: {
        completionSummary: "CertScore.ai Pulse completed a scan of cnn.com.",
        score: 69,
        riskLevel: "review_recommended",
        humanSummary: "Automated scan surfaced review signals."
      },
      executiveSummary: {
        completionSummary: "CertScore.ai Pulse completed a scan of cnn.com.",
        issuesToReview: 6,
        thirdPartyRequests: 63,
        cookiesPreConsent: 43,
        consentPlatform: "OneTrust",
        trackerFootprint: { vendors: 19, domains: 35 }
      },
      surfacedResults: {
        gdprEprivacyFindings: [
          {
            label: "Reject / decline control",
            status: "A first-layer reject-all or equivalent refusal path was expected from the observed consent surface but was not retained."
          }
        ],
        preConsentTrackers: [
          { vendor: "Bombora Visitor Insights", purpose: "Advertising", firstSeenMs: 2308 },
          { vendor: "ScorecardResearch", purpose: "Audience measurement", firstSeenMs: 2326 }
        ]
      },
      topFindings: [],
      reviewContext: { lenses: [] },
      coverage: { status: "partial", summary: "Automated public-web scan completed with coverage limitations." },
      links: { fullReportUrl: "https://certscore.ai/scan/cb27f583-41c4-4b5b-985e-f2bd453d52c4" },
      feedback: {},
      disclaimer: PULSE_STANDARD_DISCLAIMER
    },
    { gptAction: true }
  );

  assert.match(markdown, /\| Issues to review \| 6 \|/);
  assert.match(markdown, /CertScore\.ai Pulse completed a scan of cnn\.com\./);
  assert.match(markdown, /Executive report: 69\/100; 6 issues to review; 63 third-party requests; 43 cookies pre-consent\./);
  assert.match(markdown, /Signal snapshot: consent platform OneTrust; tracker footprint 19 vendors, 35 domains\./);
  assert.match(markdown, /## Surfaced GDPR\/ePrivacy Results/);
  assert.match(markdown, /Reject \/ decline control - A first-layer reject-all or equivalent refusal path was expected/);
  assert.match(markdown, /Bombora Visitor Insights \(Advertising\); first seen 2.31s/);
  assert.match(markdown, /ScorecardResearch \(Audience measurement\); first seen 2.33s/);
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
        { name: "GDPR / ePrivacy", status: "clear", summary: "Consent timing, consent surface, and tracker behavior were reviewed within scan coverage." }
      ]
    },
    coverage: { status: "partial", summary: "Automated public-web scan completed with partial coverage." },
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {},
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /GDPR \/ ePrivacy review context: Consent timing, consent surface, and tracker behavior were reviewed within scan coverage\.[^\n]+No top automated findings surfaced/);
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
        reviewLenses: ["GDPR / ePrivacy"],
        evidence: { summary: "Runtime evidence was retained for review.", fullEvidenceUrl: "https://certscore.ai/scan/scan_123#finding" }
      }
    ],
    reviewContext: {
      lenses: [
        { name: "GDPR / ePrivacy", status: "clear", summary: "Consent timing, consent surface, and tracker behavior drive this review context." },
      ]
    },
    coverage: { status: "partial", summary: "Automated public-web scan completed with partial coverage." },
    links: { fullReportUrl: "https://certscore.ai/scan/scan_123" },
    feedback: {},
    disclaimer: PULSE_STANDARD_DISCLAIMER
  });

  assert.match(markdown, /\[GDPR \/ ePrivacy review context: Consent timing, consent surface, and tracker behavior drive this review context\.\]\(https:\/\/certscore\.ai\/scan\/scan_123#review-lens-gdpr-eprivacy\)/);
  assert.match(markdown, /GDPR \/ ePrivacy review context: Consent timing, consent surface, and tracker behavior drive this review context\.[^\n]+Review context retained/);
  assert.doesNotMatch(markdown, /Needs Work|: Clear/);
});
