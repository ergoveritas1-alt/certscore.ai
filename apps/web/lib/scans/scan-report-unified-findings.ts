import {
  REPORT_PRIMARY_PILLARS,
  getReportEvidenceCategoriesForSection,
  getReportSectionsForPillar,
  getReportSignalsForEvidenceCategory,
  type ReportEvidenceCategoryDefinition,
  type ReportPrimaryPillarDefinition,
  type ReportSectionDefinition,
  type ReportSignalDefinition
} from "@website-signal-risk-scanner/shared";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { buildValidationFindingLookup, type ScanValidationFinding } from "./validation-review-linking";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export type CanonicalReviewIssue = {
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  linkedValidationRuleKeys?: string[];
  severity: "high" | "medium" | "low";
  title: string;
};

export type CanonicalReviewFinding = {
  categoryId?: string;
  description: string;
  evidence?: string[];
  fallbackEvidence?: Record<string, unknown>;
  id: string;
  linkedValidationFinding?: ScanValidationFinding | null;
  observedValue: string | null;
  severity: "high" | "medium" | "low";
  signalKey?: string;
  signalLabel?: string;
  signalSource?: ReportSignalDefinition["source"];
  sourceType: "issue" | "signal";
  title: string;
};

export type CanonicalSignalItem = {
  key: string;
  label: string;
  relation: "primary" | "secondary" | "overlay";
  source: ReportSignalDefinition["source"];
  value: unknown;
};

export type ScanReportUnifiedFindingSectionDraft = {
  categories?: Array<{
    category: ReportEvidenceCategoryDefinition;
    emptySignalCount?: number;
    items: CanonicalSignalItem[];
    reviewFindings: CanonicalReviewFinding[];
  }>;
  issueFindings?: CanonicalReviewFinding[];
  pillar?: ReportPrimaryPillarDefinition;
  section?: ReportSectionDefinition;
  sectionCategoryIds: Set<string>;
};

export type ScanReportUnifiedFindingState = {
  allReviewFindingCandidates?: CanonicalReviewFinding[];
  globalUnifiedFindings: UnifiedFindingDisplayPacket[];
  sectionDrafts: Array<{
    pillar?: ReportPrimaryPillarDefinition;
    sections: ScanReportUnifiedFindingSectionDraft[];
  }>;
};

