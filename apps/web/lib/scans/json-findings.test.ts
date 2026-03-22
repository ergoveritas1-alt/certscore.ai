import assert from "node:assert/strict";
import test from "node:test";
import { mapFindingsForJsonView } from "../../app/app/scans/[scanId]/json/findings";

test("maps every finding row for the JSON view without collapsing duplicates", () => {
  const findings = mapFindingsForJsonView({
    domainHostname: "example.com",
    findings: [
      {
        evidence: {
          preconsent_tracker_vendors: ["Meta Pixel"]
        },
        id: "a",
        pageUrl: "https://example.com",
        ruleKey: "privacy.preconsent_tracker_vendors",
        severity: "high",
        title: "Pre-consent tracker vendors"
      },
      {
        evidence: {
          runtimeEvidence: ["third-party requests fired during initial page load"]
        },
        id: "b",
        pageUrl: "https://example.com",
        ruleKey: "privacy.preconsent_tracking_detected",
        severity: "high",
        title: "Pre-consent tracking detected"
      },
      {
        evidence: null,
        id: "c",
        pageUrl: null,
        ruleKey: "accessibility.wcag_error_count_total",
        severity: "medium",
        title: "WCAG errors"
      }
    ]
  });

  assert.equal(findings.length, 3);
  assert.deepEqual(
    findings.map((finding) => finding.id),
    ["a", "b", "c"]
  );
  assert.equal(findings[0]?.pageLabel, "https://example.com");
  assert.equal(findings[2]?.pageLabel, "example.com");

  const firstSummary = JSON.parse(findings[0]?.summaryJson ?? "{}");
  assert.equal(
    firstSummary.observation,
    "The scan saw tracking vendors before a clear consent choice, including Meta Pixel."
  );

  const thirdSummary = JSON.parse(findings[2]?.summaryJson ?? "{}");
  assert.equal(
    thirdSummary.observation,
    "The automated accessibility check found WCAG issues that could affect how people use the site."
  );
});
