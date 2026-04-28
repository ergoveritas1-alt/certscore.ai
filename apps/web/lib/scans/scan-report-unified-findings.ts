import {
  REPORT_PRIMARY_PILLARS,
  getReportEvidenceCategoriesForSection,
  getReportSectionsForPillar,
  getReportSignalsForEvidenceCategory,
  type PreviewSampleFinding,
  type ReportEvidenceCategoryDefinition,
  type ReportPrimaryPillarDefinition,
  type ReportSectionDefinition
} from "@website-signal-risk-scanner/shared";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { buildValidationFindingLookup } from "./validation-review-linking";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { getReportSignalValue, isSignalValuePopulated } from "./report-signal-values";
import {
  buildReviewFindings,
  buildSectionReviewIssues,
  formatReviewIssueDescription,
  type AccessibilityIssueRow,
  type AccessibilityRuleEvidenceRow,
  type CanonicalReviewFinding,
  type CanonicalSignalItem,
  type PolicyBehaviorContradiction,
  type PreconsentViolationRow,
  type ScanReportReviewIssueRow
} from "./scan-report-review-findings";
import { groupSnapshotFieldsByPrimaryCategory } from "./signal-taxonomy";

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
  derivedContext: {
    accessibilityIssueRows: AccessibilityIssueRow[];
    accessibilityRuleEvidenceRows: AccessibilityRuleEvidenceRow[];
    consentAuditFindings: PreviewSampleFinding[];
    policyBehaviorContradictions: PolicyBehaviorContradiction[];
    preconsentViolationRows: PreconsentViolationRow[];
    prioritizedAccessibilityRuleRows: AccessibilityRuleEvidenceRow[];
    scanReportReviewIssues: ScanReportReviewIssueRow[];
    taxonomySnapshotSections: Array<{ description: string; fields: string[]; title: string }>;
  };
  globalUnifiedFindings: UnifiedFindingDisplayPacket[];
  sectionDrafts: Array<{
    pillar?: ReportPrimaryPillarDefinition;
    sections: ScanReportUnifiedFindingSectionDraft[];
  }>;
};

