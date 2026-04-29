/**
 * Fixture-based tests for build-finding-corpus.ts
 * No live DB dependency.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreConfidence,
  scoreDirectness,
  evidenceRichness,
  hasCoverageIssues,
  getCoverageFlags,
  classifyChallengeStatus,
  mapConfidenceBand,
  mapDirectness,
  pickDiverse,
  buildPositiveExample,
  buildChallengeExample
} from "./build-finding-corpus";
import type { EnrichedFinding, ScanContext } from "./build-finding-corpus";

function makeScanContext(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    scanId: "scan-1",
    domain: "example.com",
    requestedUrl: "https://example.com",
    finalUrl: "https://example.com",
    createdAt: "2024-01-01T00:00:00Z",
    scannedAt: "2024-01-01T00:00:00Z",
    snapshot: {},
    runtimeArtifacts: null,
    unifiedFindings: [],
    executiveProjection: {
      surfacedPackets: [],
      findings: [],
      groupedFindings: [],
      posture: "Clear",
      topFindings: [],
      trace: { packets: [], surfacedPacketIds: [], projectedFindingIds: [], unmappedSurfacedPacketIds: [] }
    },
    regulatoryRisk: {},
    ...overrides
  };
}

function makePacket(overrides: Record<string, unknown> = {}) {
  return {
    unifiedFindingId: "test_finding",
    title: "Test Finding",
    summary: "Test summary",
    severity: "medium",
    confidenceBand: "moderate",
    primaryPageUrl: null,
    affectedPageCount: 1,
    confidenceInputs: {
      hasDirectRuntimeEvidence: false,
      evidenceQualityFlags: [],
      hasConcretePayloadEvidence: false,
      hasCorroboratedPositiveSurfaceEvidence: false,
      hasKeyPageDiscoveryEvidence: false,
      hasReadableSurfaceSnippetEvidence: false,
      hasMultipleHumanFacingUrls: false,
      hasPageAttribution: false,
      hasPacketBackedEvidence: false,
      hasPolicyTextEvidence: false,
      hasStructuredValidationEvidence: false,
      isFallbackOnly: false,
      issueCount: 0,
      signalCount: 0,
      sourceCount: 0,
      sourceKinds: [],
      validationCount: 0
    },
    categoryAlignments: [],
    sourceRefs: [],
    evidence: {},
    presentationDecision: { status: "surface", rationale: "", confidenceRationale: "", downgradeReasons: [], verificationLabel: "", verificationState: "verified" },
    surfacingDecision: { decisionState: "eligible", reportLane: "primary", eligibilityRationale: [] },
    observedValue: null,
    presentation: { name: "", description: "", severity: "medium" },
    linkedValidationFinding: null,
    ...overrides
  };
}

function makeEnrichedFinding(overrides: Partial<EnrichedFinding> = {}): EnrichedFinding {
  const packet = makePacket(overrides.packet ?? {});
  return {
    scanContext: makeScanContext(overrides.scanContext ?? {}),
    packet: packet as unknown as EnrichedFinding["packet"],
    executiveFinding: null,
    status: "surface",
    ...overrides
  };
}

describe("scoring helpers", () => {
  it("scoreConfidence ranks correctly", () => {
    assert.equal(scoreConfidence("strong"), 3);
    assert.equal(scoreConfidence("good"), 2);
    assert.equal(scoreConfidence("moderate"), 1);
    assert.equal(scoreConfidence("limited"), 1);
    assert.equal(scoreConfidence(""), 0);
  });

  it("scoreDirectness ranks correctly", () => {
    assert.equal(scoreDirectness("direct"), 3);
    assert.equal(scoreDirectness("mixed"), 2);
    assert.equal(scoreDirectness("inferred"), 1);
    assert.equal(scoreDirectness(""), 0);
  });

  it("evidenceRichness counts signals", () => {
    const packet = makePacket({
      evidence: {
        counts: { a: 1, b: 2 },
        snippets: ["s1", "s2"],
        entities: { vendors: ["v1"] },
        sourceUrls: ["u1"],
        pageUrls: ["p1"]
      },
      sourceRefs: [{ kind: "signal", key: "k" }]
    });
    const richness = evidenceRichness(packet as unknown as EnrichedFinding["packet"]);
    assert.equal(richness, 8); // 2 counts + 2 snippets + 1 entity + 1 sourceUrl + 1 pageUrl + 1 sourceRef
  });
});

describe("coverage helpers", () => {
  it("hasCoverageIssues detects partial scan", () => {
    const ctx = makeScanContext({ snapshot: { partial_scan: true } });
    assert.equal(hasCoverageIssues(ctx), true);
  });

  it("hasCoverageIssues detects blocked scan", () => {
    const ctx = makeScanContext({ snapshot: { blocked_flag: true } });
    assert.equal(hasCoverageIssues(ctx), true);
  });

  it("hasCoverageIssues returns false for clean scan", () => {
    const ctx = makeScanContext({ snapshot: { partial_scan: false, blocked_flag: false, redirect_count: 0 } });
    assert.equal(hasCoverageIssues(ctx), false);
  });

  it("getCoverageFlags captures multiple issues", () => {
    const ctx = makeScanContext({ snapshot: { partial_scan: true, blocked_flag: true, redirect_count: 3 } });
    const flags = getCoverageFlags(ctx);
    assert.ok(flags.includes("partial_scan"));
    assert.ok(flags.includes("blocked"));
    assert.ok(flags.some((f) => f.startsWith("redirected")));
  });
});

describe("classification helpers", () => {
  it("classifyChallengeStatus for suppressed", () => {
    const ef = makeEnrichedFinding({ status: "suppress" });
    assert.equal(classifyChallengeStatus(ef), "suppressed");
  });

  it("classifyChallengeStatus for audit_only", () => {
    const ef = makeEnrichedFinding({ status: "audit_only" });
    assert.equal(classifyChallengeStatus(ef), "downgraded");
  });

  it("classifyChallengeStatus for surfaced weak confidence", () => {
    const ef = makeEnrichedFinding({
      status: "surface",
      executiveFinding: { confidence: "moderate", directVsInferred: "direct" } as EnrichedFinding["executiveFinding"]
    });
    assert.equal(classifyChallengeStatus(ef), "weak_positive");
  });

  it("classifyChallengeStatus for surfaced inferred", () => {
    const ef = makeEnrichedFinding({
      status: "surface",
      executiveFinding: { confidence: "strong", directVsInferred: "inferred" } as EnrichedFinding["executiveFinding"]
    });
    assert.equal(classifyChallengeStatus(ef), "ambiguous_positive");
  });

  it("mapConfidenceBand works", () => {
    assert.equal(mapConfidenceBand("high"), "strong");
    assert.equal(mapConfidenceBand("moderate"), "good");
    assert.equal(mapConfidenceBand("low"), "limited");
    assert.equal(mapConfidenceBand(undefined), "limited");
  });

  it("mapDirectness works", () => {
    assert.equal(mapDirectness(true), "direct");
    assert.equal(mapDirectness(false), "inferred");
    assert.equal(mapDirectness(undefined), "inferred");
  });
});

describe("pickDiverse", () => {
  it("prefers different domains", () => {
    const candidates: EnrichedFinding[] = [
      makeEnrichedFinding({ scanContext: makeScanContext({ domain: "a.com" }) }),
      makeEnrichedFinding({ scanContext: makeScanContext({ domain: "a.com" }) }),
      makeEnrichedFinding({ scanContext: makeScanContext({ domain: "b.com" }) })
    ];
    const picked = pickDiverse(candidates, 2);
    assert.equal(picked.length, 2);
    const domains = new Set(picked.map((p) => p.scanContext.domain));
    assert.equal(domains.size, 2);
  });

  it("fills remaining slots when domains exhausted", () => {
    const candidates: EnrichedFinding[] = [
      makeEnrichedFinding({ scanContext: makeScanContext({ domain: "a.com" }) }),
      makeEnrichedFinding({ scanContext: makeScanContext({ domain: "a.com" }) })
    ];
    const picked = pickDiverse(candidates, 3);
    assert.equal(picked.length, 2);
  });
});

describe("buildPositiveExample", () => {
  it("produces correct shape for direct strong finding", () => {
    const ef = makeEnrichedFinding({
      status: "surface",
      executiveFinding: {
        id: "pre_consent_tracking_detected",
        label: "Tracking started before consent",
        section: "Privacy & Tracking",
        confidence: "strong",
        directVsInferred: "direct",
        defaultSurfacePriority: 100
      } as EnrichedFinding["executiveFinding"],
      packet: makePacket({
        unifiedFindingId: "preconsent_tracking",
        confidenceBand: "high",
        confidenceInputs: { hasDirectRuntimeEvidence: true } as unknown as EnrichedFinding["packet"]["confidenceInputs"],
        evidence: { counts: { requests: 5 }, snippets: ["snippet1"] }
      }) as unknown as EnrichedFinding["packet"]
    });
    const ex = buildPositiveExample(ef);
    assert.equal(ex.example_type, "positive");
    assert.equal(ex.finding_id, "pre_consent_tracking_detected");
    assert.equal(ex.confidence, "strong");
    assert.equal(ex.direct_vs_inferred, "direct");
    assert.ok(ex.evidence.counts.requests);
  });
});

describe("buildChallengeExample", () => {
  it("flags missing evidence for contradiction finding", () => {
    const ef = makeEnrichedFinding({
      status: "surface",
      executiveFinding: {
        id: "policy_behavior_contradiction_detected",
        label: "Policy behavior contradiction",
        confidence: "moderate",
        directVsInferred: "mixed"
      } as EnrichedFinding["executiveFinding"],
      packet: makePacket({
        unifiedFindingId: "policy_behavior_conflict",
        details: { family: "contradiction", kind: "tracking_claim_conflict" }
      }) as unknown as EnrichedFinding["packet"]
    });
    const ex = buildChallengeExample(ef);
    assert.equal(ex.example_type, "challenge");
    assert.ok(ex.evidence_missing.includes("policy_anchor"));
    assert.ok(ex.evidence_missing.includes("runtime_anchor"));
    assert.ok(ex.evidence_missing.includes("conflict_bridge"));
    assert.ok(ex.why_this_could_be_false_positive.includes("Contradiction finding lacks policy anchor"));
  });

  it("flags fingerprinting finding without multi-signal evidence", () => {
    const ef = makeEnrichedFinding({
      status: "surface",
      packet: makePacket({
        unifiedFindingId: "probable_fingerprinting",
        evidence: { counts: {} }
      }) as unknown as EnrichedFinding["packet"]
    });
    const ex = buildChallengeExample(ef);
    assert.ok(ex.evidence_missing.includes("multi_signal_fingerprinting_evidence"));
  });

  it("includes coverage flags for partial scan", () => {
    const ef = makeEnrichedFinding({
      status: "audit_only",
      scanContext: makeScanContext({ snapshot: { partial_scan: true } })
    });
    const ex = buildChallengeExample(ef);
    assert.ok(ex.coverage_flags.includes("partial_scan"));
    assert.ok(ex.known_limitations.some((l) => l.includes("partial_scan")));
  });

  it("handles malformed evidence object gracefully", () => {
    const ef = makeEnrichedFinding({
      status: "surface",
      packet: makePacket({ evidence: null as unknown as Record<string, unknown> }) as unknown as EnrichedFinding["packet"]
    });
    const ex = buildChallengeExample(ef);
    assert.equal(ex.example_type, "challenge");
    assert.ok(Array.isArray(ex.evidence_missing));
  });
});
