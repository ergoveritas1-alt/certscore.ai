import assert from "node:assert/strict";
import test from "node:test";
import {
  REGULATORY_FINDING_IDS,
  REGULATORY_REVIEW_FIXTURES,
  buildCustomerFacingRegulatoryReviewOutput,
  buildEvidenceRefs,
  computeFindingConfidence,
  detectClaimBehaviorGaps,
  finalizeFinding,
  generateAllRegulatoryFindings,
  sanitizeFindingObject,
  sanitizeProhibitedLanguage,
  toCustomerFacingFinding,
  validateFindingSchema,
  validateNoProhibitedLanguage,
  type RegulatoryReviewArtifacts
} from "./index";

function getValidFixture(id: keyof typeof REGULATORY_REVIEW_FIXTURES, index = 0) {
  const finding = REGULATORY_REVIEW_FIXTURES[id].valid[index];
  assert.ok(finding, `Expected valid fixture ${String(id)} at index ${index}`);
  return finding;
}

function makeMethodology(scanRunId: string) {
  return {
    browserProfileType: "fresh" as const,
    browserSignalTesting: {
      comparedAgainstControl: true,
      enabled: true,
      signalTypesTested: ["Global Privacy Control"]
    },
    consentStateReset: true,
    evidenceCollection: {
      cookieDiffingEnabled: true,
      domSnapshotsCaptured: true,
      networkLoggingEnabled: true,
      screenshotsCaptured: true,
      storageWriteTrackingEnabled: true
    },
    generatedAt: "2026-03-22T12:00:00.000Z",
    pageSelection: {
      discoveredPages: ["https://example.com/privacy", "https://example.com/checkout"],
      keyFlowsTested: ["https://example.com/checkout"],
      legalPagesTested: ["https://example.com/privacy", "https://example.com/accessibility"],
      seedPages: ["https://example.com"]
    },
    scanRunId
  };
}

