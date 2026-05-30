import assert from "node:assert/strict";
import test from "node:test";
import { explainFinding, exportFindings } from "./tools.js";
import type { PulseResult } from "@certscore/sdk";

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
