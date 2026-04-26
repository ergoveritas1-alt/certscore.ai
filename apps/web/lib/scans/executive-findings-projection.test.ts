import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRegulatoryLenses,
  buildRegulatoryLensesFromUnifiedPackets
} from "../../components/scans/executive-summary-card";
import { ADA_ACCESSIBILITY_FIXTURES } from "./ada-accessibility.fixtures";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function makePacket(
  unifiedFindingId: string,
  overrides: Partial<UnifiedFindingDisplayPacket> = {}
): UnifiedFindingDisplayPacket {
  return {
    affectedPageCount: 1,
    categoryAlignments: [],
    confidenceBand: "moderate",
    confidenceInputs: {
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: true,
      hasCorroboratedPositiveSurfaceEvidence: true,
      hasDirectRuntimeEvidence: true,
      hasKeyPageDiscoveryEvidence: true,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: true,
      hasPacketBackedEvidence: true,
      hasPolicyTextEvidence: false,
      hasReadableSurfaceSnippetEvidence: true,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 1,
      sourceCount: 1,
      sourceKinds: ["signal"],
      validationCount: 0
    },
    details: { family: "commercial", kind: unifiedFindingId },
    linkedValidationFinding: null,
    observedValue: null,
    presentation: {
      findingName: unifiedFindingId,
      suggestedFix: "test",
      whyThisMatters: "test"
    },
    presentationDecision: {
      confidenceRationale: "test",
      downgradeReasons: [],
      rationale: "test",
      status: "surface",
      verificationLabel: "Verified",
      verificationState: "verified"
    },
    primaryPageUrl: "https://example.com/",
    referenceLabel: undefined,
    referenceUrl: undefined,
    severity: "medium",
    sourceLabel: undefined,
    sourceRefs: [],
    sourceUrl: undefined,
    summary: `${unifiedFindingId} summary`,
    surfacingDecision: {
      decisionState: "confirmed",
      policyVersion: "test",
      reportLane: "main",
      reportable: true,
      supports: [],
      unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: false,
      appliedRules: [],
      decisionReasons: [],
      family: "commercial",
      surfaceTier: "headline"
    },
    title: unifiedFindingId,
    unifiedFindingId,
    ...overrides
  } satisfies UnifiedFindingDisplayPacket;
}

test("projects surfaced unified findings into executive findings and regulatory lenses", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      evidence: {
        counts: { preconsentViolationCount: 2 },
        entities: {
          runtimeVendors: ["Meta Pixel", "Google Analytics"],
          runtimeRequestUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
        },
        fetchQuality: null,
        flags: ["privacy.preconsent_tracking_detected"],
        pageUrls: ["https://example.com/"],
        snippets: ["Trackers fired before consent interaction."],
        sourceUrls: ["https://connect.facebook.net/en_US/fbevents.js"]
      },
      severity: "high",
      summary: "6 third-party requests fired before any consent action."
    }),
    makePacket("earnings_claim_without_adjacent_disclosure", {
      confidenceBand: "high",
      details: { family: "financial_promotion", kind: "earnings_claim_without_adjacent_disclosure" },
      severity: "high",
      summary: "Earnings claim surfaced without nearby disclosure."
    }),
    makePacket("policy_behavior_conflict", {
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      severity: "high",
      summary: "Observed runtime behavior appears to conflict with policy representations."
    }),
    makePacket("accept_more_prominent_than_reject", {
      details: { family: "consent_tracking", kind: "accept_more_prominent_than_reject" },
      summary: "Accept appears more prominent than reject."
    }),
    makePacket("leveraged_or_high_risk_product_promotion", {
      details: { family: "financial_promotion", kind: "leveraged_or_high_risk_product_promotion" },
      presentationDecision: {
        confidenceRationale: "test",
        downgradeReasons: [],
        rationale: "test",
        status: "audit_only",
        verificationLabel: "Discovered",
        verificationState: "discovered"
      },
      surfacingDecision: {
        decisionState: "support_only",
        policyVersion: "test",
        reportLane: "confidence_and_coverage",
        reportable: true,
        supports: [],
        unifiedFindingId: "leveraged_or_high_risk_product_promotion",
        usedFamilyDefault: false,
        usedFindingOverride: false,
        appliedRules: [],
        decisionReasons: [],
        family: "financial_promotion",
        surfaceTier: "support"
      },
      summary: "High-risk promotion retained only for audit."
    })
  ]);

  assert.deepEqual(
    projection.findings.map((finding) => finding.id).sort(),
    [
      "asymmetric_consent_ui",
      "earnings_claim_without_adjacent_disclosure",
      "policy_behavior_contradiction_detected",
      "pre_consent_tracking_detected"
    ]
  );
  assert.equal(projection.posture, "Action Needed");
  const preconsentFinding = projection.findings.find((finding) => finding.id === "pre_consent_tracking_detected");
  assert.deepEqual(preconsentFinding?.evidenceDetails?.runtimeVendors, ["Meta Pixel", "Google Analytics"]);
  assert.deepEqual(preconsentFinding?.evidenceDetails?.runtimeRequestUrls, ["https://connect.facebook.net/en_US/fbevents.js"]);
  assert.deepEqual(preconsentFinding?.evidenceDetails?.counts, { preconsentViolationCount: 2 });
  assert.ok(
    projection.topFindings.every((finding) => projection.findings.some((candidate) => candidate.id === finding.id))
  );
  assert.ok(!projection.findings.some((finding) => finding.id === "leveraged_or_high_risk_product_promotion"));
  assert.deepEqual(
    projection.trace.packets.map((packet) => ({
      executiveFindingId: packet.executiveFindingId,
      inExecutiveFindings: packet.inExecutiveFindings,
      inRegulatoryLensInput: packet.inRegulatoryLensInput,
      status: packet.presentationStatus,
      unifiedFindingId: packet.unifiedFindingId
    })),
    [
      {
        executiveFindingId: "pre_consent_tracking_detected",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "preconsent_tracking"
      },
      {
        executiveFindingId: "earnings_claim_without_adjacent_disclosure",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "earnings_claim_without_adjacent_disclosure"
      },
      {
        executiveFindingId: "policy_behavior_contradiction_detected",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "policy_behavior_conflict"
      },
      {
        executiveFindingId: "asymmetric_consent_ui",
        inExecutiveFindings: true,
        inRegulatoryLensInput: true,
        status: "surface",
        unifiedFindingId: "accept_more_prominent_than_reject"
      }
    ]
  );

  const financialLens = buildRegulatoryLenses(projection.findings, {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 6
  }).find((lens) => lens.acronym === "Financial & commercial claims");

  assert.ok(financialLens);
  assert.equal(financialLens?.minimal, undefined);
  assert.equal(financialLens?.ratingLabel, "Watch");
  assert.match(financialLens?.summary ?? "", /High-confidence claims or earnings language surfaced/i);
});

