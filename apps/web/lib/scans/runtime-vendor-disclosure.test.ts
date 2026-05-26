import assert from "node:assert/strict";
import test from "node:test";

import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import { evaluateFindingEvidenceContractForRawEvidence } from "./finding-evidence-contracts";
import type { CertScoreFinding } from "./finding-registry";
import { selectTopFindings } from "./rank-findings";
import {
  evaluateRuntimeVendorDisclosureEvidence,
  RUNTIME_VENDOR_DISCLOSURE_ALIASES,
  RUNTIME_VENDOR_DISCLOSURE_SUBTYPE
} from "./runtime-vendor-disclosure";
import { buildUnifiedFindingPackets, type UnifiedFindingDisplayPacket } from "./unified-findings";

function runtimeVendorEvidence(overrides: Record<string, unknown> = {}) {
  return {
    subtype: RUNTIME_VENDOR_DISCLOSURE_SUBTYPE,
    parentFindingId: "cookie_disclosure_gap",
    observedRuntimeVendors: ["Meta"],
    observedRuntimeDomains: ["connect.facebook.net"],
    unmatchedRuntimeVendors: ["Meta"],
    unmatchedRuntimeDomains: ["connect.facebook.net"],
    policySurfacesSearched: [
      {
        type: "cookie_policy",
        url: "https://example.com/cookie-policy",
        reached: true,
        retainedEvidenceRef: "policy-enrichment-cookie-1",
        searchedTerms: ["Meta", "connect.facebook.net", "_fbp"],
        matchedVendorNames: ["Google Analytics"],
        unmatchedVendorNames: ["Meta"]
      }
    ],
    cookiePolicyUrl: "https://example.com/cookie-policy",
    matchedVendorDisclosureCount: 1,
    unmatchedVendorDisclosureCount: 1,
    mismatchRationale:
      "Runtime cookie/storage vendor Meta on connect.facebook.net did not clearly match retained cookie disclosure evidence.",
    coverageStatus: "usable",
    evidenceConfidence: "strong",
    directVsInferred: "direct",
    categories: ["advertising"],
    ...overrides
  };
}

function buildPackets(input: {
  evidence: Record<string, unknown>;
  signalKey?: string;
  unifiedFindingId?: string;
  label?: string;
}) {
  const signalKey = input.signalKey ?? "privacy.runtime_vendor_not_disclosed";
  const unifiedFindingId = input.unifiedFindingId ?? "cookie_disclosure_gap";
  return buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: input.label ?? "Runtime vendor disclosure alignment review",
        evidence: ["https://example.com/"],
        fallbackEvidence: {
          signalKey,
          signalValue: JSON.stringify(input.evidence),
          unifiedFindingId
        },
        observedValue: null,
        severity: "medium",
        signalKey,
        signalLabel: input.label ?? "Runtime vendor disclosure alignment review",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: input.label ?? "Runtime vendor disclosure alignment review"
      }
    ],
    validationFindings: []
  });
}

function displayPacketFromUnified(packet: ReturnType<typeof buildUnifiedFindingPackets>[number]): UnifiedFindingDisplayPacket {
  return {
    ...packet,
    linkedValidationFinding: null,
    observedValue: null,
    presentation: {
      findingName: packet.title,
      suggestedFix: "Review runtime vendors against retained disclosure surfaces.",
      whyThisMatters: packet.summary
    },
    presentationDecision: {
      confidenceRationale: "Retained runtime and disclosure-surface evidence was present.",
      downgradeReasons: [],
      rationale: "Runtime vendor disclosure alignment evidence retained.",
      status: "surface",
      verificationLabel: "Runtime",
      verificationState: "runtime"
    },
    referenceLabel: undefined,
    referenceUrl: undefined,
    sourceLabel: undefined,
    sourceUrl: undefined,
    surfacingDecision: {
      appliedRules: [],
      decisionReasons: [],
      decisionState: "confirmed",
      family: "rights_gap",
      policyVersion: "test",
      reportLane: "main",
      reportable: true,
      surfaceTier: "headline",
      supports: [],
      unifiedFindingId: packet.unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: true
    }
  };
}

