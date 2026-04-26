import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanReportUnifiedFindings,
  selectOwnerUnifiedFindingsForSection,
  type ScanReportUnifiedFindingState
} from "./scan-report-unified-findings";
import { buildReviewFindings, buildSectionReviewIssues } from "./scan-report-review-findings";
import { buildSupplementalRuntimeUnifiedFindingPackets } from "./supplemental-runtime-unified-findings";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";

function packet(id: string, categoryId: string, relation: "owner" | "mirror" | "overlay") {
  return {
    categoryAlignments: [{ evidenceCategoryId: categoryId, relation }],
    unifiedFindingId: id
  };
}

test("selectOwnerUnifiedFindingsForSection keeps only owner-aligned packets", () => {
  const findings = [
    packet("owned", "tracking", "owner"),
    packet("mirrored", "tracking", "mirror"),
    packet("other", "financial", "owner")
  ];

  assert.deepEqual(
    selectOwnerUnifiedFindingsForSection(findings as never, new Set(["tracking"])).map((finding) => finding.unifiedFindingId),
    ["owned"]
  );
});

test("buildScanReportUnifiedFindings dedupes owner packets across section drafts", () => {
  const owned = packet("owned", "tracking", "owner");
  const state: ScanReportUnifiedFindingState = {
    derivedContext: {
      accessibilityIssueRows: [],
      accessibilityRuleEvidenceRows: [],
      consentAuditFindings: [],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      prioritizedAccessibilityRuleRows: [],
      scanReportReviewIssues: [],
      taxonomySnapshotSections: []
    },
    globalUnifiedFindings: [owned, packet("mirrored", "tracking", "mirror")] as never,
    sectionDrafts: [
      { sections: [{ sectionCategoryIds: new Set(["tracking"]) }] },
      { sections: [{ sectionCategoryIds: new Set(["tracking"]) }] }
    ]
  };

  assert.deepEqual(
    buildScanReportUnifiedFindings(state).map((finding) => finding.unifiedFindingId),
    ["owned"]
  );
});

test("report-level candidates surface runtime-backed session replay provenance", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        categoryId: "adtech_analytics_replay_footprint",
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          runtimeVendors: ["Microsoft Clarity"],
          session_replay_runtime_detected: true,
          session_replay_runtime_vendors: ["Microsoft Clarity"],
          signalKey: "commerce.session_replay_tool_detected",
          signalValue: true
        },
        observedValue: "Microsoft Clarity",
        severity: "high",
        signalKey: "commerce.session_replay_tool_detected",
        signalLabel: "Session replay tool detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Session replay tool detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "session_replay_observed");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "review");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
});

test("session replay snapshot signal retains persisted tracker vendor provenance", () => {
  const candidates = buildReviewFindings({
    issues: [],
    prioritizedAccessibilityRuleRows: [],
    sectionId: "tracking_third_party_ecosystem",
    sectionItems: [
      {
        key: "commerce.session_replay_tool_detected",
        label: "Session replay tool detected",
        relation: "primary",
        source: "snapshot_signal",
        value: true
      }
    ],
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestObservations: [],
        requestToVendorObservations: []
      }
    },
    trackerVendors: [
      {
        beforeConsent: true,
        collectionEndpointType: "first_party_collection_proxy",
        confidence: 0.95,
        detectionSource: "request",
        firstPartyOrThirdParty: "first_party",
        matchedSignatureId: "fullstory",
        scriptHost: "www.draftkings.com",
        vendorCategory: "session_replay",
        vendorName: "FullStory"
      }
    ]
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "session_replay_observed");

  assert.deepEqual(packet?.evidence?.entities?.runtimeVendors, ["FullStory"]);
  assert.deepEqual(packet?.evidence?.entities?.runtimeRequestUrls, ["https://www.draftkings.com"]);
  assert.ok(packet?.evidence?.flags?.includes("commerce.session_replay_tool_detected"));
});