export type ScanReportUnifiedFindingStateDependencies = {
  deriveAccessibilityIssueRows: (snapshot: Record<string, unknown>) => AccessibilityIssueRow[];
  deriveAccessibilityRuleEvidenceRows: (input: {
    examples: NonNullable<ScanDetailResponse["accessibilityRuleExamples"]>;
    ruleCounts: NonNullable<ScanDetailResponse["accessibilityRuleCounts"]>;
  }) => AccessibilityRuleEvidenceRow[];
  deriveConsentAuditFindings: (
    snapshot: Record<string, unknown> | null,
    runtimeArtifacts: Record<string, unknown> | null
  ) => PreviewSampleFinding[];
  derivePolicyBehaviorContradictions: (input: {
    mergedSignals: ScanDetailResponse["mergedSignals"];
    primaryPolicyEnrichment: ScanDetailResponse["primaryPolicyEnrichment"];
    policyEnrichments: ScanDetailResponse["policyEnrichment"];
    preconsentViolations: PreconsentViolationRow[];
    runtimeArtifacts: Record<string, unknown> | null;
    snapshot: Record<string, unknown> | null;
    trackerVendors: ScanDetailResponse["trackerVendors"];
  }) => PolicyBehaviorContradiction[];
  derivePreconsentViolationRows: (input: {
    persistedViolations: ScanDetailResponse["preconsentViolations"];
    runtimeArtifacts: Record<string, unknown> | null;
    trackerVendors: ScanDetailResponse["trackerVendors"];
  }) => PreconsentViolationRow[];
  filterContradictoryPositiveSurfaceFindings: (findings: UnifiedFindingDisplayPacket[]) => UnifiedFindingDisplayPacket[];
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
      globalUnifiedFindings: [],
      sectionDrafts: []
    };
  }

  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const policyEnrichmentById = new Map(scanRecord.policyEnrichment.map((row) => [String(row.id ?? ""), row]));
  const scanReportReviewIssues = scanRecord.policyReviewQueue.map((row, index) => {
    const enrichment = policyEnrichmentById.get(String(row.policyEnrichmentId ?? row.policy_enrichment_id ?? "")) ?? null;

    return {
      description: formatReviewIssueDescription(String(row.reason ?? "")),
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
  const taxonomySnapshotSections = groupSnapshotFieldsByPrimaryCategory(Object.keys(snapshot)).map((group) => ({
    title: group.category.label,
    description: group.category.description,
    fields: group.entries.map((entry) => entry.key)
  }));
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
            value: getReportSignalValue({
              mergedSignals: scanRecord.mergedSignals,
              policyEnrichment: scanRecord.policyEnrichment,
              runtimeArtifacts: scanRecord.runtimeArtifacts,
              signals: scanRecord.signals,
              snapshot: scanRecord.snapshot,
              signal
            })
          }))
          .filter((item) => isSignalValuePopulated(item.key, item.value))
          .sort((left, right) => {
            const relationOrder = { primary: 0, secondary: 1, overlay: 2 } as const;
            return relationOrder[left.relation] - relationOrder[right.relation] || left.label.localeCompare(right.label);
          });

        const reviewFindings = buildReviewFindings({
          allSignals: scanRecord.signals,
          categoryId: category.id,
          issues: [],
          macroEnrichment: scanRecord.macroEnrichment,
          mergedSignals: scanRecord.mergedSignals,
          policyEnrichment: scanRecord.policyEnrichment,
          prioritizedAccessibilityRuleRows,
          runtimeArtifacts: scanRecord.runtimeArtifacts,
          signalHitRows: scanRecord.signalHits,
          snapshot,
          sectionId: section.id,
          sectionItems: items,
          trackerVendors: scanRecord.trackerVendors,
          validationFindingLookup
        });

        return {
          category,
          emptySignalCount: getReportSignalsForEvidenceCategory(category.id).length - items.length,
          items,
          reviewFindings
        };
      });

      const issues = buildSectionReviewIssues({
        accessibilityIssueRows,
        consentAuditFindings,
        pageEvidenceRows: scanRecord.pageEvidence,
        policyBehaviorContradictions,
        preconsentViolationRows,
        runtimeArtifacts,
        scanReportReviewIssues,
        sectionId: section.id,
        signalHitRows: scanRecord.signalHits,
        snapshot
      });
      const issueFindings = buildReviewFindings({
        allSignals: scanRecord.signals,
        issues,
        macroEnrichment: scanRecord.macroEnrichment,
        mergedSignals: scanRecord.mergedSignals,
        policyEnrichment: scanRecord.policyEnrichment,
        prioritizedAccessibilityRuleRows,
        runtimeArtifacts: scanRecord.runtimeArtifacts,
        signalHitRows: scanRecord.signalHits,
        snapshot,
        sectionId: section.id,
        sectionItems: [],
        trackerVendors: scanRecord.trackerVendors,
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
    macroEnrichment: scanRecord.macroEnrichment,
    mergedSignals: scanRecord.mergedSignals,
    policyEnrichment: scanRecord.policyEnrichment,
    reviewFindingCandidates: allReviewFindingCandidates,
    scanEvents: scanRecord.events,
    validationFindings: scanRecord.validationFindings,
    validationFindingLookup
  }).filter((finding) => finding.presentationDecision.status !== "suppress"));

  return {
    allReviewFindingCandidates,
    derivedContext: {
      accessibilityIssueRows,
      accessibilityRuleEvidenceRows,
      consentAuditFindings,
      policyBehaviorContradictions,
      preconsentViolationRows,
      prioritizedAccessibilityRuleRows,
      scanReportReviewIssues,
      taxonomySnapshotSections
    },
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