export type ScanReportUnifiedFindingStateDependencies = {
  buildReviewFindings: (input: {
    allSignals?: Array<{ key: string; value: unknown }>;
    categoryId?: string;
    issues: CanonicalReviewIssue[];
    mergedSignals?: ScanDetailResponse["mergedSignals"];
    policyEnrichment?: Array<Record<string, unknown>>;
    prioritizedAccessibilityRuleRows: unknown[];
    runtimeArtifacts?: Record<string, unknown> | null;
    snapshot?: Record<string, unknown> | null;
    sectionId: string;
    sectionItems: CanonicalSignalItem[];
    validationFindingLookup?: Map<string, ScanValidationFinding>;
  }) => CanonicalReviewFinding[];
  buildSectionReviewIssues: (input: {
    accessibilityIssueRows: unknown[];
    consentAuditFindings: unknown[];
    policyBehaviorContradictions: unknown[];
    preconsentViolationRows: unknown[];
    runtimeArtifacts: Record<string, unknown> | null;
    scanReportReviewIssues: Array<{
      description: string;
      key: string;
      pageType: string;
      pageUrl: string | null;
      reason: string;
      reviewStatus: string;
      reviewVerdict: unknown;
      summary: unknown;
    }>;
    sectionId: string;
    snapshot: Record<string, unknown>;
  }) => CanonicalReviewIssue[];
  deriveAccessibilityIssueRows: (snapshot: Record<string, unknown>) => unknown[];
  deriveAccessibilityRuleEvidenceRows: (input: {
    examples: NonNullable<ScanDetailResponse["accessibilityRuleExamples"]>;
    ruleCounts: NonNullable<ScanDetailResponse["accessibilityRuleCounts"]>;
  }) => Array<{ weightedPriority: number }>;
  deriveConsentAuditFindings: (
    snapshot: Record<string, unknown> | null,
    runtimeArtifacts: Record<string, unknown> | null
  ) => unknown[];
  derivePolicyBehaviorContradictions: (input: {
    mergedSignals: ScanDetailResponse["mergedSignals"];
    primaryPolicyEnrichment: ScanDetailResponse["primaryPolicyEnrichment"];
    policyEnrichments: ScanDetailResponse["policyEnrichment"];
    preconsentViolations: unknown[];
    runtimeArtifacts: Record<string, unknown> | null;
    snapshot: Record<string, unknown> | null;
    trackerVendors: ScanDetailResponse["trackerVendors"];
  }) => unknown[];
  derivePreconsentViolationRows: (input: {
    persistedViolations: ScanDetailResponse["preconsentViolations"];
    runtimeArtifacts: Record<string, unknown> | null;
    trackerVendors: ScanDetailResponse["trackerVendors"];
  }) => unknown[];
  filterContradictoryPositiveSurfaceFindings: (findings: UnifiedFindingDisplayPacket[]) => UnifiedFindingDisplayPacket[];
  formatReviewIssueDescription: (reason: string) => string;
  getReportSignalValue: (input: {
    mergedSignals?: ScanDetailResponse["mergedSignals"];
    policyEnrichment: ScanDetailResponse["policyEnrichment"];
    runtimeArtifacts: Record<string, unknown> | null;
    signals: ScanDetailResponse["signals"];
    snapshot: Record<string, unknown> | null;
    signal: ReportSignalDefinition;
  }) => unknown;
  isSignalValuePopulated: (key: string, value: unknown) => boolean;
};

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildScanReportUnifiedFindingState(
  scanRecord: ScanDetailResponse,
  dependencies: ScanReportUnifiedFindingStateDependencies
): ScanReportUnifiedFindingState {
  const snapshot = scanRecord.snapshot;
  if (!snapshot) {
    return {
      allReviewFindingCandidates: [],
      globalUnifiedFindings: [],
      sectionDrafts: []
    };
  }

  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const policyEnrichmentById = new Map(scanRecord.policyEnrichment.map((row) => [String(row.id ?? ""), row]));
  const scanReportReviewIssues = scanRecord.policyReviewQueue.map((row, index) => {
    const enrichment = policyEnrichmentById.get(String(row.policyEnrichmentId ?? row.policy_enrichment_id ?? "")) ?? null;

    return {
      description: dependencies.formatReviewIssueDescription(String(row.reason ?? "")),
      key: String(row.id ?? `${row.reason ?? "review"}-${index}`),
      pageType: String(enrichment?.pageType ?? enrichment?.page_type ?? "unknown"),
      pageUrl:
        typeof (enrichment?.pageUrl ?? enrichment?.page_url) === "string"
          ? String(enrichment?.pageUrl ?? enrichment?.page_url)
          : null,
      reason: String(row.reason ?? ""),
      reviewStatus: String(row.reviewStatus ?? row.review_status ?? "pending"),
      reviewVerdict: row.reviewVerdict ?? row.review_verdict ?? null,
      summary: enrichment?.policySummaryShort ?? enrichment?.policy_summary_short ?? null
    };
  });
  const preconsentViolationRows = dependencies.derivePreconsentViolationRows({
    persistedViolations: scanRecord.preconsentViolations,
    runtimeArtifacts,
    trackerVendors: scanRecord.trackerVendors
  });
  const policyBehaviorContradictions = dependencies.derivePolicyBehaviorContradictions({
    mergedSignals: scanRecord.mergedSignals,
    primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment,
    policyEnrichments: scanRecord.policyEnrichment,
    preconsentViolations: preconsentViolationRows,
    runtimeArtifacts,
    snapshot,
    trackerVendors: scanRecord.trackerVendors
  });
  const consentAuditFindings = dependencies.deriveConsentAuditFindings(snapshot, runtimeArtifacts);
  const accessibilityIssueRows = dependencies.deriveAccessibilityIssueRows(snapshot);
  const accessibilityRuleEvidenceRows = dependencies.deriveAccessibilityRuleEvidenceRows({
    examples: scanRecord.accessibilityRuleExamples ?? [],
    ruleCounts: scanRecord.accessibilityRuleCounts ?? []
  });
  const prioritizedAccessibilityRuleRows = [...accessibilityRuleEvidenceRows]
    .sort((left, right) => right.weightedPriority - left.weightedPriority)
    .slice(0, 6);
  const validationFindingLookup = buildValidationFindingLookup(scanRecord.validationFindings);
  const sectionDrafts = REPORT_PRIMARY_PILLARS.map((pillar) => {
    const sections = getReportSectionsForPillar(pillar.id).map((section) => {
      const sectionCategoryIds = new Set(getReportEvidenceCategoriesForSection(section.id).map((category) => category.id));
      const categories = getReportEvidenceCategoriesForSection(section.id).map((category) => {
        const items = getReportSignalsForEvidenceCategory(category.id)
          .map(({ relation, signal }) => ({
            key: signal.key,
            label: signal.label,
            relation,
            source: signal.source,
            value: dependencies.getReportSignalValue({
              mergedSignals: scanRecord.mergedSignals,
              policyEnrichment: scanRecord.policyEnrichment,
              runtimeArtifacts: scanRecord.runtimeArtifacts,
              signals: scanRecord.signals,
              snapshot: scanRecord.snapshot,
              signal
            })
          }))
          .filter((item) => dependencies.isSignalValuePopulated(item.key, item.value))
          .sort((left, right) => {
            const relationOrder = { primary: 0, secondary: 1, overlay: 2 } as const;
            return relationOrder[left.relation] - relationOrder[right.relation] || left.label.localeCompare(right.label);
          });

        const reviewFindings = dependencies.buildReviewFindings({
          allSignals: scanRecord.signals,
          categoryId: category.id,
          issues: [],
          mergedSignals: scanRecord.mergedSignals,
          policyEnrichment: scanRecord.policyEnrichment,
          prioritizedAccessibilityRuleRows,
          runtimeArtifacts: scanRecord.runtimeArtifacts,
          snapshot,
          sectionId: section.id,
          sectionItems: items,
          validationFindingLookup
        });

        return {
          category,
          emptySignalCount: getReportSignalsForEvidenceCategory(category.id).length - items.length,
          items,
          reviewFindings
        };
      });

      const issues = dependencies.buildSectionReviewIssues({
        accessibilityIssueRows,
        consentAuditFindings,
        policyBehaviorContradictions,
        preconsentViolationRows,
        runtimeArtifacts,
        scanReportReviewIssues,
        sectionId: section.id,
        snapshot
      });
      const issueFindings = dependencies.buildReviewFindings({
        allSignals: scanRecord.signals,
        issues,
        mergedSignals: scanRecord.mergedSignals,
        policyEnrichment: scanRecord.policyEnrichment,
        prioritizedAccessibilityRuleRows,
        runtimeArtifacts: scanRecord.runtimeArtifacts,
        snapshot,
        sectionId: section.id,
        sectionItems: [],
        validationFindingLookup
      });

      return {
        categories,
        issueFindings,
        pillar,
        section,
        sectionCategoryIds
      };
    });

    return { pillar, sections };
  });

  const allReviewFindingCandidates = sectionDrafts.flatMap(({ sections }) =>
    sections.flatMap((section) => [
      ...section.categories.flatMap((category) => category.reviewFindings),
      ...section.issueFindings
    ])
  );
  const globalUnifiedFindings = dependencies.filterContradictoryPositiveSurfaceFindings(buildUnifiedFindingDisplayPackets({
    coverageSummary: {
      legalCoverageScore: getFiniteNumber(scanRecord.snapshot?.legal_coverage_score),
      pagesScanned: getFiniteNumber(scanRecord.snapshot?.pages_scanned),
      policyEnrichmentCount: scanRecord.policyEnrichment.length,
      verifiedPublicSurfacesCount: getFiniteNumber(scanRecord.snapshot?.verified_public_surfaces_count)
    },
    mergedSignals: scanRecord.mergedSignals,
    policyEnrichment: scanRecord.policyEnrichment,
    reviewFindingCandidates: allReviewFindingCandidates,
    scanEvents: scanRecord.events,
    validationFindings: scanRecord.validationFindings,
    validationFindingLookup
  }).filter((finding) => finding.presentationDecision.status !== "suppress"));

  return {
    allReviewFindingCandidates,
    globalUnifiedFindings,
    sectionDrafts
  };
}

export function selectOwnerUnifiedFindingsForSection(
  findings: UnifiedFindingDisplayPacket[],
  sectionCategoryIds: Set<string>
) {
  const reviewFindings = findings.filter((finding) =>
    finding.categoryAlignments.some((alignment) => sectionCategoryIds.has(alignment.evidenceCategoryId))
  );

  return reviewFindings.filter((finding) => {
    const ownerCategoryId = finding.categoryAlignments.find((alignment) => alignment.relation === "owner")?.evidenceCategoryId;
    return ownerCategoryId ? sectionCategoryIds.has(ownerCategoryId) : false;
  });
}

export function selectOwnerUnifiedFindings(state: ScanReportUnifiedFindingState) {
  return [
    ...new Map(
      state.sectionDrafts
        .flatMap(({ sections }) =>
          sections.flatMap((section) =>
            selectOwnerUnifiedFindingsForSection(state.globalUnifiedFindings, section.sectionCategoryIds)
          )
        )
        .map((finding) => [finding.unifiedFindingId, finding])
    ).values()
  ];
}

export function buildScanReportUnifiedFindings(state: ScanReportUnifiedFindingState) {
  return selectOwnerUnifiedFindings(state);
}