function makeFinding(id: string, evidenceDetails?: CertScoreFinding["evidenceDetails"]): CertScoreFinding {
  return {
    id,
    label: id,
    section: "Privacy & Tracking",
    defaultSurfacePriority: 99,
    whyItMatters: "Test finding.",
    remediation: "Test remediation.",
    confidence: "strong",
    directVsInferred: "direct",
    evidenceDetails,
    evidencePreview: ["Evidence"],
    evidenceRefs: [],
    severity: "high",
    shortSummary: "Test summary."
  };
}

test("projects runtime vendor disclosure subtype through cookie disclosure gap parent", () => {
  const packets = buildPackets({ evidence: runtimeVendorEvidence() });
  const packet = packets.find((entry) => entry.unifiedFindingId === "cookie_disclosure_gap");
  assert.ok(packet);
  assert.equal(packet.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);

  assert.ok(packet.evidence);
  const contract = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", packet.evidence.entities);
  assert.equal(contract?.status, "pass_strong");

  const projection = projectExecutiveFindingsFromUnifiedPackets([displayPacketFromUnified(packet)]);
  const finding = projection.findings.find((entry) => entry.id === "cookie_disclosure_gap");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.runtimeVendorDisclosure?.subtype, RUNTIME_VENDOR_DISCLOSURE_SUBTYPE);
  assert.ok(finding.evidencePreview.some((entry) => /not clearly match retained disclosure evidence/i.test(entry)));
  assert.ok(projection.topFindings.some((entry) => entry.id === "cookie_disclosure_gap"));
});

test("recognizes WS01 namespaced runtime vendor disclosure signal keys", () => {
  const packets = buildPackets({
    evidence: runtimeVendorEvidence({
      signalKey: "privacy.runtime_vendor_not_disclosed",
      observedRuntimeVendors: ["Meta Pixel"],
      observedRuntimeDomains: [],
      unmatchedRuntimeVendors: ["Meta Pixel"],
      unmatchedRuntimeDomains: [],
      matchedVendorDisclosureCount: 0,
      unmatchedVendorDisclosureCount: 1,
      mismatchRationale: "Runtime vendor Meta Pixel did not clearly match retained cookie disclosure evidence.",
      categories: ["advertising"]
    }),
    signalKey: "privacy.runtime_vendor_not_disclosed"
  });

  const packet = packets.find((entry) => entry.unifiedFindingId === "cookie_disclosure_gap");
  assert.ok(packet?.evidence);
  const contract = evaluateFindingEvidenceContractForRawEvidence("cookie_disclosure_gap", packet.evidence.entities);
  assert.equal(contract?.status, "pass_strong");

  const projection = projectExecutiveFindingsFromUnifiedPackets(packets.map(displayPacketFromUnified));
  assert.ok(projection.topFindings.some((entry) => entry.id === "cookie_disclosure_gap"));
});

test("projects runtime vendor disclosure subtype through policy runtime alignment parent", () => {
  const evidence = runtimeVendorEvidence({
    parentFindingId: "policy_behavior_conflict",
    cookiePolicyUrl: undefined,
    privacyPolicyUrl: "https://example.com/privacy",
    policySurfacesSearched: [
      {
        type: "privacy_policy",
        url: "https://example.com/privacy",
        reached: true,
        retainedEvidenceRef: "policy-enrichment-privacy-1",
        searchedTerms: ["Meta", "connect.facebook.net"],
        unmatchedVendorNames: ["Meta"]
      }
    ]
  });
  const packets = buildPackets({
    evidence,
    signalKey: "disclosure.runtime_vendor_not_disclosed",
    unifiedFindingId: "policy_behavior_conflict"
  });
  const packet = packets.find((entry) => entry.unifiedFindingId === "policy_behavior_conflict");
  assert.ok(packet);
  assert.equal(packet.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);

  const projection = projectExecutiveFindingsFromUnifiedPackets([displayPacketFromUnified(packet)]);
  const finding = projection.findings.find((entry) => entry.id === "policy_behavior_contradiction_detected");
  assert.ok(finding);
  assert.equal(finding.evidenceDetails?.runtimeVendorDisclosure?.subtype, RUNTIME_VENDOR_DISCLOSURE_SUBTYPE);
  assert.match(finding.shortSummary, /not clearly reflected in retained public disclosure evidence/i);
});

