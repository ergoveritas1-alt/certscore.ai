import type { DisplaySafeEvidenceExcerpt } from "@certscore/contracts";
import type {
  Wc01V2ShadowProjection,
  Wc01V2ShadowRow,
  Wc01V2ShadowVendorRef,
} from "./wc01-shadow-contract";

export function wc01V2AllowlistShadowFixture(
  rows: Wc01V2ShadowRow[],
): Wc01V2ShadowProjection {
  return {
    contractVersion: "wc01.v2_shadow_projection.1",
    source: {
      scanId: "scan_fixture",
      reviewId: "review_fixture",
      url: "https://example.test",
      projectionVersion: "certscore.v2.report_projection_draft.1",
    },
    rows,
    limitations: [],
    sanitizerWarnings: [],
    productionEligible: false,
  };
}

export function wc01V2AllowlistShadowRowFixture(
  input: Partial<Wc01V2ShadowRow> & {
    sourceFindingKey: string;
  },
): Wc01V2ShadowRow {
  const displaySafeExcerpts = input.evidence?.displaySafeExcerpts ?? [wc01V2AllowlistExcerptFixture()];
  const excerptIds = input.evidence?.excerptIds ?? displaySafeExcerpts.map((excerpt) => excerpt.excerptId);
  return {
    rowId: input.rowId ?? input.sourceFindingKey,
    sourceFindingKey: input.sourceFindingKey,
    category: input.category ?? "runtime",
    status: input.status ?? "observed",
    wc01AssessmentStatus: input.wc01AssessmentStatus ?? "checked",
    topFindingEligible: false,
    gapEligible: false,
    evidence: {
      excerptIds,
      sourceRefIds: input.evidence?.sourceRefIds ?? [`ref_${input.sourceFindingKey}`],
      displaySafeExcerpts,
      capped: input.evidence?.capped ?? false,
      omittedCount: input.evidence?.omittedCount ?? 0,
    },
    vendors: input.vendors ?? [wc01V2AllowlistVendorFixture()],
    confidence: {
      score: input.confidence?.score ?? 0.9,
      band: input.confidence?.band ?? "high",
      directVsInferred: input.confidence?.directVsInferred ?? "direct",
    },
    policy: {
      reviewOnlyReasons: input.policy?.reviewOnlyReasons ?? ["shadow_projection_only"],
      matchedCriteria: input.policy?.matchedCriteria ?? ["collection_endpoint_observed"],
      missingCorroborators: input.policy?.missingCorroborators ?? [],
      demotionReasons: input.policy?.demotionReasons ?? [],
    },
  };
}

export function wc01V2AllowlistExcerptFixture(
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
    displayValueRedacted: input.displayValueRedacted ?? "collector.example.test/collect",
    hostname: input.hostname ?? "collector.example.test",
    path: input.path ?? "/collect",
    queryParamNames: input.queryParamNames ?? [],
    cookieNames: input.cookieNames ?? [],
    headerNames: input.headerNames ?? [],
    vendorRef: input.vendorRef ?? "vendor_fixture",
    artifactRefs: input.artifactRefs ?? [],
    sensitivity: input.sensitivity ?? "safe",
    redactionReason: input.redactionReason,
    confidence: input.confidence ?? 0.9,
    directVsInferred: input.directVsInferred ?? "direct",
  };
}

export function wc01V2AllowlistVendorFixture(
  input: Partial<Wc01V2ShadowVendorRef> = {},
): Wc01V2ShadowVendorRef {
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