test("projects surfaced scanner-level financial promotion into executive findings without validation rows", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("leveraged_or_high_risk_product_promotion", {
      details: { family: "financial_promotion", kind: "leveraged_or_high_risk_product_promotion" },
      evidence: {
        counts: {},
        entities: {
          pageUrls: ["https://example.com/sportsbook"]
        },
        fetchQuality: null,
        flags: ["financial.leveraged_or_high_risk_product_promotion"],
        pageUrls: ["https://example.com/sportsbook"],
        snippets: ["Sportsbook promotion language appeared on a wagering product page."],
        sourceUrls: ["https://example.com/sportsbook"]
      },
      summary: "High-risk financial product promotion language surfaced."
    })
  ]);

  assert.deepEqual(projection.findings.map((finding) => finding.id), [
    "leveraged_or_high_risk_product_promotion"
  ]);
  assert.deepEqual(projection.findings[0]?.evidenceDetails?.sourceUrls, ["https://example.com/sportsbook"]);
  assert.deepEqual(projection.findings[0]?.evidenceDetails?.evidenceSnippets, [
    "Sportsbook promotion language appeared on a wagering product page."
  ]);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
});

test("keeps runtime-backed session recording in top findings when consent issues also surface", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("preconsent_tracking", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "preconsent_tracking" },
      severity: "high",
      summary: "Tracking started before consent."
    }),
    makePacket("fingerprinting_observed", {
      details: { family: "consent_tracking", kind: "fingerprinting_observed" },
      severity: "high",
      summary: "Probable fingerprinting behavior."
    }),
    makePacket("policy_behavior_conflict", {
      details: { family: "contradiction", kind: "policy_behavior_conflict" },
      severity: "high",
      summary: "Policy and runtime behavior conflict."
    }),
    makePacket("accept_more_prominent_than_reject", {
      details: { family: "consent_tracking", kind: "accept_more_prominent_than_reject" },
      summary: "Consent choices appear imbalanced."
    }),
    makePacket("session_replay_observed", {
      confidenceBand: "high",
      details: { family: "consent_tracking", kind: "session_replay_observed" },
      evidence: {
        counts: {},
        entities: {
          runtimeVendors: ["Microsoft Clarity"]
        },
        fetchQuality: null,
        flags: ["privacy.session_replay_runtime_vendors"],
        pageUrls: [],
        snippets: [],
        sourceUrls: []
      },
      observedValue: "Microsoft Clarity",
      presentationDecision: {
        confidenceRationale: "Runtime vendor provenance retained.",
        downgradeReasons: [],
        rationale: "Direct runtime evidence retained a session-recording vendor.",
        status: "surface",
        verificationLabel: "Runtime",
        verificationState: "runtime"
      },
      severity: "medium",
      summary: "Microsoft Clarity session recording was observed."
    })
  ]);

  const topFindingIds = projection.topFindings.map((finding) => finding.id);
  assert.ok(topFindingIds.includes("session_recording_services_detected"));
  assert.ok(
    topFindingIds.indexOf("session_recording_services_detected") <
      topFindingIds.indexOf("asymmetric_consent_ui")
  );
  assert.equal(
    projection.topFindings.find((finding) => finding.id === "session_recording_services_detected")?.shortSummary,
    "Microsoft Clarity session recording was observed during runtime collection."
  );
});