test("initial cookie inventory routes to audit-only preconsent packet instead of raw executive bridge", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      initial_cookie_domains: [".example.com"],
      initial_cookie_names: ["__cf_bm", "kndctr_16AD4362526701720A490D45_AdobeOrg_identity"]
    },
    scanReportReviewIssues: [],
    sectionId: "tracking_third_party_ecosystem",
    snapshot: {
      final_url: "https://www.example.com/",
      registered_domain: "example.com"
    }
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: issues.map((issue) => ({
      description: issue.description,
      evidence: issue.evidence ?? [],
      fallbackEvidence: issue.fallbackEvidence,
      observedValue: issue.evidence?.[0] ?? null,
      severity: issue.severity,
      sourceType: "issue",
      title: issue.title
    })),
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "preconsent_tracking");

  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.equal(packet?.concernContext?.externalSurfacingEligibilities.includes("audit_only"), true);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_concrete_preconsent_artifact"), true);
  assert.equal(packet?.evidence?.entities?.preconsent_cookie_names?.includes("kndctr_16AD4362526701720A490D45_AdobeOrg_identity"), true);
});

test("high-risk gambling section review retains concrete offer and disclosure adjacency evidence", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      rendered_text:
        `DraftKings Sportsbook. Get $1,000 in bonus bets when you sign up today. Start betting now. ${"Featured games and league content. ".repeat(30)} Responsible gaming resources are available in the footer. Terms and conditions apply on a separate promotions page.`,
      third_party_request_domains: ["www.draftkings.com"]
    },
    scanReportReviewIssues: [],
    sectionId: "high_risk_product_marketing_disclosures",
    snapshot: {
      final_url: "https://www.draftkings.com/",
      registered_domain: "draftkings.com"
    }
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: issues.map((issue) => ({
      description: issue.description,
      evidence: issue.evidence ?? [],
      fallbackEvidence: issue.fallbackEvidence,
      observedValue: issue.evidence?.[0] ?? null,
      severity: issue.severity,
      sourceType: "issue",
      title: issue.title
    })),
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "leveraged_or_high_risk_product_promotion");

  assert.ok(packet?.evidence?.entities?.offerSnippets?.some((snippet) => snippet.includes("$1,000 in bonus bets")));
  assert.deepEqual(packet?.evidence?.entities?.responsibleGamblingDisclosureAdjacent, ["false"]);
  assert.deepEqual(packet?.evidence?.entities?.termsDisclosureAdjacent, ["false"]);
});

test("high-risk gambling section review retains concrete offer from page evidence rows", () => {
  const issues = buildSectionReviewIssues({
    accessibilityIssueRows: [],
    consentAuditFindings: [],
    pageEvidenceRows: [
      {
        evidence_id: "home-offer-1",
        matched_text: "Get $1,000 in bonus bets when you sign up today.",
        page_url: "https://www.draftkings.com/"
      }
    ],
    policyBehaviorContradictions: [],
    preconsentViolationRows: [],
    runtimeArtifacts: {
      third_party_request_domains: ["www.draftkings.com"]
    },
    scanReportReviewIssues: [],
    sectionId: "high_risk_product_marketing_disclosures",
    snapshot: {
      final_url: "https://www.draftkings.com/",
      registered_domain: "draftkings.com"
    }
  });
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: issues.map((issue) => ({
      description: issue.description,
      evidence: issue.evidence ?? [],
      fallbackEvidence: issue.fallbackEvidence,
      observedValue: issue.evidence?.[0] ?? null,
      severity: issue.severity,
      sourceType: "issue",
      title: issue.title
    })),
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "leveraged_or_high_risk_product_promotion");

  assert.ok(packet?.evidence?.entities?.offerSnippets?.some((snippet) => snippet.includes("$1,000 in bonus bets")));
});

test("supplemental runtime request evidence still promotes through unified packets", () => {
  const [packet] = buildSupplementalRuntimeUnifiedFindingPackets({
    disclaimer: "",
    hostname: "example.com",
    issueCounts: { high: 0, medium: 0, low: 0 },
    normalizedUrl: "https://www.example.com/",
    sampleFindings: [],
    summaryBullets: [],
    supplementalEvidence: {
      source: "supplemental_public_runtime",
      sourceLabel: "Supplemental public runtime evidence",
      entities: {
        cookieNames: ["_ga"],
        requestUrls: ["https://metrics.example.net/collect"],
        technologyNames: ["Google Analytics"]
      }
    },
    version: "preview-v1"
  });

  assert.equal(packet?.unifiedFindingId, "preconsent_tracking");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "confirmed");
  assert.equal(packet?.details?.family, "consent_tracking");
  assert.deepEqual(packet?.details?.requestUrls, ["https://metrics.example.net/collect"]);
  assert.equal(packet?.evidence?.entities?.preconsent_cookie_names?.includes("_ga"), true);
});
