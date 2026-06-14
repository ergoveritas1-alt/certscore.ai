import type {
  DirectVsInferred,
  DisplaySafeEvidenceExcerpt,
} from "@certscore/contracts";
import type {
  V2ConfidenceBand,
  V2FindingCategory,
  V2ProjectionStatus,
  V2ReportProjectionDraft,
  V2ReportProjectionRow,
  V2SafeVendorRef,
} from "../index";

export function wc01ShadowProjectionFixture(
  rows: V2ReportProjectionRow[],
): V2ReportProjectionDraft {
  return {
    projectionVersion: "certscore.v2.report_projection_draft.1",
    generatedAt: "2026-06-08T00:00:00.000Z",
    sourceReviewId: "review_fixture",
    scanId: "scan_fixture",
    url: "https://example.test",
    reviewedAt: "2026-06-08T00:00:00.000Z",
    sourceBundleSchemaVersion: "certscore.v2.alpha.1",
    rows,
    wc01CompatibleRows: [],
    coverageLimitations: rows.flatMap((item) => item.coverageLimitations),
    moduleRunContext: [],
    notes: [
      "Internal v2 adapter draft only. Not integrated with production report UI.",
    ],
  };
}

export function wc01ShadowRowFixture(input: {
  findingKey: string;
  status: V2ProjectionStatus;
  category?: V2FindingCategory;
  title?: string;
  confidence?: number;
  confidenceBand?: V2ConfidenceBand;
  directVsInferred?: DirectVsInferred;
  relatedVendors?: V2SafeVendorRef[];
  displaySafeExcerpts?: DisplaySafeEvidenceExcerpt[];
  sourceEvidenceRefs?: V2ReportProjectionRow["sourceEvidenceRefs"];
  evidenceExcerptIds?: string[];
  matchedCriteria?: string[];
  missingCorroborators?: string[];
  demotionReasons?: string[];
  coverageLimitations?: V2ReportProjectionRow["coverageLimitations"];
  sourceModulesRequired?: string[];
  sourceModulesPresent?: string[];
  moduleRunStatus?: "completed" | "failed" | "partial" | "skipped_budget" | "not_testable";
}): V2ReportProjectionRow {
  const displaySafeExcerpts = input.displaySafeExcerpts ?? [wc01ShadowDisplaySafeExcerptFixture()];
  const evidenceExcerptIds = input.evidenceExcerptIds ?? displaySafeExcerpts.map((excerpt) => excerpt.excerptId);
  const sourceEvidenceRefs = input.sourceEvidenceRefs ?? [{ refId: `ref_${input.findingKey}` }];
  const sourceModulesRequired = input.sourceModulesRequired ?? ["preConsentRuntimeScanner"];
  const sourceModulesPresent = input.sourceModulesPresent ?? sourceModulesRequired;
  return {
    findingKey: input.findingKey,
    title: input.title ?? input.findingKey.replace(/_/g, " "),
    category: input.category ?? "runtime",
    status: input.status,
    statusLabel: input.status,
    tone: input.status === "review_signal" || input.status === "assisted_candidate" ? "review" : "neutral",
    eligibility: { status: "eligible", reasons: ["fixture"] },
    confidence: input.confidence ?? 0.86,
    confidenceBand: input.confidenceBand ?? "high",
    directVsInferred: input.directVsInferred ?? "direct",
    sourceModulesRequired,
    sourceModulesPresent,
    coverageLimitations: input.coverageLimitations ?? [],
    matchedCriteria: input.matchedCriteria ?? ["fixture_observed"],
    missingCorroborators: input.missingCorroborators ?? [],
    demotionReasons: input.demotionReasons ?? [],
    relatedVendors: input.relatedVendors ?? [],
    evidenceExcerptIds,
    sourceEvidenceRefs,
    evidencePacket: {
      evidenceExcerptIds,
      sourceEvidenceRefs,
      displaySafeExcerpts,
      displaySafeExcerptStats: {
        originalCount: displaySafeExcerpts.length,
        projectedCount: displaySafeExcerpts.length,
        omittedCount: 0,
        maxPerRow: 5,
        capped: false,
        deduped: false,
        representativeGroupKeys: ["fixture"],
      },
      artifactRefs: [],
      relatedVendors: input.relatedVendors ?? [],
      moduleRunContext: [{
        moduleName: sourceModulesRequired[0] ?? "preConsentRuntimeScanner",
        status: input.moduleRunStatus ?? "completed",
        durationMs: 10,
        errorCount: input.moduleRunStatus && input.moduleRunStatus !== "completed" ? 1 : 0,
      }],
      limitations: input.coverageLimitations ?? [],
      redactionPolicy: "display_safe_excerpts_only",
    },
  };
}

export function wc01ShadowDisplaySafeExcerptFixture(
  input: Partial<DisplaySafeEvidenceExcerpt> = {},
): DisplaySafeEvidenceExcerpt {
  return {
    excerptId: input.excerptId ?? "excerpt_fixture",
    sourceEventId: input.sourceEventId ?? "event_fixture",
    sourceEventType: input.sourceEventType ?? "network_request",
    sourceScanner: input.sourceScanner ?? "pre_consent_runtime",
    scenario: input.scenario ?? "fresh_pre_consent",
    consentStateAtTime: input.consentStateAtTime ?? "pre_consent",
    pagePhase: input.pagePhase ?? "initial_navigation",
    observedAtMs: input.observedAtMs ?? 1,
    evidenceKind: input.evidenceKind ?? "network_request",
    displayLabel: input.displayLabel ?? "Collection endpoint request",
    displayValueRedacted: input.displayValueRedacted ?? "collector.example.test/collect?cid=<redacted>",
    hostname: input.hostname ?? "collector.example.test",
    path: input.path ?? "/collect",
    queryParamNames: input.queryParamNames ?? ["cid"],
    cookieNames: input.cookieNames ?? [],
    headerNames: input.headerNames ?? [],
    vendorRef: input.vendorRef ?? "vendor_fixture",
    artifactRefs: input.artifactRefs ?? [],
    sensitivity: input.sensitivity ?? "redacted",
    redactionReason: input.redactionReason ?? "query values omitted",
    confidence: input.confidence ?? 0.86,
    directVsInferred: input.directVsInferred ?? "direct",
  };
}

export function wc01ShadowVendorFixture(
  input: Partial<V2SafeVendorRef> = {},
): V2SafeVendorRef {
  const purpose = input.purpose ?? "advertising";
  return {
    observationId: input.observationId ?? `vendor_${purpose}`,
    entity: input.entity ?? input.vendor ?? "Example Vendor",
    vendor: input.vendor ?? "Example Vendor",
    product: input.product,
    purpose,
    confidence: input.confidence ?? 0.9,
    basis: input.basis ?? ["fixture_vendor_mapping"],
    regulatoryRelevance: input.regulatoryRelevance ?? ["runtime_diagnostic"],
  };
}