test("projects concrete session replay vendor evidence into executive finding json", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("session_replay_observed", {
      confidenceBand: "moderate",
      details: {
        family: "consent_tracking",
        kind: "session_replay_observed",
        requestUrls: ["https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"],
        vendors: ["Qualtrics SiteIntercept"]
      },
      evidence: {
        counts: {},
        entities: {
          runtimeVendors: ["Qualtrics SiteIntercept"]
        },
        fetchQuality: null,
        flags: ["privacy.session_replay_runtime_detected", "privacy.session_replay_runtime_vendors"],
        pageUrls: [],
        snippets: [],
        sourceUrls: ["https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"]
      },
      observedValue: "Yes",
      presentationDecision: {
        confidenceRationale: "Runtime vendor provenance retained.",
        downgradeReasons: [],
        rationale: "Direct runtime evidence retained a session-recording vendor.",
        status: "surface",
        verificationLabel: "Runtime",
        verificationState: "runtime"
      },
      sourceRefs: [
        {
          kind: "signal",
          key: "privacy.session_replay_runtime_detected",
          label: "Session replay runtime detected",
          source: "snapshot_signal"
        }
      ],
      summary: "Session replay runtime detected."
    })
  ]);

  const finding = projection.topFindings.find((candidate) => candidate.id === "session_recording_services_detected");

  assert.deepEqual(finding?.evidenceDetails?.runtimeVendors, ["Qualtrics SiteIntercept"]);
  assert.deepEqual(finding?.evidenceDetails?.runtimeRequestUrls, [
    "https://siteintercept.qualtrics.com/WRSiteInterceptEngine/?Q_ZID=ZN_abc"
  ]);
  assert.ok(finding?.evidencePreview.includes("Runtime vendor: Qualtrics SiteIntercept"));
  assert.equal(
    finding?.shortSummary,
    "Qualtrics SiteIntercept session recording was observed during runtime collection."
  );
});

test("projects representative accessibility packets into DOJ ADA regulatory lens", () => {
  const seriousExampleCount = ADA_ACCESSIBILITY_FIXTURES.seriousAxeExample.accessibilityRuleExamples.length;
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makePacket("accessibility_risk_score", {
        details: {
          family: "accessibility",
          kind: "accessibility_risk_score",
          ruleExamples: ["color-contrast"]
        },
        evidence: {
          counts: {},
          entities: {},
          fetchQuality: null,
          flags: ["representative_accessibility_examples_retained"],
          pageUrls: ["https://example.com/"],
          snippets: ["color-contrast on https://example.com/ (.hero-title)"],
          sourceUrls: []
        },
        summary: "Representative accessibility barriers were retained from axe examples."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    },
    {
      accessibilitySignals: {
        wcagErrorCountTotal: seriousExampleCount
      }
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, undefined);
  assert.notEqual(adaLens?.ratingLabel, "Not applicable");
  assert.ok(adaLens?.findings.some((finding) => /automated wcag|representative accessibility/i.test(finding)));
});

test("keeps DOJ ADA regulatory lens minimal for score-only accessibility packets", () => {
  const lenses = buildRegulatoryLensesFromUnifiedPackets(
    [
      makePacket("accessibility_risk_score", {
        details: {
          family: "accessibility",
          kind: "accessibility_risk_score"
        },
        evidence: {
          counts: {},
          entities: {},
          fetchQuality: null,
          flags: [],
          pageUrls: [ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.pageUrl],
          snippets: [`Accessibility risk score: ${ADA_ACCESSIBILITY_FIXTURES.scoreOnlySnapshot.value}.`],
          sourceUrls: []
        },
        presentationDecision: {
          confidenceRationale: "Score-only accessibility signal remains audit-only.",
          downgradeReasons: ["No representative axe examples were retained."],
          rationale: "Score-only accessibility signal remains audit-only.",
          status: "audit_only",
          verificationLabel: "Audit only",
          verificationState: "triage"
        },
        summary: "Automated accessibility score was retained without representative axe examples."
      })
    ],
    {
      beforeConsentCookieCount: 0,
      thirdPartyRequestCount: 0
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, true);
  assert.equal(adaLens?.ratingLabel, "Audit-only");
  assert.equal(adaLens?.score, null);
});

test("records surfaced packets that are not yet mapped into executive findings", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    makePacket("some_unmapped_surface", {
      details: { family: "context", kind: "some_unmapped_surface" }
    })
  ]);

  assert.deepEqual(projection.findings, []);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, ["some_unmapped_surface"]);
});