test("does not externally surface runtime vendor disclosure subtype when policy surface is blocked", () => {
  const review = evaluateRuntimeVendorDisclosureEvidence({
    runtimeVendorDisclosureEvidence: [
      runtimeVendorEvidence({
        coverageStatus: "blocked",
        policySurfacesSearched: [{ type: "cookie_policy", url: "https://example.com/cookies", reached: false }]
      })
    ]
  });

  assert.notEqual(review.disposition, "eligible");
  assert.ok(review.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed"));
});

test("does not create runtime vendor disclosure subtype from request counts alone", () => {
  const review = evaluateRuntimeVendorDisclosureEvidence({
    runtimeVendorDisclosureEvidence: [
      {
        subtype: RUNTIME_VENDOR_DISCLOSURE_SUBTYPE,
        thirdPartyRequestCount: 75,
        observedRuntimeDomains: [],
        unmatchedRuntimeDomains: [],
        policySurfacesSearched: [],
        mismatchRationale: ""
      }
    ]
  });
  assert.notEqual(review.disposition, "eligible");

  const packets = buildPackets({
    evidence: {
      subtype: RUNTIME_VENDOR_DISCLOSURE_SUBTYPE,
      thirdPartyRequestCount: 75,
      observedRuntimeDomains: [],
      unmatchedRuntimeDomains: [],
      policySurfacesSearched: [],
      mismatchRationale: ""
    }
  });

  assert.equal(packets[0]?.concernContext?.externalSurfacingEligibilities.includes("eligible"), false);
});

test("demotes runtime vendor disclosure top card when stronger runtime finding uses same domain", () => {
  const disclosureFinding = makeFinding("cookie_disclosure_gap", {
    runtimeVendorDisclosure: {
      subtype: RUNTIME_VENDOR_DISCLOSURE_SUBTYPE,
      unmatchedDomains: ["sync.example-adtech.com"],
      unmatchedVendors: ["Example AdTech"],
      observedRuntimeDomains: ["sync.example-adtech.com"],
      policySurfacesSearched: [],
      mismatchRationale: "The runtime vendor did not clearly match retained disclosure evidence.",
      coverageStatus: "usable",
      evidenceConfidence: "strong",
      directVsInferred: "direct"
    }
  });
  const selected = selectTopFindings([
    disclosureFinding,
    makeFinding("rtb_cookie_sync_observed", {
      representativeRequests: [
        {
          category: "advertising",
          deviceDataLike: false,
          firstSeenMs: 100,
          hostname: "sync.example-adtech.com",
          identifierLike: true,
          preConsent: true,
          queryKeysSample: [],
          resourceType: "script",
          thirdParty: true,
          url: "https://sync.example-adtech.com/match",
          vendor: "Example AdTech"
        }
      ]
    })
  ]);

  assert.ok(selected.some((entry) => entry.id === "rtb_cookie_sync_observed"));
  assert.equal(selected.some((entry) => entry.id === "cookie_disclosure_gap"), false);
});

test("dedupes runtime vendor disclosure aliases into canonical subtype", () => {
  for (const alias of RUNTIME_VENDOR_DISCLOSURE_ALIASES) {
    const review = evaluateRuntimeVendorDisclosureEvidence({
      runtimeVendorDisclosureEvidence: [
        runtimeVendorEvidence({
          subtype: alias
        })
      ]
    });
    assert.equal(review.evidence[0]?.subtype, RUNTIME_VENDOR_DISCLOSURE_SUBTYPE);
    assert.equal(review.disposition, "eligible");
  }
});

test("runtime vendor disclosure public copy remains cautious", () => {
  const projection = projectExecutiveFindingsFromUnifiedPackets([
    displayPacketFromUnified(buildPackets({ evidence: runtimeVendorEvidence() })[0]!)
  ]);
  const finding = projection.findings.find((entry) => entry.id === "cookie_disclosure_gap");
  assert.ok(finding);
  const publicText = [
    finding.label,
    finding.shortSummary,
    finding.whyItMatters,
    finding.remediation,
    ...finding.evidencePreview
  ].join(" ");

  assert.doesNotMatch(publicText, /\billegal\b/i);
  assert.doesNotMatch(publicText, /\bviolation\b/i);
  assert.doesNotMatch(publicText, /\bnon-compliant\b/i);
  assert.doesNotMatch(publicText, /failed to disclose/i);
  assert.doesNotMatch(publicText, /undisclosed vendor/i);
});
