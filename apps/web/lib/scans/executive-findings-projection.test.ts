import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRegulatoryLenses,
  buildRegulatoryLensesFromUnifiedPackets
} from "../../components/scans/executive-summary-card";
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
      summary: "High-risk financial product promotion language surfaced."
    })
  ]);

  assert.deepEqual(projection.findings.map((finding) => finding.id), [
    "leveraged_or_high_risk_product_promotion"
  ]);
  assert.deepEqual(projection.trace.unmappedSurfacedPacketIds, []);
});

test("projects representative accessibility packets into DOJ ADA regulatory lens", () => {
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
    }
  );

  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens?.minimal, undefined);
  assert.notEqual(adaLens?.ratingLabel, "Not applicable");
  assert.ok(adaLens?.findings.some((finding) => /automated wcag|representative accessibility/i.test(finding)));
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