test("schema validation fails when evidence is missing for a surface finding", () => {
  const finding = getValidFixture("privacy.ca.privacy_policy_surface_missing");
  const result = validateFindingSchema({
    ...finding,
    evidence: buildEvidenceRefs({ pageUrls: ["https://example.com/privacy"] })
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /screenshot or DOM evidence/i);
});

test("schema validation fails when limitations are missing", () => {
  const finding = getValidFixture("privacy.ca.opt_out_surface_missing");
  const result = validateFindingSchema({
    ...finding,
    limitations: []
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /array must contain at least 1 element|required/i);
});

test("schema validation fails when claim type is invalid", () => {
  const finding = getValidFixture("privacy.ca.browser_signal_not_evident");
  const result = validateFindingSchema({
    ...finding,
    claimType: "legal_conclusion" as never
  });

  assert.equal(result.ok, false);
});

test("prohibited language sanitizer rewrites replaceable language and rejects verdict language", () => {
  const rewritten = sanitizeProhibitedLanguage("The site appears compliant based on the scan.");
  assert.equal(rewritten.rejected, false);
  assert.match(rewritten.sanitizedText, /aligned/i);

  const rejected = sanitizeProhibitedLanguage("This violates the law.");
  assert.equal(rejected.rejected, true);
});

test("finding validation rejects framework compliance and scope claims", () => {
  const finding = getValidFixture("accessibility.eu.claim_gap");
  const result = validateNoProhibitedLanguage({
    ...finding,
    summary: "The site is WCAG compliant and clearly in-scope."
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /prohibited|in scope/i);
});

test("customer-facing output remains sanitized", () => {
  const finding = getValidFixture("privacy.state.disclosure_behavior_gap");
  const surfaced = toCustomerFacingFinding({
    ...finding,
    summary: "The site appears compliant based on the scan."
  });

  assert.ok(surfaced);
  assert.doesNotMatch(surfaced.summary, /\bcompliant\b/i);
});

test("confidence scoring returns high when multiple evidence types and repeatability support the claim", () => {
  const finding = getValidFixture("privacy.ca.pre_choice_tracking_observed");
  const result = computeFindingConfidence(
    {
      claimType: finding.claimType,
      observations: finding.observations,
      reproduction: {
        comparedAgainstControl: true,
        repeatability: "consistent",
        sessionCount: 2,
        testConditions: ["Two repeated public sessions."]
      }
    },
    finding.evidence
  );

  assert.equal(result.confidence, "high");
});

test("confidence scoring returns low for heuristic-only evidence", () => {
  const finding = getValidFixture("privacy.ca.user_confirmation_not_evident");
  const result = computeFindingConfidence(
    {
      claimType: finding.claimType,
      observations: ["UI may have rendered incompletely."],
      reproduction: {
        repeatability: "not_retested",
        sessionCount: 1,
        testConditions: ["Single incomplete render."]
      }
    },
    buildEvidenceRefs({
      pageUrls: ["https://example.com/preferences"],
      sessionLogs: [
        {
          eventType: "heuristic",
          id: "heuristic-log",
          message: "Single weak heuristic signal only.",
          timestamp: "2026-03-22T12:00:00.000Z"
        }
      ]
    })
  );

  assert.equal(result.confidence, "low");
});

test("contradiction detection requires claim text and behavior evidence", () => {
  const gaps = detectClaimBehaviorGaps(
    [
      {
        id: "claim-1",
        kind: "privacy",
        pageUrl: "https://example.com/privacy",
        sourceUrl: "https://example.com/privacy",
        surface: "privacy_policy",
        text: "We honor browser-based opt-out signals.",
        timestamp: "2026-03-22T12:00:00.000Z"
      }
    ],
    [
      {
        contradictsClaim: true,
        evidenceRefs: ["net-1"],
        id: "behavior-1",
        keyFlow: false,
        kind: "privacy",
        pageUrl: "https://example.com",
        signal: "browser_signal_not_honored",
        summary: "No visible change was observed after the tested browser signal was enabled.",
        timestamp: "2026-03-22T12:01:00.000Z"
      }
    ]
  );

  assert.equal(gaps.length, 1);

  const withoutClaimText = detectClaimBehaviorGaps(
    [
      {
        id: "claim-2",
        kind: "privacy",
        pageUrl: "https://example.com/privacy",
        sourceUrl: "https://example.com/privacy",
        surface: "privacy_policy",
        text: "",
        timestamp: "2026-03-22T12:00:00.000Z"
      }
    ],
    [
      {
        contradictsClaim: true,
        evidenceRefs: ["net-1"],
        id: "behavior-2",
        kind: "privacy",
        pageUrl: "https://example.com",
        signal: "browser_signal_not_honored",
        summary: "No visible change was observed after the tested browser signal was enabled.",
        timestamp: "2026-03-22T12:01:00.000Z"
      }
    ]
  );

  assert.equal(withoutClaimText.length, 0);
});

test("fixture validation covers every launch finding ID", () => {
  assert.deepEqual(Object.keys(REGULATORY_REVIEW_FIXTURES).sort(), [...REGULATORY_FINDING_IDS].sort());

  for (const findingId of REGULATORY_FINDING_IDS) {
    const fixtureSet = REGULATORY_REVIEW_FIXTURES[findingId];
    assert.ok(fixtureSet.valid.length >= 2, `${findingId} should have high and medium valid fixtures`);
    assert.ok(fixtureSet.invalid.length >= 1, `${findingId} should have an invalid fixture`);

    for (const finding of fixtureSet.valid) {
      const finalized = finalizeFinding(finding);
      assert.equal(finalized.validation.ok, true, `${findingId} valid fixture should pass`);
      assert.equal(validateNoProhibitedLanguage(finalized.finding).ok, true, `${findingId} valid fixture should pass language guardrails`);
    }

    for (const finding of fixtureSet.invalid) {
      const sanitized = sanitizeFindingObject(finding);
      const finalized = finalizeFinding(finding);
      assert.equal(sanitized.rejected || !finalized.validation.ok, true, `${findingId} invalid fixture should fail`);
    }
  }
});

test("generator emits only validated findings for the scoped modules", () => {
  const artifacts: RegulatoryReviewArtifacts = {
    accessibilityIssues: [
      {
        id: "acc-1",
        impact: "serious",
        keyFlow: true,
        pageUrl: "https://example.com/checkout",
        summary: "Checkout form input is missing an accessible label.",
        timestamp: "2026-03-22T12:02:00.000Z"
      }
    ],
    behaviors: [
      {
        contradictsClaim: true,
        evidenceRefs: ["network-1"],
        id: "behavior-1",
        kind: "privacy",
        pageUrl: "https://example.com",
        signal: "tracking_before_choice",
        summary: "A third-party analytics request was observed before a privacy choice interaction.",
        timestamp: "2026-03-22T12:01:00.000Z"
      }
    ],
    claims: [
      {
        id: "claim-1",
        kind: "privacy",
        pageUrl: "https://example.com/privacy",
        sourceUrl: "https://example.com/privacy",
        surface: "privacy_policy",
        text: "We honor browser-based opt-out signals.",
        timestamp: "2026-03-22T12:00:00.000Z"
      }
    ],
    comparedAgainstControl: true,
    evidence: buildEvidenceRefs({
      domSnapshots: [
        {
          excerpt: "We honor browser-based opt-out signals.",
          id: "dom-1",
          pageUrl: "https://example.com/privacy",
          selector: "main p",
          timestamp: "2026-03-22T12:00:00.000Z"
        }
      ],
      networkEvents: [
        {
          category: "analytics",
          id: "network-1",
          method: "GET",
          pageUrl: "https://example.com",
          phase: "before_choice",
          requestUrl: "https://analytics.example-vendor.test/collect",
          timestamp: "2026-03-22T12:01:00.000Z",
          vendor: "Example Analytics"
        }
      ],
      pageUrls: ["https://example.com", "https://example.com/privacy", "https://example.com/checkout"],
      screenshots: [
        {
          id: "shot-1",
          pageUrl: "https://example.com",
          timestamp: "2026-03-22T12:00:00.000Z",
          url: "https://evidence.certscore.test/shot-1.png"
        }
      ],
      sessionLogs: [
        {
          eventType: "scan_observation",
          id: "log-1",
          message: "Pre-choice tracking was observed.",
          pageUrl: "https://example.com",
          timestamp: "2026-03-22T12:01:00.000Z"
        }
      ]
    }),
    methodology: makeMethodology("scan-generated"),
    pageUrls: ["https://example.com", "https://example.com/privacy", "https://example.com/checkout"],
    repeatability: "consistent",
    sessionCount: 2,
    surfaces: [
      {
        detected: false,
        evidence: buildEvidenceRefs({
          pageUrls: ["https://example.com"],
          screenshots: [
            {
              id: "surface-shot",
              pageUrl: "https://example.com",
              timestamp: "2026-03-22T12:00:00.000Z",
              url: "https://evidence.certscore.test/surface-shot.png"
            }
          ]
        }),
        surfaceKey: "privacy_policy",
        timestamp: "2026-03-22T12:00:00.000Z"
      },
      {
        detected: false,
        evidence: buildEvidenceRefs({
          pageUrls: ["https://example.com"],
          screenshots: [
            {
              id: "surface-shot-2",
              pageUrl: "https://example.com",
              timestamp: "2026-03-22T12:00:00.000Z",
              url: "https://evidence.certscore.test/surface-shot-2.png"
            }
          ]
        }),
        surfaceKey: "accessibility_statement",
        timestamp: "2026-03-22T12:00:00.000Z"
      }
    ],
    testConditions: ["Public, non-authenticated scan with compared control and signal-enabled sessions."]
  };

  const findings = generateAllRegulatoryFindings(artifacts);
  assert.ok(findings.length >= 3);
  findings.forEach((finding) => {
    const finalized = finalizeFinding(finding);
    assert.equal(finalized.validation.ok, true);
  });

  const customerFacing = buildCustomerFacingRegulatoryReviewOutput({
    findings,
    methodology: artifacts.methodology,
    methodologySummary: "Observable evidence only."
  });
  assert.ok(customerFacing.findings.length > 0);
});
